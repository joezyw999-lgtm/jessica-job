"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  ScanSearch,
  Trash2,
  Pencil,
  Download,
  Loader2,
  X,
  FileImage,
  CheckCircle2,
  AlertCircle,
  ClipboardPaste,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

const INDUSTRY_LIST = [
  "互联网", "科技", "电商", "金融", "券商", "基金", "银行", "快消", "零售", "奢侈品",
  "四大", "咨询", "综合", "通信", "物流", "交通", "医药", "制造", "能源", "保险",
  "八大", "房地产", "广告", "公关", "生物", "机械", "环境", "材料", "化工", "石油",
  "建筑", "游戏", "高校", "商业服务", "航天", "设计", "环保", "耐消", "餐饮", "供应链",
  "维修", "物业", "体育", "酒店", "人力", "会计师事务所", "电气", "轻工业", "钢铁", "贸易",
  "律所", "汽车", "文旅", "食品", "农业", "新能源", "教育",
];

interface InterviewRecord {
  id: string;
  imageUrl: string;
  fileName: string;
  company: string;
  position: string;
  industry: string;
  content: string;
  originalContent: string;
  status: "pending" | "extracting" | "done" | "error";
  errorMsg?: string;
}

// DB 行 → 前端 Record
function dbToRecord(row: Record<string, unknown>): InterviewRecord {
  return {
    id: row.id as string,
    imageUrl: (row.image_url as string) || "",
    fileName: (row.image_file_key as string) || "图片",
    company: (row.company as string) || "",
    position: (row.position as string) || "",
    industry: (row.industry as string) || "",
    content: (row.content as string) || "",
    originalContent: (row.original_content as string) || "",
    status: (row.status as InterviewRecord["status"]) || "done",
  };
}

