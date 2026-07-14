"use client";

import { ScanSearch, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TextExtractPanelProps {
  value: string;
  onChange: (value: string) => void;
  extracting: boolean;
  onExtract: () => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
}

export function TextExtractPanel({
  value,
  onChange,
  extracting,
  onExtract,
  onPaste,
}: TextExtractPanelProps) {
  const hasContent = value.length > 0;
  const canExtract = !extracting && value.trim().length > 0;

  return (
    <div className="px-4 pb-3">
      <div
        className="rounded-xl border-2 transition-all duration-300 overflow-hidden"
        style={{
          borderColor: hasContent ? "#2D6A6A" : "#E5E2DD",
          backgroundColor: "#F8F7F5",
        }}
      >
        <div className="p-3">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="也可以在这里粘贴面经文字内容..."
            onPaste={onPaste}
            className="w-full resize-none rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all"
            style={{
              borderColor: "#E5E2DD",
              backgroundColor: "#FFFFFF",
              color: "#1A1A1A",
              height: hasContent ? "160px" : "48px",
              minHeight: "48px",
            }}
            onFocus={(e) => {
              if (value.length === 0) e.target.style.height = "120px";
            }}
            onBlur={(e) => {
              if (value.length === 0) e.target.style.height = "48px";
            }}
          />
          {hasContent && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs" style={{ color: "#9CA3AF" }}>
                {value.length} 字
              </span>
              <Button
                onClick={onExtract}
                disabled={!canExtract}
                className="gap-1.5 h-8 text-xs font-medium px-4"
                style={{
                  backgroundColor: value.trim().length === 0 ? "#9CA3AF" : "#D4853A",
                  color: "#FFFFFF",
                }}
              >
                {extracting ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    识别中...
                  </>
                ) : (
                  <>
                    <ScanSearch className="h-3 w-3" />
                    识别清洗
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
