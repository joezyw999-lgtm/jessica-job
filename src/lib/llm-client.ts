/**
 * LLM API 调用工具
 * 支持 OpenAI 兼容格式（OpenAI、DeepSeek）和豆包专用格式
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
 * 检测是否为豆包 API（基于 baseUrl）
 */
function isDoubaoApi(baseUrl: string): boolean {
  return baseUrl.includes('volces.com') || baseUrl.includes('bytedance');
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
 * 调用豆包多模态 API（/responses 端点）
 */
async function callDoubaoVision(
  textPrompt: string,
  imageUrls: string[],
  config?: Partial<LLMConfig>
): Promise<LLMResponse> {
  const finalConfig = config || getLLMConfig();

  // 构建豆包格式的 input
  const inputContent: Array<{ type: string; image_url?: string; text?: string }> = [];
  
  // 添加图片
  for (const imageUrl of imageUrls) {
    inputContent.push({
      type: 'input_image',
      image_url: imageUrl,
    });
  }
  
  // 添加文本
  inputContent.push({
    type: 'input_text',
    text: textPrompt,
  });

  const response = await fetch(`${finalConfig.baseUrl}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${finalConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: finalConfig.model,
      input: [
        {
          role: 'user',
          content: inputContent,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Doubao API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  // 豆包返回格式：output[].content[].text
  let content = '';
  if (data.output && Array.isArray(data.output)) {
    for (const output of data.output) {
      if (output.type === 'message' && output.content) {
        for (const item of output.content) {
          if (item.type === 'output_text' && item.text) {
            content += item.text;
          }
        }
      }
    }
  }
  
  return {
    content,
    usage: data.usage,
  };
}

/**
 * 调用多模态模型（支持图片输入）
 * 自动检测 API 类型并使用对应的格式
 */
async function callVisionLLM(
  textPrompt: string,
  imageUrls: string[],
  config?: Partial<LLMConfig>
): Promise<LLMResponse> {
  const defaultConfig = getLLMConfig();
  const finalConfig = {
    apiKey: config?.apiKey || defaultConfig.apiKey,
    baseUrl: config?.baseUrl || defaultConfig.baseUrl,
    model: config?.model || defaultConfig.model,
  };

  // 检测是否为豆包 API
  if (isDoubaoApi(finalConfig.baseUrl)) {
    return callDoubaoVision(textPrompt, imageUrls, finalConfig);
  }

  // OpenAI 兼容格式（OpenAI、DeepSeek 等）
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