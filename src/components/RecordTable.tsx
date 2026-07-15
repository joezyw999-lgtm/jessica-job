"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  FileImage,
  Pencil,
  X,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/StatusBadge";
import type { InterviewRecord } from "@/types/interview";
import { INDUSTRY_LIST } from "@/types/interview";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface RecordTableProps {
  records: InterviewRecord[];
  processingRecords?: InterviewRecord[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  loading: boolean;
  onPreview: (record: InterviewRecord, subIndex?: number) => void;
  onEdit: (record: InterviewRecord) => void;
  onDelete: (id: string) => void;
  onBatchDelete?: (ids: string[]) => void | Promise<void>;
  onLoadMore: () => void;
  onRefresh: () => void;
  onFilterChange?: (filters: Record<string, string>) => void;
}

export function RecordTable({
  records,
  processingRecords = [],
  total,
  page,
  pageSize,
  hasMore,
  loading,
  onPreview,
  onEdit,
  onDelete,
  onBatchDelete,
  onLoadMore,
  onRefresh,
  onFilterChange,
}: RecordTableProps) {
  const [showFilter, setShowFilter] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [filterIndustry, setFilterIndustry] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // 可选择的记录（只包含已保存的正式记录，processing 中的不参与选择）
  const selectableRecords = records;
  const allSelected = selectableRecords.length > 0 && selectableRecords.every((r) => selectedIds.has(r.id));
  const someSelected = selectableRecords.some((r) => selectedIds.has(r.id));

  // 合并 processing 到最前面（仅第 1 页时）
  const displayRecords = useMemo(() => {
    if (page === 1) {
      return [...processingRecords, ...records];
    }
    return records;
  }, [page, processingRecords, records]);

  const doneCount = useMemo(
    () => records.filter((r) => r.status === "done").length + processingRecords.filter((r) => r.status === "done").length,
    [records, processingRecords]
  );

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      onFilterChange?.({ keyword, industry: filterIndustry });
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword, filterIndustry, onFilterChange]);

  const handleDelete = useCallback((id: string) => {
    if (window.confirm("确定要删除这条面经记录吗？此操作不可恢复。")) {
      onDelete(id);
    }
  }, [onDelete]);

  // 全选/取消全选
  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableRecords.map((r) => r.id)));
    }
  }, [allSelected, selectableRecords]);

  // 切换单条选中
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // 批量删除
  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    try {
      setDeleting(true);
      await onBatchDelete?.(Array.from(selectedIds));
      setSelectedIds(new Set());
    } catch (e) {
      console.error("批量删除失败", e);
    } finally {
      setDeleting(false);
    }
  }, [selectedIds, onBatchDelete]);

  if (loading && records.length === 0 && processingRecords.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="h-8 w-8" style={{ color: "#2D6A6A" }} />
          <p className="text-sm" style={{ color: "#6B7280" }}>加载中...</p>
        </div>
      </div>
    );
  }

  if (displayRecords.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <div
          className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl"
          style={{ backgroundColor: "#F0EEEB" }}
        >
          <Search className="h-10 w-10" style={{ color: "#9CA3AF" }} />
        </div>
        <h3 className="text-base font-medium" style={{ color: "#1A1A1A" }}>
          暂无面经记录
        </h3>
        <p className="mt-2 text-sm text-center max-w-md" style={{ color: "#6B7280" }}>
          粘贴面经图片或文字，AI 将自动识别并整理内容
        </p>
      </div>
    );
  }

  return (
    <main className="flex-1 min-w-0 flex flex-col">
      {/* 标题栏 */}
      <div
        className="shrink-0 px-6 py-3 border-b flex items-center justify-between"
        style={{ borderColor: "#E5E2DD", backgroundColor: "#FFFFFF" }}
      >
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>
              识别清洗结果
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
              共 {total} 条，已完成 {doneCount} 条
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="h-7 px-2"
            title="刷新"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} style={{ color: "#6B7280" }} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilter(!showFilter)}
            className="h-7 px-2"
            title="筛选"
          >
            <Filter
              className="h-3.5 w-3.5"
              style={{ color: showFilter ? "#2D6A6A" : "#6B7280" }}
            />
          </Button>
        </div>

        {/* 右侧：批量删除 */}
        {selectedIds.size > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5"
                style={{ color: "#C4463A", borderColor: "#E8B0AA" }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="text-xs">批量删除</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#C4463A", color: "#fff" }}>
                  {selectedIds.size}
                </span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认删除选中记录？</AlertDialogTitle>
                <AlertDialogDescription>
                  即将删除 <span className="font-semibold" style={{ color: "#C4463A" }}>{selectedIds.size}</span> 条面经记录。
                  此操作不可恢复，请谨慎操作。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleBatchDelete}
                  style={{ backgroundColor: "#C4463A" }}
                  className="hover:opacity-90"
                >
                  {deleting ? "删除中..." : "确认删除"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* 筛选栏 */}
      {showFilter && (
        <div
          className="shrink-0 px-6 py-3 border-b flex items-center gap-3"
          style={{ borderColor: "#E5E2DD", backgroundColor: "#FAFAF9" }}
        >
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "#9CA3AF" }} />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索公司/岗位/内容..."
              className="pl-8 h-8 text-sm"
            />
          </div>
          <select
            value={filterIndustry}
            onChange={(e) => setFilterIndustry(e.target.value)}
            className="h-8 rounded-md border px-2 text-sm"
            style={{ borderColor: "#E5E2DD", backgroundColor: "#FFFFFF", color: "#1A1A1A" }}
          >
            <option value="">全部行业</option>
            {INDUSTRY_LIST.map((ind) => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>
        </div>
      )}

      {/* 表格 */}
      <div className="flex-1 min-h-0 overflow-auto">
        <Table>
          <TableHeader
            className="sticky top-0 z-10"
            style={{ backgroundColor: "#FAFAF9" }}
          >
            <TableRow style={{ borderColor: "#E5E2DD" }}>
              <TableHead className="w-10 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="cursor-pointer"
                />
              </TableHead>
              <TableHead className="w-12 text-center">#</TableHead>
              <TableHead className="w-24">日期</TableHead>
              <TableHead className="w-16">图片</TableHead>
              <TableHead className="w-32">公司</TableHead>
              <TableHead className="w-24">行业</TableHead>
              <TableHead className="w-32">岗位</TableHead>
              <TableHead className="w-16 text-center">类别</TableHead>
              <TableHead className="w-16 text-center">类型</TableHead>
              <TableHead className="w-16 text-center">国家</TableHead>
              <TableHead>面经内容（清洗后）</TableHead>
              <TableHead className="w-24 text-center">状态</TableHead>
              <TableHead className="w-20 text-center">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayRecords.map((record, index) => (
              <TableRow
                key={record.id}
                className="group transition-colors"
                style={{ borderColor: "#E5E2DD" }}
              >
                <TableCell className="w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(record.id)}
                    onChange={() => toggleSelect(record.id)}
                    className="cursor-pointer"
                  />
                </TableCell>
                <TableCell className="text-center text-sm" style={{ color: "#6B7280" }}>
                  {index + 1}
                </TableCell>
                <TableCell className="text-sm" style={{ color: "#6B7280" }}>
                  {record.createdAt
                    ? new Date(record.createdAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })
                    : "-"}
                </TableCell>
                <TableCell>
                  {record.imageUrl ? (
                    <div
                      className="relative h-10 w-10 overflow-hidden rounded border cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ borderColor: "#E5E2DD" }}
                      onClick={() => onPreview(record, 0)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={record.imageUrl}
                        alt={record.fileName}
                        className="h-full w-full object-cover"
                      />
                      {record.imageUrls && record.imageUrls.length > 1 && (
                        <span
                          className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ backgroundColor: "#2D6A6A" }}
                        >
                          {record.imageUrls.length}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded border"
                      style={{ borderColor: "#E5E2DD", backgroundColor: "#F8F7F5" }}
                    >
                      <FileImage className="h-4 w-4" style={{ color: "#6B7280" }} />
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-medium text-sm" style={{ color: "#1A1A1A" }}>
                  {record.company || <span style={{ color: "#9CA3AF" }}>—</span>}
                </TableCell>
                <TableCell className="text-sm">
                  {record.industry ? (
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-xs font-medium"
                      style={{ backgroundColor: "rgba(45,106,106,0.1)", color: "#2D6A6A" }}
                    >
                      {record.industry}
                    </span>
                  ) : (
                    <span style={{ color: "#9CA3AF" }}>—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm" style={{ color: "#1A1A1A" }}>
                  {record.position || <span style={{ color: "#9CA3AF" }}>—</span>}
                </TableCell>
                <TableCell className="text-center">
                  <span
                    className="inline-block px-1.5 py-0.5 rounded text-xs font-medium"
                    style={{ backgroundColor: "rgba(212,133,58,0.12)", color: "#D4853A" }}
                  >
                    {record.category || "国内"}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                      record.experienceType === "笔经" ? "bg-purple-50 text-purple-600" : ""
                    }`}
                    style={
                      record.experienceType === "笔经"
                        ? {}
                        : { backgroundColor: "rgba(45,106,106,0.1)", color: "#2D6A6A" }
                    }
                  >
                    {record.experienceType || "面经"}
                  </span>
                </TableCell>
                <TableCell className="text-center text-sm" style={{ color: "#6B7280" }}>
                  {record.country || "大陆"}
                </TableCell>
                <TableCell className="max-w-lg">
                  <div
                    className="text-sm line-clamp-3 whitespace-pre-wrap"
                    style={{ color: "#1A1A1A" }}
                  >
                    {record.content || (
                      <span style={{ color: "#9CA3AF" }}>
                        {record.status === "extracting"
                          ? "正在识别清洗..."
                          : record.status === "error"
                            ? record.errorMsg || "识别失败"
                            : "等待识别"}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <StatusBadge
                    status={record.status}
                    errorMsg={record.errorMsg}
                    content={record.content}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1">
                    {record.status === "done" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onEdit(record)}
                        title="查看/编辑"
                      >
                        <Pencil className="h-3.5 w-3.5" style={{ color: "#2D6A6A" }} />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDelete(record.id)}
                      title="删除"
                    >
                      <X className="h-3.5 w-3.5" style={{ color: "#C4463A" }} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 分页/加载更多 */}
      {(hasMore || records.length > 0) && (
        <div
          className="shrink-0 px-6 py-3 border-t flex items-center justify-center gap-3"
          style={{ borderColor: "#E5E2DD", backgroundColor: "#FFFFFF" }}
        >
          {hasMore ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onLoadMore}
              disabled={loading}
              className="gap-1.5 h-8"
            >
              {loading ? (
                <>
                  <Spinner className="h-3.5 w-3.5" />
                  加载中...
                </>
              ) : (
                <>
                  <ChevronRight className="h-3.5 w-3.5" />
                  加载更多
                </>
              )}
            </Button>
          ) : (
            <span className="text-xs" style={{ color: "#9CA3AF" }}>
              已加载全部 {records.length} 条
            </span>
          )}
        </div>
      )}
    </main>
  );
}
