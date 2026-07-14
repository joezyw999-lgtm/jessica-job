"use client";

import { useState } from "react";
import { ClipboardPaste, X, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImagePastePanelProps {
  /** 粘贴闪烁状态 */
  pasteFlash: boolean;
  /** 模式：single 单张立即识别，multi 多张批量 */
  pasteMode: "single" | "multi";
  onModeChange: (mode: "single" | "multi") => void;
  /** 待提交图片（多张模式） */
  pendingFiles: { id: string; file: File; preview: string }[];
  onClearPending: () => void;
  onRemovePending: (id: string) => void;
  onSubmit: () => void;
}

export function ImagePastePanel({
  pasteFlash,
  pasteMode,
  onModeChange,
  pendingFiles,
  onClearPending,
  onRemovePending,
  onSubmit,
}: ImagePastePanelProps) {
  const handleModeChange = (mode: "single" | "multi") => {
    if (mode === "single" && pendingFiles.length > 0) {
      onClearPending();
    }
    onModeChange(mode);
  };

  return (
    <div className="shrink-0 p-4">
      {/* 单张/多张切换 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium" style={{ color: "#6B7280" }}>模式</span>
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: "#E5E2DD" }}>
          <button
            onClick={() => handleModeChange("single")}
            className="px-3 py-1 text-xs font-medium transition-colors"
            style={{
              backgroundColor: pasteMode === "single" ? "#2D6A6A" : "#FFFFFF",
              color: pasteMode === "single" ? "#FFFFFF" : "#6B7280",
            }}
          >
            单张
          </button>
          <button
            onClick={() => handleModeChange("multi")}
            className="px-3 py-1 text-xs font-medium transition-colors"
            style={{
              backgroundColor: pasteMode === "multi" ? "#2D6A6A" : "#FFFFFF",
              color: pasteMode === "multi" ? "#FFFFFF" : "#6B7280",
            }}
          >
            多张
          </button>
        </div>
        <span className="text-xs" style={{ color: "#9CA3AF" }}>
          {pasteMode === "single" ? "粘贴即识别" : "粘贴后提交识别"}
        </span>
      </div>

      {/* 统一粘贴区 */}
      <div
        className="rounded-xl border-2 border-dashed transition-all duration-300 cursor-default"
        style={{
          borderColor: pasteFlash ? "#2D6A6A" : "#E5E2DD",
          backgroundColor: pasteFlash ? "rgba(45,106,106,0.06)" : "#F8F7F5",
        }}
      >
        <div className="flex flex-col items-center justify-center py-6 px-4">
          <div
            className="mb-3 flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-300"
            style={{
              backgroundColor: pasteFlash ? "rgba(45,106,106,0.15)" : "#EDEBE8",
            }}
          >
            <ClipboardPaste
              className="h-5 w-5 transition-colors duration-300"
              style={{ color: pasteFlash ? "#2D6A6A" : "#6B7280" }}
            />
          </div>
          <p className="text-sm font-medium" style={{ color: "#1A1A1A" }}>
            {pasteFlash ? "已粘贴" : "Ctrl+V 粘贴面经"}
          </p>
          <p className="mt-1 text-xs" style={{ color: "#6B7280" }}>
            支持粘贴图片或文字，自动识别类型
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <kbd
              className="inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium"
              style={{
                borderColor: "#E5E2DD",
                backgroundColor: "#FFFFFF",
                color: "#6B7280",
              }}
            >
              Ctrl
            </kbd>
            <span className="text-xs" style={{ color: "#9CA3AF" }}>+</span>
            <kbd
              className="inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium"
              style={{
                borderColor: "#E5E2DD",
                backgroundColor: "#FFFFFF",
                color: "#6B7280",
              }}
            >
              V
            </kbd>
          </div>
        </div>
      </div>

      {/* 待提交图片区（仅多张模式） */}
      {pasteMode === "multi" && pendingFiles.length > 0 && (
        <div className="shrink-0 pt-3">
          <div
            className="rounded-lg border p-3"
            style={{ borderColor: "#D4853A", backgroundColor: "rgba(212,133,58,0.04)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: "#D4853A" }}>
                待提交 ({pendingFiles.length} 张)
              </span>
              <button
                onClick={onClearPending}
                className="text-xs flex items-center gap-0.5 hover:underline"
                style={{ color: "#9CA3AF" }}
              >
                <X className="h-3 w-3" />
                清空
              </button>
            </div>
            {/* 缩略图网格 */}
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {pendingFiles.map((pf) => (
                <div key={pf.id} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pf.preview}
                    alt="待识别"
                    className="w-full aspect-square object-cover rounded-md border"
                    style={{ borderColor: "#E5E2DD" }}
                  />
                  <button
                    onClick={() => onRemovePending(pf.id)}
                    className="absolute -top-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: "#C4463A", color: "#FFFFFF" }}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
            {/* 提交按钮 */}
            <Button
              onClick={onSubmit}
              disabled={pendingFiles.length === 0}
              className="w-full gap-1.5 h-9 text-sm font-medium"
              style={{ backgroundColor: "#D4853A", color: "#FFFFFF" }}
            >
              <ScanSearch className="h-3.5 w-3.5" />
              提交识别
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
