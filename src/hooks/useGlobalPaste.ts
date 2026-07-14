"use client";

import { useEffect } from "react";

interface UseGlobalPasteOptions {
  /** 粘贴回调 */
  onPaste: (e: ClipboardEvent) => void;
  /** 是否启用监听，默认 true */
  enabled?: boolean;
}

/**
 * 全局粘贴监听 Hook
 * - 监听 document 的 paste 事件
 * - 回调中自行处理图片/文本判断
 */
export function useGlobalPaste(options: UseGlobalPasteOptions | ((e: ClipboardEvent) => void)) {
  const { onPaste, enabled = true } =
    typeof options === "function" ? { onPaste: options } : options;

  useEffect(() => {
    if (!enabled) return;

    const handlePaste = (e: ClipboardEvent) => {
      onPaste(e);
    };

    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, [onPaste, enabled]);
}
