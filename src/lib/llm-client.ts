/**
 * OpenAI 兼容 API 调用工具
 * 支持 OpenAI、DeepSeek、Kimi 等兼容 OpenAI API 格式的服务商
 */

interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
}

interface LLMResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

function getLLMConfig(): LLMConfig {
  // 从环境变量获取配置
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.LLM_MODEL || 'gpt-4o';

  if (!apiKey) {
    throw new Error('LLM_API_KEY is not set. Please configure your LLM API key in environment variables.');
  }

  return { apiKey, baseUrl, model };
}

/**
 * 调用 OpenAI 兼容的 Chat Completion API
 */
async function callLLM(messages: Message[], config?: Partial<LLMConfig>): Promise<LLMResponse> {
  const finalConfig = config || getLLMConfig();

  const response = await fetch(`${finalConfig.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${finalConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: finalConfig.model,
      messages,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  return {
    content: data.choices[0]?.message?.content || '',
    usage: data.usage,
  };
}

/**
 * 调用多模态模型（支持图片输入）
 */
async function callVisionLLM(
  textPrompt: string,
  imageUrls: string[],
  config?: Partial<LLMConfig>
): Promise<LLMResponse> {
  const finalConfig = config || getLLMConfig();

  // 构建多模态消息内容
  const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
    { type: 'text', text: textPrompt },
  ];

  // 添加图片
  for (const imageUrl of imageUrls) {
    content.push({
      type: 'image_url',
      image_url: { url: imageUrl },
    });
  }

  const messages: Message[] = [
    {
      role: 'user',
      content,
    },
  ];

  return callLLM(messages, finalConfig);
}

export { getLLMConfig, callLLM, callVisionLLM };
export type { LLMConfig, LLMResponse, Message };