export default function HomePage() {
  const [records, setRecords] = useState<InterviewRecord[]>([]);
  const [editRecord, setEditRecord] = useState<InterviewRecord | null>(null);
  const [editCompany, setEditCompany] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editIndustry, setEditIndustry] = useState("");
  const [editContent, setEditContent] = useState("");
  const [industryDropdownOpen, setIndustryDropdownOpen] = useState(false);
  const [pasteFlash, setPasteFlash] = useState(false);
  const [loading, setLoading] = useState(true);
  const processFilesRef = useRef<(files: File[]) => void>(() => {});

  // 设备 ID：首次访问时生成，存入 localStorage，用于数据隔离
  const [deviceId, setDeviceId] = useState<string>("");

  useEffect(() => {
    let did = localStorage.getItem("mianjing_device_id");
    if (!did) {
      did = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem("mianjing_device_id", did);
    }
    setDeviceId(did);
  }, []);

  // 页面加载时从数据库获取记录
  useEffect(() => {
    if (!deviceId) return;
    const fetchRecords = async () => {
      try {
        const res = await fetch("/api/records", {
          headers: { "x-device-id": deviceId },
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          const loaded = data.data.map((row: Record<string, unknown>) => dbToRecord(row));
          setRecords(loaded);
        }
      } catch {
        // 数据库不可用时使用空列表
      } finally {
        setLoading(false);
      }
    };
    fetchRecords();
  }, [deviceId]);

  // 生成唯一 ID
  const genId = () => `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // 上传图片到服务器
  const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || "上传失败");
    }
    return data.data.imageUrl;
  };

  // AI 提取面经信息（已包含清洗）
  const extractInfo = async (
    imageUrl: string
  ): Promise<{ company: string; position: string; industry: string; content: string; originalContent: string }> => {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl }),
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || "识别失败");
    }
    return data.data;
  };

  // 处理文件
  const processFiles = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter((f) =>
        f.type.startsWith("image/")
      );

      if (imageFiles.length === 0) return;

      // 创建待处理记录
      const newRecords: InterviewRecord[] = imageFiles.map((file) => ({
        id: genId(),
        imageUrl: "",
        fileName: file.name || "粘贴的图片",
        company: "",
        position: "",
        industry: "",
        content: "",
        originalContent: "",
        status: "pending" as const,
      }));

      setRecords((prev) => [...newRecords, ...prev]);

      // 逐个处理
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const recordId = newRecords[i].id;

        try {
          // 上传图片
          setRecords((prev) =>
            prev.map((r) =>
              r.id === recordId ? { ...r, status: "extracting" } : r
            )
          );

          const imageUrl = await uploadImage(file);

          setRecords((prev) =>
            prev.map((r) =>
              r.id === recordId ? { ...r, imageUrl } : r
            )
          );

          // AI 识别 + 清洗
          const extracted = await extractInfo(imageUrl);

          // 保存到数据库
          try {
            const dbRes = await fetch("/api/records", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-device-id": deviceId },
              body: JSON.stringify({
                device_id: deviceId,
                image_url: imageUrl,
                image_file_key: file.name || "粘贴的图片",
                company: extracted.company,
                position: extracted.position,
                industry: extracted.industry,
                original_content: extracted.originalContent,
                content: extracted.content,
                status: "done",
              }),
            });
            const dbData = await dbRes.json();
            const dbId = dbData.success && dbData.data?.id ? dbData.data.id : recordId;

            setRecords((prev) =>
              prev.map((r) =>
                r.id === recordId
                  ? {
                      ...r,
                      id: dbId,
                      company: extracted.company,
                      position: extracted.position,
                      industry: extracted.industry,
                      content: extracted.content,
                      originalContent: extracted.originalContent,
                      status: "done",
                    }
                  : r
              )
            );
          } catch {
            // DB 保存失败，仍更新本地状态
            setRecords((prev) =>
              prev.map((r) =>
                r.id === recordId
                  ? {
                      ...r,
                      company: extracted.company,
                      position: extracted.position,
                      industry: extracted.industry,
                      content: extracted.content,
                      originalContent: extracted.originalContent,
                      status: "done",
                    }
                  : r
              )
            );
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "处理失败";
          setRecords((prev) =>
            prev.map((r) =>
              r.id === recordId
                ? { ...r, status: "error", errorMsg: msg }
                : r
            )
          );
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // 保持 ref 指向最新的 processFiles
  processFilesRef.current = processFiles;

  // 全局粘贴监听
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        setPasteFlash(true);
        setTimeout(() => setPasteFlash(false), 600);
        processFilesRef.current?.(imageFiles);
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []);

  // 删除记录
  const handleDelete = async (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
    // 同步删除数据库记录
    try {
      await fetch(`/api/records/${id}`, { method: "DELETE", headers: { "x-device-id": deviceId } });
    } catch {
      // DB 删除失败，本地已删除即可
    }
  };

  // 编辑记录
  const handleEditOpen = (record: InterviewRecord) => {
    setEditRecord(record);
    setEditCompany(record.company);
    setEditPosition(record.position);
    setEditIndustry(record.industry);
    setEditContent(record.content);
    setIndustryDropdownOpen(false);
  };

  const handleEditSave = async () => {
    if (!editRecord) return;
    setRecords((prev) =>
      prev.map((r) =>
        r.id === editRecord.id
          ? { ...r, company: editCompany, position: editPosition, industry: editIndustry, content: editContent }
          : r
      )
    );
    setEditRecord(null);
    // 同步更新数据库
    try {
      await fetch(`/api/records/${editRecord.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-device-id": deviceId },
        body: JSON.stringify({
          company: editCompany,
          position: editPosition,
          industry: editIndustry,
          content: editContent,
        }),
      });
    } catch {
      // DB 更新失败，本地已更新即可
    }
  };

  // 导出 CSV
  const handleExport = () => {
    const doneRecords = records.filter((r) => r.status === "done");
    if (doneRecords.length === 0) return;

    const headers = ["序号", "公司", "行业", "岗位", "面经内容"];
    const rows = doneRecords.map((r, i) => [
      String(i + 1),
      r.company,
      r.industry,
      r.position,
      `"${r.content.replace(/"/g, '""')}"`,
    ]);

    const bom = "\uFEFF";
    const csvContent =
      bom +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `面经数据_${new Date().toLocaleDateString("zh-CN")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 状态徽章
  const StatusBadge = ({ status, errorMsg }: { status: InterviewRecord["status"]; errorMsg?: string }) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary">等待中</Badge>;
      case "extracting":
        return (
          <Badge className="bg-[#D4853A]/15 text-[#D4853A] border-[#D4853A]/30">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            识别中
          </Badge>
        );
      case "done":
        return (
          <Badge className="bg-[#3D8B5E]/15 text-[#3D8B5E] border-[#3D8B5E]/30">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            完成
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive" title={errorMsg}>
            <AlertCircle className="mr-1 h-3 w-3" />
            失败
          </Badge>
        );
    }
  };

  const doneCount = records.filter((r) => r.status === "done").length;
  const processingCount = records.filter(
    (r) => r.status === "extracting" || r.status === "pending"
  ).length;

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: "#F8F7F5" }}>
      {/* 顶部导航 */}
      <header className="shrink-0 border-b z-50" style={{ borderColor: "#E5E2DD", backgroundColor: "rgba(248,247,245,0.95)", backdropFilter: "blur(12px)" }}>
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: "#2D6A6A" }}>
              <ScanSearch className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold" style={{ color: "#1A1A1A" }}>
                面经识客
              </h1>
              <p className="text-xs" style={{ color: "#6B7280" }}>
                AI 驱动的面经图片识别与内容清洗工具
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {records.length > 0 && (
              <div className="flex items-center gap-2 text-sm" style={{ color: "#6B7280" }}>
                <span>
                  已识别 <strong style={{ color: "#2D6A6A" }}>{doneCount}</strong> 条
                </span>
                {processingCount > 0 && (
                  <span className="flex items-center gap-1">
                    · 处理中 <Spinner className="h-3 w-3" />
                  </span>
                )}
              </div>
            )}
            {doneCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                className="gap-1.5 h-8"
              >
                <Download className="h-3.5 w-3.5" />
                导出 CSV
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* 主体：左右分栏 */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧：粘贴工作区 */}
        <aside className="w-[340px] shrink-0 flex flex-col border-r" style={{ borderColor: "#E5E2DD", backgroundColor: "#FFFFFF" }}>
          {/* 粘贴区 */}
          <div className="shrink-0 p-4">
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
                  style={{ backgroundColor: pasteFlash ? "rgba(45,106,106,0.15)" : "#EDEBE8" }}
                >
                  <ClipboardPaste
                    className="h-5 w-5 transition-colors duration-300"
                    style={{ color: pasteFlash ? "#2D6A6A" : "#6B7280" }}
                  />
                </div>
                <p className="text-sm font-medium" style={{ color: "#1A1A1A" }}>
                  {pasteFlash ? "已粘贴，开始识别" : "Ctrl+V 粘贴面经截图"}
                </p>
                <p className="mt-1 text-xs" style={{ color: "#6B7280" }}>
                  支持 JPG / PNG / GIF / WebP / BMP
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  <kbd className="inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium" style={{ borderColor: "#E5E2DD", backgroundColor: "#FFFFFF", color: "#6B7280" }}>
                    Ctrl
                  </kbd>
                  <span className="text-xs" style={{ color: "#9CA3AF" }}>+</span>
                  <kbd className="inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium" style={{ borderColor: "#E5E2DD", backgroundColor: "#FFFFFF", color: "#6B7280" }}>
                    V
                  </kbd>
                </div>
              </div>
            </div>
          </div>

          {/* 缩略图列表 */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: "#6B7280" }}>
                已粘贴图片 ({records.length})
              </span>
              {records.length > 0 && (
                <button
                  onClick={async () => {
                    const ids = records.map((r) => r.id);
                    setRecords([]);
                    // 同步清空数据库
                    try {
                      await Promise.all(ids.map((id) => fetch(`/api/records/${id}`, { method: "DELETE", headers: { "x-device-id": deviceId } })));
                    } catch {
                      // DB 清空失败，本地已清空即可
                    }
                  }}
                  className="text-xs flex items-center gap-0.5 hover:underline"
                  style={{ color: "#C4463A" }}
                >
                  <Trash2 className="h-3 w-3" />
                  清空
                </button>
              )}
            </div>

            {records.length === 0 ? (
              <div className="flex flex-col items-center py-10">
                <FileImage className="h-8 w-8 mb-2" style={{ color: "#D1D5DB" }} />
                <p className="text-xs" style={{ color: "#9CA3AF" }}>
                  粘贴截图后显示在这里
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {records.map((record, index) => (
                  <div
                    key={record.id}
                    className="relative flex items-start gap-3 rounded-lg border p-2.5 transition-colors"
                    style={{
                      borderColor: record.status === "extracting" ? "#D4853A" : "#E5E2DD",
                      backgroundColor: record.status === "extracting" ? "rgba(212,133,58,0.04)" : "#FAFAF9",
                    }}
                  >
                    {/* 缩略图 */}
                    <div className="shrink-0">
                      {record.imageUrl ? (
                        <div className="relative h-12 w-12 overflow-hidden rounded-md border" style={{ borderColor: "#E5E2DD" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={record.imageUrl}
                            alt={record.fileName}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-md border" style={{ borderColor: "#E5E2DD", backgroundColor: "#F0EEEB" }}>
                          {record.status === "extracting" ? (
                            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#D4853A" }} />
                          ) : record.status === "error" ? (
                            <AlertCircle className="h-5 w-5" style={{ color: "#C4463A" }} />
                          ) : (
                            <FileImage className="h-5 w-5" style={{ color: "#9CA3AF" }} />
                          )}
                        </div>
                      )}
                    </div>

                    {/* 信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-medium truncate" style={{ color: "#1A1A1A" }}>
                          {record.company || `图片 ${index + 1}`}
                        </span>
                        <StatusBadge status={record.status} errorMsg={record.errorMsg} />
                      </div>
                      {record.position && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: "#6B7280" }}>
                          {record.industry && <span className="inline-block mr-1 px-1 py-0 rounded text-[10px] leading-tight" style={{ backgroundColor: "rgba(45,106,106,0.1)", color: "#2D6A6A" }}>{record.industry}</span>}
                          {record.position}
                        </p>
                      )}
                      {record.status === "done" && record.content && (
                        <p className="text-xs mt-1 line-clamp-2" style={{ color: "#6B7280" }}>
                          {record.content}
                        </p>
                      )}
                    </div>

                    {/* 删除按钮 */}
                    <button
                      onClick={() => handleDelete(record.id)}
                      className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                      style={{ color: "#9CA3AF" }}
                      title="删除"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* 右侧：结果表格 */}
        <main className="flex-1 min-w-0 flex flex-col">
          {records.length === 0 ? (
            /* 空状态 */
            <div className="flex-1 flex flex-col items-center justify-center">
              <div
                className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl"
                style={{ backgroundColor: "#F0EEEB" }}
              >
                <ScanSearch className="h-10 w-10" style={{ color: "#9CA3AF" }} />
              </div>
              <h3 className="text-base font-medium" style={{ color: "#1A1A1A" }}>
                粘贴面经截图，开始智能识别
              </h3>
              <p className="mt-2 text-sm text-center max-w-md" style={{ color: "#6B7280" }}>
                截图后按 Ctrl+V 粘贴面经图片，AI 将自动识别其中的公司名称、岗位信息和面经内容，
                并自动清洗冗余信息，一步到位只保留有效面试干货。
              </p>
            </div>
          ) : (
            <>
              {/* 表格标题栏 */}
              <div className="shrink-0 px-6 py-3 border-b flex items-center justify-between" style={{ borderColor: "#E5E2DD", backgroundColor: "#FFFFFF" }}>
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>
                    识别清洗结果
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                    共 {records.length} 条，已完成 {doneCount} 条
                  </p>
                </div>
              </div>

              {/* 固定表头表格 */}
              <div className="flex-1 min-h-0 overflow-auto">
                <Table>
                  <TableHeader
                    className="sticky top-0 z-10"
                    style={{ backgroundColor: "#FAFAF9" }}
                  >
                    <TableRow style={{ borderColor: "#E5E2DD" }}>
                      <TableHead className="w-12 text-center">#</TableHead>
                      <TableHead className="w-16">图片</TableHead>
                      <TableHead className="w-32">公司</TableHead>
                      <TableHead className="w-24">行业</TableHead>
                      <TableHead className="w-32">岗位</TableHead>
                      <TableHead>面经内容（清洗后）</TableHead>
                      <TableHead className="w-24 text-center">状态</TableHead>
                      <TableHead className="w-20 text-center">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((record, index) => (
                      <TableRow
                        key={record.id}
                        className="group transition-colors"
                        style={{ borderColor: "#E5E2DD" }}
                      >
                        <TableCell className="text-center text-sm" style={{ color: "#6B7280" }}>
                          {index + 1}
                        </TableCell>
                        <TableCell>
                          {record.imageUrl ? (
                            <div className="relative h-10 w-10 overflow-hidden rounded border" style={{ borderColor: "#E5E2DD" }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={record.imageUrl}
                                alt={record.fileName}
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded border" style={{ borderColor: "#E5E2DD", backgroundColor: "#F8F7F5" }}>
                              <FileImage className="h-4 w-4" style={{ color: "#6B7280" }} />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-sm" style={{ color: "#1A1A1A" }}>
                          {record.company || (
                            <span style={{ color: "#9CA3AF" }}>—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {record.industry ? (
                            <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: "rgba(45,106,106,0.1)", color: "#2D6A6A" }}>
                              {record.industry}
                            </span>
                          ) : (
                            <span style={{ color: "#9CA3AF" }}>—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm" style={{ color: "#1A1A1A" }}>
                          {record.position || (
                            <span style={{ color: "#9CA3AF" }}>—</span>
                          )}
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
                          <StatusBadge status={record.status} errorMsg={record.errorMsg} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            {record.status === "done" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleEditOpen(record)}
                                title="编辑"
                              >
                                <Pencil className="h-3.5 w-3.5" />
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
            </>
          )}
        </main>
      </div>

      {/* 编辑弹窗 */}
      <Dialog open={!!editRecord} onOpenChange={(open) => { if (!open) { setEditRecord(null); setIndustryDropdownOpen(false); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑面经信息</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: "#1A1A1A" }}>
                公司名称
              </label>
              <Input
                value={editCompany}
                onChange={(e) => setEditCompany(e.target.value)}
                placeholder="输入公司名称"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: "#1A1A1A" }}>
                行业
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIndustryDropdownOpen(!industryDropdownOpen)}
                  className="flex h-9 w-full items-center justify-between rounded-md border px-3 text-sm"
                  style={{ borderColor: "#E5E2DD", backgroundColor: "#FFFFFF", color: editIndustry || "#9CA3AF" }}
                >
                  {editIndustry || "选择行业"}
                  <ChevronDown className="h-4 w-4 ml-2 shrink-0" style={{ color: "#6B7280" }} />
                </button>
                {industryDropdownOpen && (
                  <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border py-1 shadow-lg" style={{ borderColor: "#E5E2DD", backgroundColor: "#FFFFFF" }}>
                    {INDUSTRY_LIST.map((ind) => (
                      <button
                        key={ind}
                        type="button"
                        onClick={() => { setEditIndustry(ind); setIndustryDropdownOpen(false); }}
                        className="flex w-full items-center px-3 py-1.5 text-sm text-left hover:bg-gray-50"
                        style={{ color: ind === editIndustry ? "#2D6A6A" : "#1A1A1A", fontWeight: ind === editIndustry ? 600 : 400 }}
                      >
                        {ind}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: "#1A1A1A" }}>
                岗位名称
              </label>
              <Input
                value={editPosition}
                onChange={(e) => setEditPosition(e.target.value)}
                placeholder="输入岗位名称"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: "#1A1A1A" }}>
                面经内容
              </label>
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="面经内容"
                rows={8}
                className="resize-y"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRecord(null)}>
              取消
            </Button>
            <Button
              onClick={handleEditSave}
              style={{ backgroundColor: "#2D6A6A" }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.backgroundColor = "#245757";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.backgroundColor = "#2D6A6A";
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
