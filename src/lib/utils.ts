import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 安全解析 image_urls 字段
 * - 空值 → []
 * - 数组 → 直接返回
 * - 字符串 → JSON.parse，失败返回 []
 */
export function safeParseImageUrls(value: unknown): string[] {
  try {
    if (!value) return [];
    if (Array.isArray(value)) return value as string[];
    if (typeof value === "string") {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * 从面经内容中识别所有面试轮次，并合并为岗位名称后缀
 *
 * 规则：
 * - 一面/二面/三面/... → 合并为 "一二三面"
 * - HR面 → 单独加 "+HR面"
 * - 终面 → 单独加 "+终面"
 * - 群面 / 初面等其他轮次 → 追加到末尾
 *
 * 返回示例：
 *   "一二三面+HR面"
 *   "一二面"
 *   "一面"
 *   "一二三面+终面"
 */
export function extractRoundsFromContent(content: string): string {
  if (!content) return '';

  // 定义轮次类型，按出现顺序收集
  const numberedRounds: string[] = []; // 一面/二面/三面... → 收集"一""二""三"...
  const otherRounds: string[] = [];    // HR面 / 终面 / 群面 / 初面 / 技术面...

  const found = new Set<string>();

  // 匹配【一面】【二面】等常见格式，也匹配 "一面" "二面" 等文本
  const roundPatterns: { key: string; regex: RegExp }[] = [
    { key: '一面', regex: /【?\s*一\s*面\s*】?/g },
    { key: '二面', regex: /【?\s*二\s*面\s*】?/g },
    { key: '三面', regex: /【?\s*三\s*面\s*】?/g },
    { key: '四面', regex: /【?\s*四\s*面\s*】?/g },
    { key: '五面', regex: /【?\s*五\s*面\s*】?/g },
    { key: '六面', regex: /【?\s*六\s*面\s*】?/g },
    { key: 'HR面', regex: /【?\s*HR\s*面\s*】?/gi },
    { key: '终面', regex: /【?\s*终\s*面\s*】?/g },
    { key: '群面', regex: /【?\s*群\s*面\s*】?/g },
    { key: '初面', regex: /【?\s*初\s*面\s*】?/g },
    { key: '技术面', regex: /【?\s*技术\s*面\s*】?/g },
    { key: '电话面', regex: /【?\s*电话\s*面\s*】?/g },
    { key: '视频面', regex: /【?\s*视频\s*面\s*】?/g },
    { key: '现场面', regex: /【?\s*现场\s*面\s*】?/g },
  ];

  for (const { key, regex } of roundPatterns) {
    if (regex.test(content) && !found.has(key)) {
      found.add(key);
      if (/^[一二三四五六]面$/.test(key)) {
        numberedRounds.push(key.charAt(0));
      } else {
        otherRounds.push(key);
      }
    }
  }

  // 组装后缀
  let suffix = '';
  if (numberedRounds.length > 0) {
    suffix += numberedRounds.join('') + '面';
  }

  if (otherRounds.length > 0) {
    if (suffix) {
      suffix += '+' + otherRounds.join('+');
    } else {
      suffix = otherRounds.join('+');
    }
  }

  return suffix;
}

/**
 * 根据原始岗位名 + 面经内容，生成含完整轮次的岗位名称
 *
 * - 如果岗位里已经包含所有识别到的轮次，不重复添加
 * - 如果岗位里只有部分轮次，用 content 中识别到的补齐
 * - 没有岗位 → "未知岗位" + 轮次
 * - 没有岗位也没有轮次 → "未知岗位"
 */
export function buildPositionWithRounds(
  position: string | undefined | null,
  content: string,
): string {
  const cleanPos = (position || '').replace(/未知岗位?|未知/g, '').trim();
  const roundSuffix = extractRoundsFromContent(content);

  // 如果岗位名本身就已经包含轮次信息，就不重复加
  if (roundSuffix && cleanPos) {
    // 检查岗位名里是否已经含有所有轮次关键词
    let alreadyHasAllRounds = true;
    const rounds = roundSuffix.split('+');
    for (const r of rounds) {
      // 把"一二三面"拆成 "一面"、"二面"、"三面" 检查
      const numberedMatch = r.match(/^([一二三四五六]+)面$/);
      if (numberedMatch) {
        for (const ch of numberedMatch[1]) {
          if (!cleanPos.includes(ch + '面')) {
            alreadyHasAllRounds = false;
            break;
          }
        }
      } else {
        if (!cleanPos.includes(r)) {
          alreadyHasAllRounds = false;
        }
      }
      if (!alreadyHasAllRounds) break;
    }

    if (alreadyHasAllRounds) {
      return cleanPos;
    }

    // 移除岗位名里已有的单轮次后缀，再追加完整轮次
    let basePos = cleanPos;
    // 去掉末尾常见的轮次词（一面/二面/HR面/终面/群面 等）
    basePos = basePos.replace(/(一|二|三|四|五|六)面$/, '');
    basePos = basePos.replace(/(HR面|终面|群面|初面|技术面|电话面|视频面|现场面)$/, '');
    basePos = basePos.trim();

    return basePos + roundSuffix;
  }

  if (roundSuffix && !cleanPos) {
    return '未知岗位' + roundSuffix;
  }

  if (cleanPos) {
    return cleanPos;
  }

  return '未知岗位';
}
