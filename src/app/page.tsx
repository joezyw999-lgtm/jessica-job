"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { BriefcaseBusiness, Download, History, Puzzle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDeviceId } from "@/hooks/useDeviceId";
import { useGlobalPaste } from "@/hooks/useGlobalPaste";
import { useRecords } from "@/hooks/useRecords";
import { useImageExtract } from "@/hooks/useImageExtract";
import { useTextExtract } from "@/hooks/useTextExtract";
import { ImagePastePanel } from "@/components/ImagePastePanel";
import { TextExtractPanel } from "@/components/TextExtractPanel";
import { RecordList } from "@/components/RecordList";
import { RecordTable } from "@/components/RecordTable";
import { RecordEditDialog } from "@/components/RecordEditDialog";
import { ImagePreviewDialog } from "@/components/ImagePreviewDialog";
import type { InterviewRecord } from "@/types/interview";
import { toast } from "sonner";

export default function HomePage() {
  const { deviceId, deviceIdRef, fromTab } = useDeviceId();

  // 预览/编辑状态
  const [previewRecord, setPreviewRecord] = useState<InterviewRecord | null>(null);
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  const [editRecord, setEditRecord] = useState<InterviewRecord | null>(null);

  // 筛选条件
  const [filters, setFilters] = useState<Record<string, string>>({});
  const filtersRef = useRef(filters);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // 记录列表（分页 + 筛选）
  const {
    records,
    total,
    page,
    pageSize,
    hasMore,
    loading: recordsLoading,
    loadRecords,
    loadMore,
    updateRecord,
    deleteRecord,
    batchDelete,
    reExtract,
    reExtractingIds,
  } = useRecords({ deviceId, deviceIdRef, pollInterval: 15000, pageSize: 20 });

  // 图片识别
  const {
    pasteMode,
    setPasteMode,
    pasteFlash,
    pendingFiles,
    removePendingFile,
    clearPendingFiles,
    submitPendingFiles,
    addImage,
    processingRecords: imageProcessingRecords,
  } = useImageExtract({
    deviceId,
    deviceIdRef,
    onRecordPersisted: () => {
      loadRecords({ ...filtersRef.current, page: 1, pageSize });
    },
  });

  // 文本识别
  const {
    textContent,
    setTextContent,
    extracting: textExtracting,
    extractText,
    processingRecords: textProcessingRecords,
  } = useTextExtract({
    deviceId,
    deviceIdRef,
    onRecordPersisted: () => {
      loadRecords({ ...filtersRef.current, page: 1, pageSize });
    },
  });

  // 合并所有 processing 记录
  const processingRecords = [...imageProcessingRecords, ...textProcessingRecords];

  // 首次加载
  useEffect(() => {
    if (deviceId) {
      loadRecords({ page: 1, pageSize });
    }
  }, [deviceId, loadRecords, pageSize]);

  // 筛选变化 → 重新加载第一页
  const handleFilterChange = useCallback(
    (newFilters: Record<string, string>) => {
      const merged = { ...filtersRef.current, ...newFilters };
      setFilters(merged);
      loadRecords({ ...merged, page: 1, pageSize });
    },
    [loadRecords, pageSize]
  );

  // 全局粘贴
  const handleGlobalPaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // 图片粘贴
    const imageItems = Array.from(items).filter(
      (item) => item.type.indexOf("image") !== -1
    );
    if (imageItems.length > 0) {
      e.preventDefault();
      imageItems.forEach((item) => {
        const file = item.getAsFile();
        if (file) addImage(file);
      });
      return;
    }

    // 文字粘贴（非输入框时拦截）
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === "textarea" || tag === "input") return;

    const textItem = Array.from(items).find(
      (item) => item.type === "text/plain"
    );
    if (textItem) {
      textItem.getAsString((text) => {
        if (text && text.trim().length > 20) {
          e.preventDefault();
          setTextContent((prev) => prev + (prev ? "\n" : "") + text);
        }
      });
    }
  }, [addImage, setTextContent]);

  useGlobalPaste(handleGlobalPaste);

  // 提交待识别图片
  const handleSubmitPending = useCallback(() => {
    submitPendingFiles();
  }, [submitPendingFiles]);

  // 预览图片
  const handlePreview = useCallback((record: InterviewRecord, subIndex = 0) => {
    setPreviewRecord(record);
    setPreviewImageIndex(subIndex);
  }, []);

  // 编辑
  const handleEdit = useCallback((record: InterviewRecord) => {
    setEditRecord(record);
  }, []);

  const handleSaveEdit = useCallback(
    async (id: string, data: Partial<InterviewRecord>) => {
      await updateRecord(id, data);
      setEditRecord(null);
    },
    [updateRecord]
  );

  // 删除
  const handleDelete = useCallback(
    async (id: string) => {
      await deleteRecord(id);
    },
    [deleteRecord]
  );

  // 批量删除
  const handleBatchDelete = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      try {
        await batchDelete(ids);
        toast.success(`已删除 ${ids.length} 条记录`);
      } catch (e) {
        toast.error("批量删除失败");
      }
    },
    [batchDelete]
  );

  // 加载更多
  const handleLoadMore = useCallback(() => {
    loadMore();
  }, [loadMore]);

  // 刷新
  const handleRefresh = useCallback(() => {
    loadRecords({ ...filtersRef.current, page: 1, pageSize });
  }, [loadRecords, pageSize]);

  // CSV 导出
  const handleExportCSV = useCallback(() => {
    if (records.length === 0) {
      alert("暂无数据可导出");
      return;
    }
    const headers = ["公司", "岗位", "行业", "内容", "原始内容", "日期"];
    const csvContent = [
      headers.join(","),
      ...records.map((r) =>
        [
          `\"${(r.company || "").replace(/"/g, '""')}\"`,
          `\"${(r.position || "").replace(/"/g, '""')}\"`,
          `\"${(r.industry || "").replace(/"/g, '""')}\"`,
          `\"${(r.content || "").replace(/"/g, '""')}\"`,
          `\"${(r.originalContent || "").replace(/"/g, '""')}\"`,
          r.createdAt || "",
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `面经整理_${new Date().toLocaleDateString("zh-CN").replace(/\//g, "-")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [records]);

  return (
    <div className="flex h-screen flex-col" style={{ backgroundColor: "#F8F7F5" }}>
      {/* 顶部导航 */}
      <header
        className="shrink-0 border-b"
        style={{ borderColor: "#E5E2DD", backgroundColor: "#FFFFFF" }}
      >
        <div className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ backgroundColor: "#2D6A6A" }}
            >
              <BriefcaseBusiness className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold" style={{ color: "#1A1A1A" }}>
                面经整理
              </h1>
              <p className="text-xs" style={{ color: "#6B7280" }}>
                AI 识别 · 内容清洗 · 一键归档
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/chrome-extension"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm border transition-colors hover:bg-gray-50"
              style={{ borderColor: "#E5E2DD", color: "#2D6A6A" }}
            >
              <Puzzle className="h-3.5 w-3.5" />
              下载插件
            </a>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={recordsLoading}
              className="gap-1.5"
            >
              <History className="h-3.5 w-3.5" />
              刷新
            </Button>
            <Button
              size="sm"
              onClick={handleExportCSV}
              disabled={records.length === 0}
              className="gap-1.5"
              style={{ backgroundColor: "#2D6A6A", color: "#FFFFFF" }}
            >
              <Download className="h-3.5 w-3.5" />
              导出 CSV
            </Button>
          </div>
        </div>
      </header>

      {/* 三栏布局 */}
      <div className="flex-1 min-h-0 flex">
        {/* 左侧：粘贴 + 记录缩略图列表 */}
        <aside
          className="shrink-0 w-72 border-r flex flex-col"
          style={{ borderColor: "#E5E2DD", backgroundColor: "#FFFFFF" }}
        >
          <ImagePastePanel
            pasteFlash={pasteFlash}
            pasteMode={pasteMode}
            onModeChange={setPasteMode}
            pendingFiles={pendingFiles}
            onClearPending={clearPendingFiles}
            onRemovePending={removePendingFile}
            onSubmit={handleSubmitPending}
          />
          <TextExtractPanel
            value={textContent}
            onChange={setTextContent}
            extracting={textExtracting}
            onExtract={extractText}
          />
          <RecordList
            records={records}
            processingRecords={processingRecords}
            hasMore={hasMore}
            loading={recordsLoading}
            onLoadMore={loadMore}
          />
        </aside>

        {/* 中间：表格 */}
        <div className="flex-1 min-w-0 flex flex-col" style={{ backgroundColor: "#FFFFFF" }}>
          <RecordTable
            records={records}
            processingRecords={processingRecords}
            total={total}
            page={page}
            pageSize={pageSize}
            hasMore={hasMore}
            loading={recordsLoading}
            onPreview={handlePreview}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onBatchDelete={handleBatchDelete}
            onReExtract={reExtract}
            reExtractingIds={reExtractingIds}
            onLoadMore={handleLoadMore}
            onRefresh={handleRefresh}
            onFilterChange={handleFilterChange}
          />
        </div>

      </div>

      {/* 编辑弹窗 */}
      {editRecord && (
        <RecordEditDialog
          record={editRecord}
          open={!!editRecord}
          onOpenChange={(open) => !open && setEditRecord(null)}
          onSave={handleSaveEdit}
        />
      )}

      {/* 图片预览弹窗 */}
      {previewRecord && previewRecord.imageUrl && (
        <ImagePreviewDialog
          record={previewRecord}
          initialIndex={previewImageIndex}
          open={!!previewRecord && !!previewRecord.imageUrl}
          onOpenChange={(open) => !open && setPreviewRecord(null)}
          onIndexChange={setPreviewImageIndex}
        />
      )}
    </div>
  );
}
