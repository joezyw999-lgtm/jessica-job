"use client";

import { FileImage, Loader2, AlertCircle, ChevronDown } from "lucide-react";
import type { InterviewRecord } from "@/types/interview";
import { StatusBadge } from "@/components/StatusBadge";

interface RecordListProps {
  /** 已完成的记录 */
  records: InterviewRecord[];
  /** 处理中的记录 */
  processingRecords?: InterviewRecord[];
  /** 是否还有更多 */
  hasMore?: boolean;
  /** 是否加载中 */
  loading?: boolean;
  /** 加载更多 */
  onLoadMore?: () => void;
}

/**
 * 左侧缩略图列表
 * - 顶部显示处理中的记录
 * - 下方显示已完成记录
 * - 支持滚动加载更多
 */
export function RecordList({
  records,
  processingRecords = [],
  hasMore = false,
  loading = false,
  onLoadMore,
}: RecordListProps) {
  const allRecords = [...processingRecords, ...records];
  const isEmpty = allRecords.length === 0;

  if (isEmpty) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="flex flex-col items-center text-center">
          <div
            className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl"
            style={{ backgroundColor: "#F0EEEB" }}
          >
            <FileImage className="h-6 w-6" style={{ color: "#9CA3AF" }} />
          </div>
          <p className="text-sm font-medium" style={{ color: "#6B7280" }}>
            暂无面经
          </p>
          <p className="mt-1 text-xs" style={{ color: "#9CA3AF" }}>
            粘贴截图开始识别
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div
        className="shrink-0 px-4 py-2 border-t text-xs font-medium"
        style={{ borderColor: "#E5E2DD", color: "#6B7280" }}
      >
        识别记录 ({records.length})
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {allRecords.map((record, index) => (
          <div
            key={record.id}
            className="flex items-start gap-2.5 rounded-lg border p-2 transition-colors"
            style={{
              borderColor: record.status === "extracting" ? "#D4853A" : "#E5E2DD",
              backgroundColor:
                record.status === "extracting"
                  ? "rgba(212,133,58,0.04)"
                  : "#FAFAF9",
            }}
          >
            {/* 缩略图 */}
            <div className="shrink-0">
              {record.imageUrl ? (
                <div
                  className="relative h-10 w-10 overflow-hidden rounded border"
                  style={{ borderColor: "#E5E2DD" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={record.imageUrl}
                    alt={record.fileName}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div
                  className="flex h-10 w-10 items-center justify-center rounded border"
                  style={{ borderColor: "#E5E2DD", backgroundColor: "#F0EEEB" }}
                >
                  {record.status === "extracting" ? (
                    <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#D4853A" }} />
                  ) : record.status === "error" ? (
                    <AlertCircle className="h-4 w-4" style={{ color: "#C4463A" }} />
                  ) : (
                    <FileImage className="h-4 w-4" style={{ color: "#9CA3AF" }} />
                  )}
                </div>
              )}
            </div>

            {/* 信息 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-medium truncate" style={{ color: "#1A1A1A" }}>
                  {record.company || (index < processingRecords.length ? "识别中..." : `记录 ${index + 1}`)}
                </span>
                <StatusBadge
                  status={record.status}
                  errorMsg={record.errorMsg}
                  content={record.content}
                />
              </div>
              {record.position && (
                <p className="text-xs mt-0.5 truncate" style={{ color: "#6B7280" }}>
                  {record.industry && (
                    <span
                      className="inline-block mr-1 px-1 py-0 rounded text-[10px] leading-tight"
                      style={{ backgroundColor: "rgba(45,106,106,0.1)", color: "#2D6A6A" }}
                    >
                      {record.industry}
                    </span>
                  )}
                  {record.position}
                </p>
              )}
              {record.status === "done" && record.content && (
                <p className="text-xs mt-1 line-clamp-2" style={{ color: "#6B7280" }}>
                  {record.content}
                </p>
              )}
            </div>
          </div>
        ))}

        {/* 加载更多 */}
        {hasMore && (
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="w-full py-2 flex items-center justify-center gap-1 rounded-lg border text-xs transition-colors hover:bg-[#F8F7F5]"
            style={{ borderColor: "#E5E2DD", color: "#6B7280" }}
          >
            {loading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                加载中...
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                加载更多
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
