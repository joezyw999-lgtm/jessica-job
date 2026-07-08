/**
 * LLM API 调用工具
 * 支持:
 * - Coze 沙箱环境: 使用 coze-coding-dev-sdk
 * - Vercel/其他环境: 使用自定义 LLM API（支持豆包/OpenAI 格式）
 */

// 静态导入类型（仅用于类型检查，不会影响运行时）
import type { Message as CozeMessage, ContentPart as CozeContentPart } from 'coze-coding-dev-sdk';

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

/**
 * 检测当前环境
 */
function getEnvironment(): 'coze' | 'custom' {
  // Coze 环境会有这些变量（注意变量名）
  const hasCozeEnv = process.env.COZE_WORKLOAD_API_TOKEN || process.env.COZE_PROJECT_SPACE_ID || process.env.COZE_LOOP_API_TOKEN;
  // 自定义 API 环境需要 LLM_API_KEY
  const hasCustomApiKey = process.env.LLM_API_KEY;
  
  // 优先使用自定义 API（如果配置了）
  if (hasCustomApiKey) {
    return 'custom';
  }
  
  // 否则用 Coze SDK
  if (hasCozeEnv) {
    return 'coze';
  }
  
  // 默认尝试自定义 API
  return 'custom';
}

function getLLMConfig(): LLMConfig {
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
 * 调用 Coze SDK（仅在后端可用）- 文本调用
 */
async function callCozeLLM(messages: Message[]): Promise<LLMResponse> {
  // 动态导入 Coze SDK（仅后端）
  const { LLMClient } = await import('coze-coding-dev-sdk');
  
  // 将 Message 转换为 Coze SDK 格式
  const cozeMessages: CozeMessage[] = messages.map(m => {
    let content: string | CozeContentPart[];
    if (typeof m.content === 'string') {
      content = m.content;
    } else {
      content = m.content.map(c => {
        if (c.type === 'text') {
          return { type: 'text' as const, text: c.text };
        } else {
          return { type: 'image_url' as const, image_url: { url: c.image_url.url } };
        }
      });
    }
    return {
      role: m.role,
      content,
    };
  });
  
  const client = new LLMClient();
  
  const response = await client.invoke(cozeMessages, {
    model: 'doubao-seed-2-0-pro-260215',
  });
  
  return {
    content: response.content || '',
  };
}

/**
 * 调用 Coze SDK（仅在后端可用）- 多模态调用
 */
async function callCozeVision(textPrompt: string, imageUrls: string[]): Promise<LLMResponse> {
  // 动态导入 Coze SDK（仅后端）
  const { LLMClient } = await import('coze-coding-dev-sdk');
  
  // 构建多模态消息
  const content: CozeContentPart[] = [
    { type: 'text', text: textPrompt },
  ];
  
  for (const imageUrl of imageUrls) {
    content.push({
      type: 'image_url',
      image_url: { url: imageUrl },
    });
  }
  
  const messages: CozeMessage[] = [
    {
      role: 'user',
      content,
    },
  ];
  
  const client = new LLMClient();
  
  const response = await client.invoke(messages, {
    model: 'doubao-seed-2-0-pro-260215',
  });
  
  return {
    content: response.content || '',
  };
}

/**
 * 调用 OpenAI 兼容的 Chat Completion API
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
  config: LLMConfig
): Promise<LLMResponse> {
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
 * 调用 LLM（文本）
 * 自动检测环境并选择正确的 API
 */
async function callLLM(messages: Message[], config?: Partial<LLMConfig>): Promise<LLMResponse> {
  const env = getEnvironment();
  
  // Coze 环境使用 Coze SDK
  if (env === 'coze') {
    return callCozeLLM(messages);
  }
  
  // 自定义 API 环境
  return callCustomLLM(messages, config);
}

/**
 * 调用多模态模型（支持图片输入）
 * 自动检测环境并选择正确的 API
 */
async function callVisionLLM(
  textPrompt: string,
  imageUrls: string[],
  config?: Partial<LLMConfig>
): Promise<LLMResponse> {
  const env = getEnvironment();
  
  // Coze 环境使用 Coze SDK
  if (env === 'coze') {
    return callCozeVision(textPrompt, imageUrls);
  }
  
  // 自定义 API 环境
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

/**
 * 检查是否在 Coze 环境
 */
function isCozeEnvironment(): boolean {
  return getEnvironment() === 'coze';
}

export { getLLMConfig, callLLM, callVisionLLM, hasLLMConfig, isCozeEnvironment };
export type { LLMConfig, LLMResponse, Message };