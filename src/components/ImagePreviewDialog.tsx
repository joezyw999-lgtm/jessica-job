"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface ImagePreviewDialogProps {
  /** 当前记录 */
  record: {
    imageUrl?: string;
    imageUrls?: string[];
    company?: string;
    position?: string;
  } | null;
  /** 是否打开 */
  open: boolean;
  /** 关闭/打开控制 */
  onOpenChange: (open: boolean) => void;
  /** 初始图片索引（多图时） */
  initialIndex?: number;
  /** 索引变化回调（可选） */
  onIndexChange?: (index: number) => void;
}

export function ImagePreviewDialog({
  record,
  open,
  onOpenChange,
  initialIndex = 0,
  onIndexChange,
}: ImagePreviewDialogProps) {
  const imageUrls = record?.imageUrls && record.imageUrls.length > 0
    ? record.imageUrls
    : record?.imageUrl
      ? [record.imageUrl]
      : [];

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const total = imageUrls.length;

  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
    }
  }, [open, initialIndex]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => {
      const next = prev > 0 ? prev - 1 : total - 1;
      onIndexChange?.(next);
      return next;
    });
  }, [total, onIndexChange]);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => {
      const next = prev < total - 1 ? prev + 1 : 0;
      onIndexChange?.(next);
      return next;
    });
  }, [total, onIndexChange]);

  // 键盘导航
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      } else if (e.key === "ArrowLeft" && total > 1) {
        goPrev();
      } else if (e.key === "ArrowRight" && total > 1) {
        goNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, total, goPrev, goNext, onOpenChange]);

  if (!open || !record) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
      onClick={() => onOpenChange(false)}
    >
      {/* 关闭按钮 */}
      <button
        onClick={() => onOpenChange(false)}
        className="absolute top-4 right-4 p-2 rounded-full transition-colors hover:bg-white/10"
        style={{ color: "#fff" }}
      >
        <X className="h-6 w-6" />
      </button>

      {/* 图片信息 */}
      <div className="absolute top-4 left-4 text-white">
        <p className="text-lg font-semibold">{record.company || "面经图片"}</p>
        {record.position && (
          <p className="text-sm opacity-75">{record.position}</p>
        )}
        {total > 1 && (
          <p className="text-xs mt-1 opacity-60">
            {currentIndex + 1} / {total}
          </p>
        )}
      </div>

      {/* 左箭头 */}
      {total > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          className="absolute left-4 p-2 rounded-full transition-colors hover:bg-white/10"
          style={{ color: "#fff" }}
        >
          <ChevronLeft className="h-8 w-8" />
        </button>
      )}

      {/* 图片 */}
      <div
        className="max-w-[90vw] max-h-[85vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {imageUrls[currentIndex] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrls[currentIndex]}
            alt={record.company || "面经图片"}
            className="max-w-full max-h-[85vh] object-contain rounded"
          />
        ) : (
          <div className="text-white opacity-50">暂无图片</div>
        )}
      </div>

      {/* 右箭头 */}
      {total > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          className="absolute right-4 p-2 rounded-full transition-colors hover:bg-white/10"
          style={{ color: "#fff" }}
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      )}
    </div>
  );
}
