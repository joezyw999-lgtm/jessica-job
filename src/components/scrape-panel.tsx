"use client";

import { useState, useCallback, useRef } from "react";
import {
  Search,
  Download,
  Loader2,
  Trash2,
  Pencil,
  X,
  Plus,
  ExternalLink,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// --- Types ---
interface RecruitRecord {
  id: string;
  updateTime: string;
  company: string;
  hasReferral: string;
  enterpriseType: string;
  recruitmentType: string;
  industry: string;
  topic: string;
  deadline: string;
  target: string;
  applyUrl: string;
  location: string;
  requirement: string;
  position: string;
  status: "loading" | "done" | "error";
  errorMsg?: string;
  originalTitle: string;
}

interface EditField {
  key: keyof RecruitRecord;
  label: string;
}

const EDITABLE_FIELDS: EditField[] = [
  { key: "company", label: "公司名称" },
  { key: "hasReferral", label: "是否有内推/内推方式" },
  { key: "enterpriseType", label: "企业类型" },
  { key: "recruitmentType", label: "招聘类型" },
  { key: "industry", label: "所属行业" },
  { key: "topic", label: "招聘主题" },
  { key: "deadline", label: "截止日期" },
  { key: "target", label: "招聘对象" },
  { key: "applyUrl", label: "网申/投递方式" },
  { key: "location", label: "工作地点" },
  { key: "requirement", label: "招聘需求" },
  { key: "position", label: "招聘岗位" },
];

// --- Helper ---
function genId(): string {
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// --- Main Page ---
export default function ScrapePanel() {
  const [records, setRecords] = useState<RecruitRecord[]>([]);
  const [inputTitle, setInputTitle] = useState("");

  const [editRecord, setEditRecord] = useState<RecruitRecord | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<RecruitRecord>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  // Search and extract recruitment info
  const handleSearch = useCallback(async () => {
    const title = inputTitle.trim();
    if (!title) return;

    setInputTitle("");

    const tempId = genId();
    const today = new Date();
    const updateTime = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const newRecord: RecruitRecord = {
      id: tempId,
      updateTime,
      company: "",
      hasReferral: "",
      enterpriseType: "",
      recruitmentType: "",
      industry: "",
      topic: "",
      deadline: "",
      target: "",
      applyUrl: "",
      location: "",
      requirement: "",
      position: "",
      status: "loading",
      originalTitle: title,
    };

    setRecords((prev) => [newRecord, ...prev]);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();

      if (data.success && data.data) {
        setRecords((prev) =>
          prev.map((r) =>
            r.id === tempId
              ? { ...r, ...data.data, status: "done" as const }
              : r
          )
        );
      } else {
        setRecords((prev) =>
          prev.map((r) =>
            r.id === tempId
              ? {
                  ...r,
                  topic: title,
                  status: "error" as const,
                  errorMsg: data.error || "识别失败",
                }
              : r
          )
        );
      }
    } catch (err: unknown) {
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      setRecords((prev) =>
        prev.map((r) =>
          r.id === tempId
            ? { ...r, topic: title, status: "error" as const, errorMsg: isTimeout ? "请求超时，请重试" : "网络错误" }
            : r
        )
      );
    } finally {
      inputRef.current?.focus();
    }
  }, [inputTitle]);

  // Delete a record
  const handleDelete = useCallback((id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }, []);

  // Clear all records
  const handleClearAll = useCallback(() => {
    setRecords([]);
  }, []);

  // Retry a failed record
  const handleRetry = useCallback(async (record: RecruitRecord) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.id === record.id ? { ...r, status: "loading" as const, errorMsg: undefined } : r
      )
    );

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: record.originalTitle }),
      });
      const data = await res.json();

      if (data.success && data.data) {
        setRecords((prev) =>
          prev.map((r) =>
            r.id === record.id
              ? { ...r, ...data.data, status: "done" as const }
              : r
          )
        );
      } else {
        setRecords((prev) =>
          prev.map((r) =>
            r.id === record.id
              ? { ...r, status: "error" as const, errorMsg: data.error || "识别失败" }
              : r
          )
        );
      }
    } catch {
      setRecords((prev) =>
        prev.map((r) =>
          r.id === record.id
            ? { ...r, status: "error" as const, errorMsg: "网络错误" }
            : r
        )
      );
    }
  }, []);

  // Edit dialog
  const openEdit = useCallback((record: RecruitRecord) => {
    setEditRecord(record);
    setEditDraft({ ...record });
  }, []);

  const saveEdit = useCallback(() => {
    if (!editRecord || !editDraft) return;
    setRecords((prev) =>
      prev.map((r) =>
        r.id === editRecord.id ? { ...r, ...editDraft, status: "done" as const } : r
      )
    );
    setEditRecord(null);
    setEditDraft({});
  }, [editRecord, editDraft]);

  // Export to Excel
  const handleExport = useCallback(async () => {
    const doneRecords = records.filter((r) => r.status === "done");
    if (doneRecords.length === 0) return;

    // Dynamic import xlsx
    const XLSX = await import("xlsx");

    const exportData = doneRecords.map((r, idx) => ({
      序号: idx + 1,
      更新时间: r.updateTime,
      公司名称: r.company,
      "是否有内推/内推方式": r.hasReferral,
      企业类型: r.enterpriseType,
      招聘类型: r.recruitmentType,
      所属行业: r.industry,
      招聘主题: r.topic,
      截止日期: r.deadline,
      招聘对象: r.target,
      "网申/投递方式": r.applyUrl,
      工作地点: r.location,
      招聘需求: r.requirement,
      招聘岗位: r.position,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);

    // Set column widths
    ws["!cols"] = [
      { wch: 6 },   // 序号
      { wch: 12 },  // 更新时间
      { wch: 16 },  // 公司名称
      { wch: 20 },  // 是否有内推
      { wch: 12 },  // 企业类型
      { wch: 12 },  // 招聘类型
      { wch: 10 },  // 所属行业
      { wch: 35 },  // 招聘主题
      { wch: 12 },  // 截止日期
      { wch: 25 },  // 招聘对象
      { wch: 35 },  // 网申方式
      { wch: 20 },  // 工作地点
      { wch: 15 },  // 招聘需求
      { wch: 20 },  // 招聘岗位
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "招聘信息");

    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    XLSX.writeFile(wb, `招聘信息_${dateStr}.xlsx`);
  }, [records]);

  const doneCount = records.filter((r) => r.status === "done").length;
  const loadingCount = records.filter((r) => r.status === "loading").length;

  return (
    <div className="min-h-screen" style={{ background: "#F8F7F5" }}>
      {/* Header */}
      <header
        className="border-b"
        style={{
          background: "#FFFFFF",
          borderColor: "#E5E2DD",
        }}
      >
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: "#2D6A6A" }}
            >
              <Search className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1
                className="text-lg font-semibold leading-tight"
                style={{ color: "#1A1A1A" }}
              >
                招聘信息抓取
              </h1>
              <p className="text-xs" style={{ color: "#6B7280" }}>
                输入招聘标题，AI 自动搜索全网并提取结构化信息
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {doneCount > 0 && (
              <span
                className="text-xs px-2.5 py-1 rounded-full"
                style={{ background: "#EBF5F0", color: "#3D8B5E" }}
              >
                已识别 {doneCount} 条
              </span>
            )}
            {loadingCount > 0 && (
              <span
                className="text-xs px-2.5 py-1 rounded-full"
                style={{ background: "#FFF3E6", color: "#D4853A" }}
              >
                识别中 {loadingCount} 条
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6">
        {/* Search Input Area */}
        <div
          className="rounded-xl p-6 mb-6"
          style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
        >
          <div className="flex gap-3 items-center">
            <div className="flex-1">
              <input
                ref={inputRef}
                type="text"
                value={inputTitle}
                onChange={(e) => setInputTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && inputTitle.trim()) handleSearch(); }}
                placeholder="输入招聘信息标题，如：华为2026届校园招聘正式启动"
                className="w-full px-4 py-3 rounded-lg border text-sm outline-none transition-all"
                style={{
                  borderColor: "#E5E2DD",
                  color: "#1A1A1A",
                  background: "#FAFAF8",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#2D6A6A";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(45,106,106,0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#E5E2DD";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={!inputTitle.trim()}
              className="px-6 py-3 rounded-lg text-sm font-medium flex items-center gap-2 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              style={{
                background: !inputTitle.trim() ? "#9CA3AF" : "#2D6A6A",
                color: "#FFFFFF",
              }}
              onMouseEnter={(e) => {
                if (inputTitle.trim()) {
                  e.currentTarget.style.background = "#245858";
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(45,106,106,0.3)";
                }
              }}
              onMouseLeave={(e) => {
                if (inputTitle.trim()) {
                  e.currentTarget.style.background = "#2D6A6A";
                }
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <Search className="w-4 h-4" />
              搜索识别
            </Button>
          </div>
        </div>

        {/* Action Bar */}
        {records.length > 0 && (
          <div className="flex items-center justify-between mb-4 px-1">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium" style={{ color: "#1A1A1A" }}>
                识别结果
              </span>
              <span className="text-xs" style={{ color: "#9CA3AF" }}>
                共 {records.length} 条
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={doneCount === 0}
                className="text-xs gap-1.5 rounded-lg"
                style={{
                  borderColor: "#E5E2DD",
                  color: doneCount > 0 ? "#2D6A6A" : "#9CA3AF",
                }}
              >
                <Download className="w-3.5 h-3.5" />
                导出 Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAll}
                className="text-xs gap-1.5 rounded-lg"
                style={{
                  borderColor: "#E5E2DD",
                  color: "#C4463A",
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                清空
              </Button>
            </div>
          </div>
        )}

        {/* Results Table */}
        {records.length > 0 && (
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: "#FFFFFF",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow
                    style={{
                      background: "#FAFAF8",
                      borderBottomColor: "#E5E2DD",
                    }}
                  >
                    <TableHead className="text-xs font-semibold w-12 text-center" style={{ color: "#6B7280" }}>序号</TableHead>
                    <TableHead className="text-xs font-semibold" style={{ color: "#6B7280", minWidth: "80px" }}>更新时间</TableHead>
                    <TableHead className="text-xs font-semibold" style={{ color: "#6B7280", minWidth: "100px" }}>公司名称</TableHead>
                    <TableHead className="text-xs font-semibold" style={{ color: "#6B7280", minWidth: "90px" }}>企业类型</TableHead>
                    <TableHead className="text-xs font-semibold" style={{ color: "#6B7280", minWidth: "90px" }}>招聘类型</TableHead>
                    <TableHead className="text-xs font-semibold" style={{ color: "#6B7280", minWidth: "70px" }}>所属行业</TableHead>
                    <TableHead className="text-xs font-semibold" style={{ color: "#6B7280", minWidth: "200px" }}>招聘主题</TableHead>
                    <TableHead className="text-xs font-semibold" style={{ color: "#6B7280", minWidth: "90px" }}>截止日期</TableHead>
                    <TableHead className="text-xs font-semibold" style={{ color: "#6B7280", minWidth: "120px" }}>招聘对象</TableHead>
                    <TableHead className="text-xs font-semibold" style={{ color: "#6B7280", minWidth: "100px" }}>内推</TableHead>
                    <TableHead className="text-xs font-semibold" style={{ color: "#6B7280", minWidth: "90px" }}>工作地点</TableHead>
                    <TableHead className="text-xs font-semibold" style={{ color: "#6B7280", minWidth: "100px" }}>招聘岗位</TableHead>
                    <TableHead className="text-xs font-semibold" style={{ color: "#6B7280", minWidth: "80px" }}>招聘需求</TableHead>
                    <TableHead className="text-xs font-semibold" style={{ color: "#6B7280", minWidth: "100px" }}>网申链接</TableHead>
                    <TableHead className="text-xs font-semibold w-20 text-center" style={{ color: "#6B7280" }}>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record, idx) => (
                    <TableRow
                      key={record.id}
                      className="transition-colors"
                      style={{ borderBottomColor: "#F0EDE8" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#FCFBF9"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <TableCell className="text-xs text-center" style={{ color: "#9CA3AF" }}>
                        {idx + 1}
                      </TableCell>

                      {record.status === "loading" ? (
                        <TableCell colSpan={13} className="text-center py-8">
                          <div className="flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#2D6A6A" }} />
                            <span className="text-sm" style={{ color: "#6B7280" }}>
                              正在搜索识别：{record.originalTitle}
                            </span>
                          </div>
                        </TableCell>
                      ) : record.status === "error" ? (
                        <TableCell colSpan={13} className="text-center py-6">
                          <div className="flex items-center justify-center gap-3">
                            <span className="text-sm" style={{ color: "#C4463A" }}>
                              {record.errorMsg || "识别失败"}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRetry(record)}
                              className="text-xs gap-1 rounded"
                              style={{ borderColor: "#E5E2DD", color: "#2D6A6A" }}
                            >
                              <Plus className="w-3 h-3" />
                              重试
                            </Button>
                          </div>
                        </TableCell>
                      ) : (
                        <>
                          <TableCell className="text-xs" style={{ color: "#1A1A1A" }}>{record.updateTime}</TableCell>
                          <TableCell className="text-xs font-medium" style={{ color: "#1A1A1A" }}>{record.company}</TableCell>
                          <TableCell className="text-xs" style={{ color: "#6B7280" }}>{record.enterpriseType}</TableCell>
                          <TableCell className="text-xs" style={{ color: "#6B7280" }}>{record.recruitmentType}</TableCell>
                          <TableCell className="text-xs" style={{ color: "#6B7280" }}>{record.industry}</TableCell>
                          <TableCell className="text-xs" style={{ color: "#1A1A1A" }}>
                            <div className="max-w-[280px] truncate" title={record.topic}>{record.topic}</div>
                          </TableCell>
                          <TableCell className="text-xs" style={{ color: "#6B7280" }}>{record.deadline || "-"}</TableCell>
                          <TableCell className="text-xs" style={{ color: "#6B7280" }}>
                            <div className="max-w-[160px] truncate" title={record.target}>{record.target || "-"}</div>
                          </TableCell>
                          <TableCell className="text-xs" style={{ color: "#6B7280" }}>
                            <div className="max-w-[100px] truncate" title={record.hasReferral}>{record.hasReferral || "-"}</div>
                          </TableCell>
                          <TableCell className="text-xs" style={{ color: "#6B7280" }}>{record.location || "-"}</TableCell>
                          <TableCell className="text-xs" style={{ color: "#6B7280" }}>
                            <div className="max-w-[120px] truncate" title={record.position}>{record.position || "-"}</div>
                          </TableCell>
                          <TableCell className="text-xs" style={{ color: "#6B7280" }}>
                            <div className="max-w-[100px] truncate" title={record.requirement}>{record.requirement || "-"}</div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {record.applyUrl ? (
                              <a href={record.applyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline" style={{ color: "#2D6A6A" }}>
                                <ExternalLink className="w-3 h-3" />
                                <span className="max-w-[80px] truncate">链接</span>
                              </a>
                            ) : (
                              <span style={{ color: "#9CA3AF" }}>-</span>
                            )}
                          </TableCell>
                        </>
                      )}

                      {/* Actions */}
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {record.status === "done" && (
                            <Button variant="ghost" size="sm" onClick={() => openEdit(record)} className="w-7 h-7 p-0 rounded" style={{ color: "#6B7280" }}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(record.id)} className="w-7 h-7 p-0 rounded" style={{ color: "#C4463A" }}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {records.length === 0 && (
          <div className="rounded-xl py-20 flex flex-col items-center justify-center" style={{ background: "#FFFFFF" }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#F0EDE8" }}>
              <Search className="w-8 h-8" style={{ color: "#9CA3AF" }} />
            </div>
            <p className="text-sm font-medium mb-1" style={{ color: "#6B7280" }}>输入招聘标题开始识别</p>
            <p className="text-xs" style={{ color: "#9CA3AF" }}>AI 将自动搜索全网相同招聘信息并提取结构化字段</p>
          </div>
        )}
      </main>

      {/* Edit Dialog */}
      <Dialog open={!!editRecord} onOpenChange={(open) => !open && setEditRecord(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ color: "#1A1A1A" }}>编辑招聘信息</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {EDITABLE_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: "#6B7280" }}>
                  {field.label}
                </label>
                {field.key === "target" || field.key === "requirement" ? (
                  <Textarea
                    value={(editDraft[field.key] as string) || ""}
                    onChange={(e) => setEditDraft((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    className="text-sm"
                    style={{ borderColor: "#E5E2DD", color: "#1A1A1A" }}
                    rows={3}
                  />
                ) : (
                  <Input
                    value={(editDraft[field.key] as string) || ""}
                    onChange={(e) => setEditDraft((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    className="text-sm"
                    style={{ borderColor: "#E5E2DD", color: "#1A1A1A" }}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRecord(null)} className="rounded-lg" style={{ borderColor: "#E5E2DD", color: "#6B7280" }}>
              取消
            </Button>
            <Button onClick={saveEdit} className="rounded-lg gap-1.5" style={{ background: "#2D6A6A", color: "#FFFFFF" }}>
              <Pencil className="w-4 h-4" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
