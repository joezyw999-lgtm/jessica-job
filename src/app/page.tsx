"use client";

import { useState, useCallback, useRef } from "react";
import {
  Upload,
  ScanSearch,
  Sparkles,
  Trash2,
  Pencil,
  Download,
  Loader2,
  X,
  FileImage,
  CheckCircle2,
  AlertCircle,
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
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

interface InterviewRecord {
  id: string;
  imageUrl: string;
  fileName: string;
  company: string;
  position: string;
  content: string;
  originalContent: string;
  status: "pending" | "extracting" | "cleaning" | "done" | "error";
  errorMsg?: string;
}

export default function HomePage() {
  const [records, setRecords] = useState<InterviewRecord[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [editRecord, setEditRecord] = useState<InterviewRecord | null>(null);
  const [editCompany, setEditCompany] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editContent, setEditContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);

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

  // AI 提取面经信息
  const extractInfo = async (
    imageUrl: string
  ): Promise<{ company: string; position: string; content: string }> => {
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

  // AI 清洗面经内容
  const cleanContent = async (content: string): Promise<string> => {
    const res = await fetch("/api/clean", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || "清洗失败");
    }
    return data.data.cleanedContent;
  };

  // 处理文件
  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const imageFiles = Array.from(files).filter((f) =>
        f.type.startsWith("image/")
      );

      if (imageFiles.length === 0) return;

      // 创建待处理记录
      const newRecords: InterviewRecord[] = imageFiles.map((file) => ({
        id: genId(),
        imageUrl: "",
        fileName: file.name,
        company: "",
        position: "",
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

          // AI 识别
          const extracted = await extractInfo(imageUrl);

          setRecords((prev) =>
            prev.map((r) =>
              r.id === recordId
                ? {
                    ...r,
                    company: extracted.company,
                    position: extracted.position,
                    content: extracted.content,
                    originalContent: extracted.content,
                    status: "done",
                  }
                : r
            )
          );
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

  // 拖拽处理
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      processFiles(e.dataTransfer.files);
    },
    [processFiles]
  );

  // 点击上传
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        processFiles(e.target.files);
      }
      // 重置 input 以便重复选择同一文件
      e.target.value = "";
    },
    [processFiles]
  );

  // 清洗单条记录
  const handleCleanOne = async (record: InterviewRecord) => {
    if (!record.content) return;
    if (record.status === "cleaning") return;

    setRecords((prev) =>
      prev.map((r) => (r.id === record.id ? { ...r, status: "cleaning" } : r))
    );

    try {
      const cleaned = await cleanContent(record.content);
      setRecords((prev) =>
        prev.map((r) =>
          r.id === record.id
            ? { ...r, content: cleaned, status: "done" }
            : r
        )
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "清洗失败";
      setRecords((prev) =>
        prev.map((r) =>
          r.id === record.id ? { ...r, status: "error", errorMsg: msg } : r
        )
      );
    }
  };

  // 一键清洗全部
  const handleCleanAll = async () => {
    setIsProcessing(true);
    const doneRecords = records.filter(
      (r) => r.status === "done" && r.content
    );
    for (const record of doneRecords) {
      await handleCleanOne(record);
    }
    setIsProcessing(false);
  };

  // 删除记录
  const handleDelete = (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  // 编辑记录
  const handleEditOpen = (record: InterviewRecord) => {
    setEditRecord(record);
    setEditCompany(record.company);
    setEditPosition(record.position);
    setEditContent(record.content);
  };

  const handleEditSave = () => {
    if (!editRecord) return;
    setRecords((prev) =>
      prev.map((r) =>
        r.id === editRecord.id
          ? { ...r, company: editCompany, position: editPosition, content: editContent }
          : r
      )
    );
    setEditRecord(null);
  };

  // 导出 CSV
  const handleExport = () => {
    const doneRecords = records.filter((r) => r.status === "done");
    if (doneRecords.length === 0) return;

    const headers = ["序号", "公司", "岗位", "面经内容"];
    const rows = doneRecords.map((r, i) => [
      String(i + 1),
      r.company,
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
      case "cleaning":
        return (
          <Badge className="bg-[#D4853A]/15 text-[#D4853A] border-[#D4853A]/30">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            清洗中
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
    (r) => r.status === "extracting" || r.status === "cleaning" || r.status === "pending"
  ).length;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F8F7F5" }}>
      {/* 顶部导航 */}
      <header className="sticky top-0 z-50 border-b" style={{ borderColor: "#E5E2DD", backgroundColor: "rgba(248,247,245,0.9)", backdropFilter: "blur(12px)" }}>
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: "#2D6A6A" }}>
              <ScanSearch className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold" style={{ color: "#1A1A1A" }}>
                面经识客
              </h1>
              <p className="text-xs" style={{ color: "#6B7280" }}>
                AI 驱动的面经图片识别与内容清洗工具
              </p>
            </div>
          </div>
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
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {/* 上传区域 */}
        <Card
          className="border-2 border-dashed transition-all duration-200 cursor-pointer"
          style={{
            borderColor: isDragOver ? "#2D6A6A" : "#E5E2DD",
            backgroundColor: isDragOver ? "rgba(45,106,106,0.04)" : "#FFFFFF",
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div
              className="mb-4 flex h-14 w-14 items-center justify-center rounded-full"
              style={{ backgroundColor: isDragOver ? "rgba(45,106,106,0.12)" : "#F8F7F5" }}
            >
              <Upload
                className="h-6 w-6 transition-colors"
                style={{ color: isDragOver ? "#2D6A6A" : "#6B7280" }}
              />
            </div>
            <p className="text-sm font-medium" style={{ color: "#1A1A1A" }}>
              {isDragOver ? "释放图片开始识别" : "拖拽面经图片到此处，或点击上传"}
            </p>
            <p className="mt-1 text-xs" style={{ color: "#6B7280" }}>
              支持 JPG / PNG / GIF / WebP / BMP，单张不超过 10MB，可同时上传多张
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </CardContent>
        </Card>

        {/* 操作栏与表格 */}
        {records.length > 0 && (
          <>
            {/* 操作栏 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleCleanAll}
                  disabled={doneCount === 0 || isProcessing}
                  className="gap-2 transition-all hover:-translate-y-px"
                  style={{ backgroundColor: "#2D6A6A" }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.backgroundColor = "#245757";
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.backgroundColor = "#2D6A6A";
                  }}
                >
                  <Sparkles className="h-4 w-4" />
                  一键清洗全部
                </Button>
                <Button
                  variant="outline"
                  onClick={handleExport}
                  disabled={doneCount === 0}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  导出 CSV
                </Button>
              </div>
              <Button
                variant="ghost"
                onClick={() => setRecords([])}
                className="text-xs gap-1"
                style={{ color: "#C4463A" }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                清空全部
              </Button>
            </div>

            <Separator style={{ backgroundColor: "#E5E2DD" }} />

            {/* 结果表格 */}
            <Card style={{ backgroundColor: "#FFFFFF" }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base" style={{ color: "#1A1A1A" }}>
                  识别结果
                </CardTitle>
                <CardDescription>
                  共 {records.length} 条记录，其中 {doneCount} 条已完成识别
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow style={{ borderColor: "#E5E2DD" }}>
                        <TableHead className="w-12 text-center">#</TableHead>
                        <TableHead className="w-16">图片</TableHead>
                        <TableHead className="w-28">公司</TableHead>
                        <TableHead className="w-28">岗位</TableHead>
                        <TableHead>面经内容</TableHead>
                        <TableHead className="w-20 text-center">状态</TableHead>
                        <TableHead className="w-32 text-center">操作</TableHead>
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
                              <span style={{ color: "#6B7280" }}>—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm" style={{ color: "#1A1A1A" }}>
                            {record.position || (
                              <span style={{ color: "#6B7280" }}>—</span>
                            )}
                          </TableCell>
                          <TableCell className="max-w-md">
                            <div
                              className="text-sm line-clamp-3 whitespace-pre-wrap"
                              style={{ color: "#1A1A1A" }}
                            >
                              {record.content || (
                                <span style={{ color: "#6B7280" }}>
                                  {record.status === "extracting"
                                    ? "正在识别内容..."
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
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handleEditOpen(record)}
                                    title="编辑"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handleCleanOne(record)}
                                    title="清洗内容"
                                  >
                                    <Sparkles className="h-3.5 w-3.5" style={{ color: "#2D6A6A" }} />
                                  </Button>
                                </>
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
              </CardContent>
            </Card>
          </>
        )}

        {/* 空状态 */}
        {records.length === 0 && (
          <div className="flex flex-col items-center py-16">
            <div
              className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl"
              style={{ backgroundColor: "#F0EEEB" }}
            >
              <FileImage className="h-10 w-10" style={{ color: "#6B7280" }} />
            </div>
            <h3 className="text-base font-medium" style={{ color: "#1A1A1A" }}>
              上传面经图片，开始智能识别
            </h3>
            <p className="mt-2 text-sm text-center max-w-md" style={{ color: "#6B7280" }}>
              上传面试经验截图，AI 将自动识别其中的公司名称、岗位信息和面经内容，
              并智能清洗冗余信息，只保留有效面试干货。
            </p>
          </div>
        )}
      </main>

      {/* 编辑弹窗 */}
      <Dialog open={!!editRecord} onOpenChange={(open) => !open && setEditRecord(null)}>
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
