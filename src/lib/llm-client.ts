/**
 * LLM API 调用工具
 * 统一使用 OpenAI 兼容的自定义 LLM API
 * 配置环境变量：
 *   LLM_API_KEY          - API 密钥（必填）
 *   LLM_BASE_URL         - API 地址（必填）
 *   LLM_MODEL            - 主模型，文本+图片共用（必填，默认 gpt-4o）
 *   LLM_VISION_MODEL     - 图片识别专用模型（可选，不填则用 LLM_MODEL）
 *   LLM_FALLBACK_MODELS  - 失败时降级模型列表，英文逗号分隔（可选）
 *                          文本用纯文本模型，图片用带视觉能力的模型
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
  model?: string;
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
 * 获取图片识别专用模型配置
 * 优先级：LLM_VISION_MODEL > LLM_MODEL
 */
function getVisionModel(): string {
  return process.env.LLM_VISION_MODEL || process.env.LLM_MODEL || 'gpt-4o';
}

/**
 * 获取 fallback 模型列表
 * LLM_FALLBACK_MODELS 逗号分隔，例如：gpt-4o-mini, deepseek-chat
 */
function getFallbackModels(vision: boolean = false): string[] {
  if (vision && process.env.LLM_VISION_FALLBACK_MODELS) {
    return process.env.LLM_VISION_FALLBACK_MODELS
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
  }
  if (process.env.LLM_FALLBACK_MODELS) {
    return process.env.LLM_FALLBACK_MODELS
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * 检测是否为豆包 API（基于 baseUrl）
 * 豆包多模态使用 /responses 端点，格式与 OpenAI 不同
 */
function isDoubaoApi(baseUrl: string): boolean {
  return baseUrl.includes('volces.com') || baseUrl.includes('bytedance');
}

/**
 * 判断一个错误是否需要 fallback 重试
 * - 5xx 服务端错误
 * - model_not_found / 模型不可用 / 渠道不可用
 * - 限流 429（可选，这里先不重试限流）
 */
function isFallbackError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);

  // 5xx 服务端错误
  if (/LLM API error: 5\d\d/.test(msg)) return true;

  // 模型/渠道不可用
  if (/model_not_found/i.test(msg)) return true;
  if (/No available channel/i.test(msg)) return true;
  if (/渠道/.test(msg) && /不可用|关闭|维护/.test(msg)) return true;
  if (/channel.*not.*available/i.test(msg)) return true;

  return false;
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
    model: data.model || finalConfig.model,
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
    model: data.model || config.model,
    usage: data.usage,
  };
}

/**
 * 带 fallback 重试的执行函数
 * 依次尝试 主模型 + fallback 列表，只要成功就返回
 * 所有模型都失败则抛出最后一个错误
 */
async function callWithFallback<T>(
  models: string[],
  executor: (model: string) => Promise<T>
): Promise<T> {
  let lastError: unknown = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const result = await executor(model);
      return result;
    } catch (err) {
      lastError = err;
      // 只有可 fallback 的错误才继续，其他直接抛
      if (!isFallbackError(err)) {
        throw err;
      }
      // 最后一个模型失败了，不再继续
      if (i === models.length - 1) {
        break;
      }
      // 记录一下，继续试下一个
      console.warn(`[LLM] 模型 ${model} 不可用，尝试下一个...`, err instanceof Error ? err.message : String(err));
    }
  }

  throw lastError;
}

/**
 * 调用 LLM（文本）
 * 支持 fallback 模型降级
 */
async function callLLM(messages: Message[], config?: Partial<LLMConfig>): Promise<LLMResponse> {
  const defaultConfig = getLLMConfig();
  const baseConfig = {
    apiKey: config?.apiKey || defaultConfig.apiKey,
    baseUrl: config?.baseUrl || defaultConfig.baseUrl,
  };
  const primaryModel = config?.model || defaultConfig.model;
  const fallbackModels = getFallbackModels(false);

  const models = [primaryModel, ...fallbackModels];

  return callWithFallback(models, (model) =>
    callCustomLLM(messages, { ...baseConfig, model })
  );
}

/**
 * 调用多模态模型（支持图片输入）
 * 自动检测豆包/OpenAI 兼容格式，支持 fallback 模型降级
 */
async function callVisionLLM(
  textPrompt: string,
  imageUrls: string[],
  config?: Partial<LLMConfig>
): Promise<LLMResponse> {
  const defaultConfig = getLLMConfig();
  const baseConfig = {
    apiKey: config?.apiKey || defaultConfig.apiKey,
    baseUrl: config?.baseUrl || defaultConfig.baseUrl,
  };
  const primaryModel = config?.model || getVisionModel();
  const fallbackModels = getFallbackModels(true);

  const models = [primaryModel, ...fallbackModels];

  return callWithFallback(models, (model) => {
    const fullConfig = { ...baseConfig, model };

    // 豆包 API 使用 /responses 端点
    if (isDoubaoApi(fullConfig.baseUrl)) {
      return callDoubaoVision(textPrompt, imageUrls, fullConfig);
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

    return callCustomLLM(messages, fullConfig);
  });
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

export { getLLMConfig, callLLM, callVisionLLM, hasLLMConfig, getVisionModel };
export type { LLMConfig, LLMResponse, Message };
