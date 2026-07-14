/**
 * LLM API 调用工具
 * 统一使用 OpenAI 兼容的自定义 LLM API
 * 配置环境变量：LLM_API_KEY、LLM_BASE_URL、LLM_MODEL
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
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.LLM_MODEL || 'gpt-4o';

  if (!apiKey) {
    throw new Error('LLM_API_KEY 未配置。请在环境变量中设置 LLM_API_KEY、LLM_BASE_URL、LLM_MODEL。');
  }

  return { apiKey, baseUrl, model };
}

/**
 * 检测是否为豆包 API（基于 baseUrl）
 * 豆包多模态使用 /responses 端点，格式与 OpenAI 不同
 */
function isDoubaoApi(baseUrl: string): boolean {
  return baseUrl.includes('volces.com') || baseUrl.includes('bytedance');
}

/**
 * 调用 OpenAI 兼容的 Chat Completion API（文本）
 */
async function callCustomLLM(messages: Message[], config?: Partial<LLMConfig>): Promise<LLMResponse> {
  const defaultConfig = getLLMConfig();
  const finalConfig = {
    apiKey: config?.apiKey || defaultConfig.apiKey,
    baseUrl: config?.baseUrl || defaultConfig.baseUrl,
    model: config?.model || defaultConfig.model,
  };

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
    if (errorText.trim().startsWith('<!doctype') || errorText.trim().startsWith('<html')) {
      throw new Error(`LLM API 返回了 HTML 页面（可能是 API 地址错误或 Key 无效）。请检查 LLM_BASE_URL 和 LLM_API_KEY 配置。原始响应：${errorText.substring(0, 200)}...`);
    }
    throw new Error(`LLM API error: ${response.status} - ${errorText}`);
  }

  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`LLM API 返回了无效 JSON。响应内容：${responseText.substring(0, 200)}...`);
  }

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
  config: LLMConfig
): Promise<LLMResponse> {
  const inputContent: Array<{ type: string; image_url?: string; text?: string }> = [];

  for (const imageUrl of imageUrls) {
    inputContent.push({
      type: 'input_image',
      image_url: imageUrl,
    });
  }

  inputContent.push({
    type: 'input_text',
    text: textPrompt,
  });

  const response = await fetch(`${config.baseUrl}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
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
    if (errorText.trim().startsWith('<!doctype') || errorText.trim().startsWith('<html')) {
      throw new Error(`LLM API 返回了 HTML 页面（可能是 API 地址错误或 Key 无效）。请检查 LLM_BASE_URL 和 LLM_API_KEY 配置。原始响应：${errorText.substring(0, 200)}...`);
    }
    throw new Error(`LLM API error: ${response.status} - ${errorText}`);
  }

  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`LLM API 返回了无效 JSON。响应内容：${responseText.substring(0, 200)}...`);
  }

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
 * 调用 LLM（文本）
 */
async function callLLM(messages: Message[], config?: Partial<LLMConfig>): Promise<LLMResponse> {
  return callCustomLLM(messages, config);
}

/**
 * 调用多模态模型（支持图片输入）
 * 自动检测豆包/OpenAI 兼容格式
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

  // 豆包 API 使用 /responses 端点
  if (isDoubaoApi(finalConfig.baseUrl)) {
    return callDoubaoVision(textPrompt, imageUrls, finalConfig);
  }

  // OpenAI 兼容格式（OpenAI、中转 API 等）
  const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
    { type: 'text', text: textPrompt },
  ];

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

  return callCustomLLM(messages, finalConfig);
}

/**
 * 检查是否有可用的 LLM 配置
 */
function hasLLMConfig(): boolean {
  try {
    getLLMConfig();
    return true;
  } catch {
    return false;
  }
}

export { getLLMConfig, callLLM, callVisionLLM, hasLLMConfig };
export type { LLMConfig, LLMResponse, Message };
