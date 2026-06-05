"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  ScanSearch,
  Trash2,
  Loader2,
  X,
  FileImage,
  CheckCircle2,
  AlertCircle,
  ClipboardPaste,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

interface PendingFile {
  id: string;
  file: File;
  preview: string;
}

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

export default function PopupPage() {
  const [records, setRecords] = useState<InterviewRecord[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [pasteMode, setPasteMode] = useState<"single" | "multi">("single");
  const [pasteFlash, setPasteFlash] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewRecord, setViewRecord] = useState<InterviewRecord | null>(null);
  const [editMode, setEditMode] = useState<"preview" | "edit">("preview");
  const [editCompany, setEditCompany] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editIndustry, setEditIndustry] = useState("");
  const [editContent, setEditContent] = useState("");
  const deviceIdRef = useRef<string>("");
  const isProcessingRef = useRef(false);

  // 初始化 deviceId
  useEffect(() => {
    let did = localStorage.getItem("mianjing_device_id");
    if (!did) {
      did = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      localStorage.setItem("mianjing_device_id", did);
    }
    deviceIdRef.current = did;
    // 加载历史记录
    fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchRecords() {
    try {
      const res = await fetch("/api/records", {
        headers: { "x-device-id": deviceIdRef.current },
      });
      const data = await res.json();
      if (data.success) {
        setRecords(
          (data.data as Record<string, unknown>[]).map(dbToRecord)
        );
      }
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }

  // 粘贴处理
  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length === 0) return;

      // 闪烁反馈
      setPasteFlash(true);
      setTimeout(() => setPasteFlash(false), 400);

      if (pasteMode === "single") {
        // 单张模式：立即处理
        for (const file of imageFiles) {
          await processSingleFile(file);
        }
      } else {
        // 多张模式：暂存
        const newPendings: PendingFile[] = imageFiles.map((file) => ({
          id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
          file,
          preview: URL.createObjectURL(file),
        }));
        setPendingFiles((prev) => [...prev, ...newPendings]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pasteMode]
  );

  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  // 上传单图并识别
  async function processSingleFile(file: File) {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const preview = URL.createObjectURL(file);

    const tempRecord: InterviewRecord = {
      id: tempId,
      imageUrl: preview,
      fileName: file.name || "截图",
      company: "",
      position: "",
      industry: "",
      content: "",
      originalContent: "",
      status: "extracting",
    };

    setRecords((prev) => [tempRecord, ...prev]);

    try {
      // 上传
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadData.success) throw new Error(uploadData.error || "上传失败");

      const imageUrl = uploadData.data.imageUrl as string;

      // 识别
      const extractRes = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });
      const extractData = await extractRes.json();
      if (!extractData.success) throw new Error(extractData.error || "识别失败");

      const extracted = extractData.data;
      const record: InterviewRecord = {
        ...tempRecord,
        imageUrl,
        company: extracted.company || "",
        position: extracted.position || "",
        industry: extracted.industry || "",
        content: extracted.content || "",
        originalContent: extracted.originalContent || extracted.content || "",
        status: "done",
      };

      // 保存到数据库
      const saveRes = await fetch("/api/records", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceIdRef.current,
        },
        body: JSON.stringify({
          device_id: deviceIdRef.current,
          image_url: imageUrl,
          company: record.company,
          position: record.position,
          industry: record.industry,
          content: record.content,
          original_content: record.originalContent,
          status: "done",
        }),
      });
      const saveData = await saveRes.json();
      if (saveData.success && saveData.data?.id) {
        record.id = saveData.data.id;
      }

      setRecords((prev) =>
        prev.map((r) => (r.id === tempId ? record : r))
      );
    } catch (err) {
      setRecords((prev) =>
        prev.map((r) =>
          r.id === tempId
            ? { ...r, status: "error", errorMsg: (err as Error).message }
            : r
        )
      );
    }
  }

  // 多图提交
  async function handleSubmitPending() {
    if (pendingFiles.length === 0 || isProcessingRef.current) return;
    isProcessingRef.current = true;

    const files = [...pendingFiles];
    setPendingFiles([]);

    const tempId = `temp_${Date.now()}_group`;

    const tempRecord: InterviewRecord = {
      id: tempId,
      imageUrl: files[0]?.preview || "",
      fileName: `${files.length}张图片`,
      company: "",
      position: "",
      industry: "",
      content: "",
      originalContent: "",
      status: "extracting",
    };

    setRecords((prev) => [tempRecord, ...prev]);

    try {
      const imageUrls: string[] = [];
      for (const pf of files) {
        const formData = new FormData();
        formData.append("file", pf.file);
        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        const uploadData = await uploadRes.json();
        if (!uploadData.success) throw new Error(uploadData.error || "上传失败");
        imageUrls.push(uploadData.data.imageUrl);
      }

      const extractRes = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrls }),
      });
      const extractData = await extractRes.json();
      if (!extractData.success) throw new Error(extractData.error || "识别失败");

      const extracted = extractData.data;
      const record: InterviewRecord = {
        ...tempRecord,
        imageUrl: imageUrls[0],
        company: extracted.company || "",
        position: extracted.position || "",
        industry: extracted.industry || "",
        content: extracted.content || "",
        originalContent: extracted.originalContent || extracted.content || "",
        status: "done",
      };

      const saveRes = await fetch("/api/records", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceIdRef.current,
        },
        body: JSON.stringify({
          device_id: deviceIdRef.current,
          image_url: imageUrls[0],
          company: record.company,
          position: record.position,
          industry: record.industry,
          content: record.content,
          original_content: record.originalContent,
          status: "done",
        }),
      });
      const saveData = await saveRes.json();
      if (saveData.success && saveData.data?.id) {
        record.id = saveData.data.id;
      }

      setRecords((prev) =>
        prev.map((r) => (r.id === tempId ? record : r))
      );
    } catch (err) {
      setRecords((prev) =>
        prev.map((r) =>
          r.id === tempId
            ? { ...r, status: "error", errorMsg: (err as Error).message }
            : r
        )
      );
    } finally {
      isProcessingRef.current = false;
    }
  }

  // 删除
  async function handleDelete(id: string) {
    setRecords((prev) => prev.filter((r) => r.id !== id));
    try {
      await fetch(`/api/records/${id}`, {
        method: "DELETE",
        headers: { "x-device-id": deviceIdRef.current },
      });
    } catch { /* 静默 */ }
  }

  // 编辑保存
  async function handleEditSave() {
    if (!viewRecord) return;
    const updated: InterviewRecord = {
      ...viewRecord,
      company: editCompany,
      position: editPosition,
      industry: editIndustry,
      content: editContent,
    };
    setRecords((prev) =>
      prev.map((r) => (r.id === viewRecord.id ? updated : r))
    );
    setViewRecord(null);
    try {
      await fetch(`/api/records/${viewRecord.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceIdRef.current,
        },
        body: JSON.stringify({
          company: editCompany,
          position: editPosition,
          industry: editIndustry,
          content: editContent,
        }),
      });
    } catch { /* 静默 */ }
  }

  function openEdit(record: InterviewRecord, mode: "preview" | "edit") {
    setViewRecord(record);
    setEditMode(mode);
    setEditCompany(record.company);
    setEditPosition(record.position);
    setEditIndustry(record.industry);
    setEditContent(record.content);
  }

  const doneCount = records.filter((r) => r.status === "done").length;
  const processingCount = records.filter(
    (r) => r.status === "extracting"
  ).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: "#F8F7F5" }}>
        <Spinner className="h-6 w-6" style={{ color: "#2D6A6A" }} />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: "#F8F7F5" }}>
      {/* 顶栏 */}
      <header
        className="shrink-0 border-b px-4 py-2 flex items-center justify-between"
        style={{ borderColor: "#E5E2DD", backgroundColor: "rgba(248,247,245,0.95)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="flex h-6 w-6 items-center justify-center rounded"
            style={{ backgroundColor: "#2D6A6A" }}
          >
            <ScanSearch className="h-3 w-3 text-white" />
          </div>
          <span className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>
            面经识客
          </span>
          <span className="text-xs" style={{ color: "#6B7280" }}>
            快捷浮窗
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: "#6B7280" }}>
          {doneCount > 0 && <span>已识别 {doneCount} 条</span>}
          {processingCount > 0 && (
            <span className="flex items-center gap-1">
              处理中 <Spinner className="h-3 w-3" />
            </span>
          )}
        </div>
      </header>

      {/* 粘贴区 */}
      <div className="shrink-0 px-4 py-3 border-b" style={{ borderColor: "#E5E2DD" }}>
        {/* 模式切换 */}
        <div className="flex items-center justify-center gap-1 mb-2">
          <button
            onClick={() => { setPasteMode("single"); setPendingFiles([]); }}
            className="px-3 py-1 rounded-l-full text-xs font-medium transition-all"
            style={{
              backgroundColor: pasteMode === "single" ? "#2D6A6A" : "#E5E2DD",
              color: pasteMode === "single" ? "#FFFFFF" : "#6B7280",
            }}
          >
            单张
          </button>
          <button
            onClick={() => setPasteMode("multi")}
            className="px-3 py-1 rounded-r-full text-xs font-medium transition-all"
            style={{
              backgroundColor: pasteMode === "multi" ? "#2D6A6A" : "#E5E2DD",
              color: pasteMode === "multi" ? "#FFFFFF" : "#6B7280",
            }}
          >
            多张
          </button>
        </div>

        {/* 粘贴区域 */}
        <div
          className="flex flex-col items-center justify-center py-4 rounded-lg border-2 border-dashed transition-all"
          style={{
            borderColor: pasteFlash ? "#2D6A6A" : "#E5E2DD",
            backgroundColor: pasteFlash ? "rgba(45,106,106,0.06)" : "rgba(255,255,255,0.5)",
          }}
        >
          <ClipboardPaste
            className="h-6 w-6 mb-1"
            style={{ color: pasteFlash ? "#2D6A6A" : "#9CA3AF" }}
          />
          <p className="text-xs font-medium" style={{ color: "#1A1A1A" }}>
            Ctrl + V 粘贴截图
          </p>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
            {pasteMode === "single" ? "粘贴后自动识别" : "粘贴后点击提交识别"}
          </p>
        </div>

        {/* 待提交区（仅多张模式） */}
        {pasteMode === "multi" && pendingFiles.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs" style={{ color: "#6B7280" }}>
                待提交 ({pendingFiles.length} 张)
              </span>
              <button
                onClick={() => setPendingFiles([])}
                className="text-xs hover:underline"
                style={{ color: "#C4463A" }}
              >
                清空
              </button>
            </div>
            <div className="flex gap-1.5 flex-wrap mb-2">
              {pendingFiles.map((pf) => (
                <div key={pf.id} className="relative group">
                  <img
                    src={pf.preview}
                    alt="待提交"
                    className="h-12 w-12 object-cover rounded border"
                    style={{ borderColor: "#E5E2DD" }}
                  />
                  <button
                    onClick={() =>
                      setPendingFiles((prev) => prev.filter((p) => p.id !== pf.id))
                    }
                    className="absolute -top-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: "#C4463A" }}
                  >
                    <X className="h-2.5 w-2.5 text-white" />
                  </button>
                </div>
              ))}
            </div>
            <Button
              onClick={handleSubmitPending}
              size="sm"
              className="w-full h-7 text-xs gap-1"
              style={{ backgroundColor: "#D4853A" }}
            >
              <ScanSearch className="h-3 w-3" />
              提交识别 ({pendingFiles.length} 张)
            </Button>
          </div>
        )}
      </div>

      {/* 记录列表 */}
      <div className="flex-1 overflow-y-auto">
        {records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12" style={{ color: "#9CA3AF" }}>
            <FileImage className="h-8 w-8 mb-2" />
            <p className="text-xs">粘贴面经截图开始识别</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "#E5E2DD" }}>
            {records.map((record) => (
              <div
                key={record.id}
                className="px-4 py-2.5 transition-colors hover:bg-white/60"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {record.status === "done" && (
                        <CheckCircle2 className="h-3 w-3 shrink-0" style={{ color: "#3D8B5E" }} />
                      )}
                      {record.status === "extracting" && (
                        <Loader2 className="h-3 w-3 shrink-0 animate-spin" style={{ color: "#D4853A" }} />
                      )}
                      {record.status === "error" && (
                        <AlertCircle className="h-3 w-3 shrink-0" style={{ color: "#C4463A" }} />
                      )}
                      <span className="text-sm font-medium truncate" style={{ color: "#1A1A1A" }}>
                        {record.company || "识别中..."}
                      </span>
                      {record.position && (
                        <span className="text-xs truncate" style={{ color: "#6B7280" }}>
                          - {record.position}
                        </span>
                      )}
                    </div>
                    {record.industry && (
                      <Badge
                        className="text-xs h-4 px-1.5 mr-1 mb-0.5"
                        style={{ backgroundColor: "rgba(45,106,106,0.1)", color: "#2D6A6A", border: "none" }}
                      >
                        {record.industry}
                      </Badge>
                    )}
                    {record.status === "done" && record.content && (
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: "#6B7280" }}>
                        {record.content}
                      </p>
                    )}
                    {record.status === "extracting" && (
                      <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "#D4853A" }}>
                        <Spinner className="h-3 w-3" /> 识别清洗中...
                      </p>
                    )}
                    {record.status === "error" && (
                      <p className="text-xs mt-1" style={{ color: "#C4463A" }}>
                        {record.errorMsg || "识别失败"}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {record.status === "done" && (
                      <>
                        <button
                          onClick={() => openEdit(record, "preview")}
                          className="h-6 w-6 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
                          title="查看"
                        >
                          <ScanSearch className="h-3.5 w-3.5" style={{ color: "#2D6A6A" }} />
                        </button>
                        <button
                          onClick={() => openEdit(record, "edit")}
                          className="h-6 w-6 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
                          title="编辑"
                        >
                          <FileImage className="h-3.5 w-3.5" style={{ color: "#6B7280" }} />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDelete(record.id)}
                      className="h-6 w-6 flex items-center justify-center rounded hover:bg-red-50 transition-colors"
                      title="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5" style={{ color: "#C4463A" }} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 查看/编辑弹窗 */}
      {viewRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.3)" }}>
          <div
            className="w-full max-w-md max-h-[80vh] overflow-hidden rounded-xl shadow-2xl flex flex-col"
            style={{ backgroundColor: "#FFFFFF" }}
          >
            {/* 弹窗头 */}
            <div
              className="shrink-0 px-4 py-3 border-b flex items-center justify-between"
              style={{ borderColor: "#E5E2DD" }}
            >
              <div className="flex-1 min-w-0">
                {editMode === "preview" ? (
                  <h3 className="text-sm font-semibold truncate" style={{ color: "#1A1A1A" }}>
                    {viewRecord.company || "未识别公司"} - {viewRecord.position || "未识别岗位"}
                  </h3>
                ) : (
                  <h3 className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>
                    编辑面经
                  </h3>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    if (editMode === "preview") {
                      setEditMode("edit");
                    } else {
                      setEditMode("preview");
                    }
                  }}
                  className="h-7 px-2.5 rounded text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: editMode === "edit" ? "rgba(45,106,106,0.1)" : "#F3F4F6",
                    color: editMode === "edit" ? "#2D6A6A" : "#6B7280",
                  }}
                >
                  {editMode === "preview" ? "编辑" : "预览"}
                </button>
                <button
                  onClick={() => { setViewRecord(null); setEditMode("preview"); }}
                  className="h-7 w-7 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
                >
                  <X className="h-4 w-4" style={{ color: "#6B7280" }} />
                </button>
              </div>
            </div>

            {/* 弹窗内容 */}
            <div className="flex-1 overflow-y-auto p-4">
              {editMode === "preview" ? (
                <div
                  className="text-sm whitespace-pre-wrap leading-relaxed"
                  style={{ color: "#1A1A1A" }}
                >
                  {viewRecord.content || "暂无内容"}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: "#6B7280" }}>
                      公司名称
                    </label>
                    <input
                      type="text"
                      value={editCompany}
                      onChange={(e) => setEditCompany(e.target.value)}
                      className="w-full h-8 px-3 rounded-md border text-sm"
                      style={{ borderColor: "#E5E2DD", color: "#1A1A1A" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: "#6B7280" }}>
                      行业
                    </label>
                    <div className="relative">
                      <select
                        value={editIndustry}
                        onChange={(e) => setEditIndustry(e.target.value)}
                        className="w-full h-8 px-3 rounded-md border text-sm appearance-none pr-8"
                        style={{ borderColor: "#E5E2DD", color: "#1A1A1A" }}
                      >
                        <option value="">选择行业</option>
                        {INDUSTRY_LIST.map((ind) => (
                          <option key={ind} value={ind}>{ind}</option>
                        ))}
                      </select>
                      <ChevronDown
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                        style={{ color: "#9CA3AF" }}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: "#6B7280" }}>
                      岗位名称
                    </label>
                    <input
                      type="text"
                      value={editPosition}
                      onChange={(e) => setEditPosition(e.target.value)}
                      className="w-full h-8 px-3 rounded-md border text-sm"
                      style={{ borderColor: "#E5E2DD", color: "#1A1A1A" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: "#6B7280" }}>
                      面经内容
                    </label>
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={8}
                      className="text-sm"
                      style={{ borderColor: "#E5E2DD", color: "#1A1A1A" }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 弹窗底部 */}
            {editMode === "edit" && (
              <div
                className="shrink-0 px-4 py-3 border-t flex justify-end gap-2"
                style={{ borderColor: "#E5E2DD" }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditMode("preview")}
                  className="h-7 text-xs"
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  onClick={handleEditSave}
                  className="h-7 text-xs"
                  style={{ backgroundColor: "#2D6A6A" }}
                >
                  保存
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
