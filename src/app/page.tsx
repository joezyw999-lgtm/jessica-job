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
  ChevronLeft,
  ChevronRight,
  Puzzle,
  Radar,
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
  imageUrls: string[];
  fileName: string;
  company: string;
  position: string;
  industry: string;
  category: string;
  experienceType: string;
  country: string;
  content: string;
  originalContent: string;
  status: "pending" | "extracting" | "done" | "error";
  errorMsg?: string;
  createdAt?: string;
}

// DB 行 → 前端 Record
function dbToRecord(row: Record<string, unknown>): InterviewRecord {
  let imageUrls: string[] = [];
  try {
    if (row.image_urls) imageUrls = JSON.parse(row.image_urls as string);
  } catch { /* ignore */ }
  if (imageUrls.length === 0 && row.image_url) {
    imageUrls = [row.image_url as string];
  }
  return {
    id: row.id as string,
    imageUrl: (row.image_url as string) || "",
    imageUrls,
    fileName: (row.image_file_key as string) || "图片",
    company: (row.company as string) || "",
    position: (row.position as string) || "",
    industry: (row.industry as string) || "",
    category: (row.category as string) || "国内",
    experienceType: (row.experience_type as string) || "面经",
    country: (row.country as string) || "大陆",
    content: (row.content as string) || "",
    originalContent: (row.original_content as string) || "",
    status: (row.status as InterviewRecord["status"]) || "done",
    createdAt: (row.created_at as string) || undefined,
  };
}

export default function HomePage() {
  const [records, setRecords] = useState<InterviewRecord[]>([]);

  const [editRecord, setEditRecord] = useState<InterviewRecord | null>(null);
  const [editCompany, setEditCompany] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editIndustry, setEditIndustry] = useState("");
  const [editCategory, setEditCategory] = useState("国内");
  const [editExperienceType, setEditExperienceType] = useState("面经");
  const [editCountry, setEditCountry] = useState("大陆");
  const [editContent, setEditContent] = useState("");
  const [editMode, setEditMode] = useState<"preview" | "edit">("preview");
  const [previewRecordId, setPreviewRecordId] = useState<string | null>(null);
  const [previewSubIndex, setPreviewSubIndex] = useState(0);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [industryDropdownOpen, setIndustryDropdownOpen] = useState(false);
  const [pasteFlash, setPasteFlash] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingFiles, setPendingFiles] = useState<{ id: string; file: File; preview: string }[]>([]);
  const [pasteMode, setPasteMode] = useState<"single" | "multi">("single");

  const [textInput, setTextInput] = useState("");
  const [textExtracting, setTextExtracting] = useState(false);
  const processFilesRef = useRef<(files: File[]) => void>(() => {});

  // 设备 ID：首次访问时生成，存入 localStorage，用于数据隔离
  const deviceIdRef = useRef<string>("");
  const [deviceId, setDeviceId] = useState<string>("");

  useEffect(() => {
    // 优先从 URL 参数读取 deviceId（用于扩展同步）
    const urlParams = new URLSearchParams(window.location.search);
    const urlDeviceId = urlParams.get("device_id");
    if (urlDeviceId) {
      localStorage.setItem("mianjing_device_id", urlDeviceId);
      // 清除 URL 参数，保持干净
      window.history.replaceState({}, "", window.location.pathname);
    }
    let did = localStorage.getItem("mianjing_device_id");
    if (!did) {
      did = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem("mianjing_device_id", did);
    }
    deviceIdRef.current = did;
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

          // 刷新过期的图片预签名 URL
          try {
            const refreshRes = await fetch("/api/records/refresh-urls", {
              method: "POST",
              headers: { "x-device-id": deviceId },
            });
            const refreshData = await refreshRes.json();
            if (refreshData.success && refreshData.data) {
              const urlMap = refreshData.data as Record<string, string>;
              if (Object.keys(urlMap).length > 0) {
                setRecords(prev => prev.map(r => {
                  const newUrl = urlMap[r.id];
                  if (newUrl) {
                    return { ...r, imageUrl: newUrl, imageUrls: [newUrl] };
                  }
                  return r;
                }));
              }
            }
          } catch {
            // URL 刷新失败不影响页面展示
          }
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
  const uploadImage = async (file: File): Promise<{ imageUrl: string; fileKey: string }> => {
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
    return { imageUrl: data.data.imageUrl, fileKey: data.data.fileKey };
  };

  // AI 提取面经信息（已包含清洗），支持多张图片
  const extractTextInfo = async (
    rawText: string
  ): Promise<{ company: string; position: string; industry: string; category: string; experienceType: string; country: string; content: string; originalContent: string }> => {
    const res = await fetch("/api/extract-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: rawText }),
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || "识别失败");
    }
    return data.data;
  };

  // 处理文字识别
  const handleTextExtract = useCallback(async () => {
    if (!textInput.trim()) return;
    const text = textInput.trim();
    setTextInput("");
    setTextExtracting(true);

    const tempId = `text_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newRecord: InterviewRecord = {
      id: tempId,
      imageUrl: "",
      imageUrls: [],
      fileName: "",
      company: "",
      position: "",
      industry: "",
      category: "国内",
      experienceType: "面经",
      country: "大陆",
      content: "",
      originalContent: text,
      status: "extracting",
      createdAt: new Date().toISOString(),
    };
    setRecords(prev => [newRecord, ...prev]);

    try {
      const extracted = await extractTextInfo(text);

      // 保存到数据库
      try {
        const dbRes = await fetch("/api/records", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-device-id": deviceIdRef.current },
          body: JSON.stringify({
            device_id: deviceIdRef.current,
            image_url: "",
            image_urls: JSON.stringify([]),
            company: extracted.company,
            position: extracted.position,
            industry: extracted.industry,
            category: extracted.category || "国内",
            experience_type: extracted.experienceType || "面经",
            country: extracted.country || "大陆",
            original_content: text,
            content: extracted.content,
            status: "done",
          }),
        });
        const dbData = await dbRes.json();
        const dbId = dbData.success && dbData.data?.id ? dbData.data.id : tempId;

        setRecords(prev =>
          prev.map(r =>
            r.id === tempId
              ? {
                  ...r,
                  id: dbId,
                  company: extracted.company,
                  position: extracted.position,
                  industry: extracted.industry,
                  category: extracted.category || "国内",
                  experienceType: extracted.experienceType || "面经",
                  country: extracted.country || "大陆",
                  content: extracted.content,
                  originalContent: text,
                  status: "done",
                }
              : r
          )
        );
      } catch {
        // DB 保存失败，仍更新本地记录
        setRecords(prev =>
          prev.map(r =>
            r.id === tempId
              ? {
                  ...r,
                  company: extracted.company,
                  position: extracted.position,
                  industry: extracted.industry,
                  category: extracted.category || "国内",
                  experienceType: extracted.experienceType || "面经",
                  country: extracted.country || "大陆",
                  content: extracted.content,
                  originalContent: text,
                  status: "done",
                }
              : r
          )
        );
      }
      setTextExtracting(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "识别失败";
      setRecords(prev =>
        prev.map(r => (r.id === tempId ? { ...r, status: "error" as const, content: errorMsg } : r))
      );
      setTextExtracting(false);
    }
  }, [textInput]);

  // 处理文字粘贴（Ctrl+V 粘贴纯文字时）
  const handleTextPaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData.getData("text");
    if (pastedText) {
      setTextInput(pastedText);
      e.preventDefault();
    }
  }, []);

  const extractInfo = async (
    imageUrls: string[]
  ): Promise<{ company: string; position: string; industry: string; category: string; experienceType: string; country: string; content: string; originalContent: string }> => {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(imageUrls.length > 1 ? { imageUrls } : { imageUrl: imageUrls[0] }),
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || "识别失败");
    }
    return data.data;
  };

  // 提交待处理图片
  const handleSubmit = async () => {
    if (pendingFiles.length === 0) return;
    const filesToProcess = [...pendingFiles];
    setPendingFiles([]);

    try {
      // 创建一条记录
      const recordId = genId();
      const newRecord: InterviewRecord = {
        id: recordId,
        imageUrl: "",
        imageUrls: [],
        fileName: filesToProcess.length > 1 ? `${filesToProcess.length}张面经截图` : (filesToProcess[0].file.name || "粘贴的图片"),
        company: "",
        position: "",
        industry: "",
        category: "国内",
        experienceType: "面经",
        country: "大陆",
        content: "",
        originalContent: "",
        status: "extracting",
      };

      setRecords((prev) => [newRecord, ...prev]);

      // 上传所有图片
      const imageUrls: string[] = [];
      const imageFileKeys: string[] = [];
      for (const pf of filesToProcess) {
        const { imageUrl, fileKey } = await uploadImage(pf.file);
        imageUrls.push(imageUrl);
        imageFileKeys.push(fileKey);
      }

      // 更新缩略图
      if (imageUrls.length > 0) {
        setRecords((prev) =>
          prev.map((r) =>
            r.id === recordId ? { ...r, imageUrl: imageUrls[0], imageUrls } : r
          )
        );
      }

      // AI 识别 + 清洗（一次传所有图片）
      const extracted = await extractInfo(imageUrls);

      // 保存到数据库
      try {
        const dbRes = await fetch("/api/records", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-device-id": deviceIdRef.current },
          body: JSON.stringify({
            device_id: deviceIdRef.current,
            image_url: imageUrls[0],
            image_urls: JSON.stringify(imageUrls),
            image_file_key: imageFileKeys.join(","),
            company: extracted.company,
            position: extracted.position,
            industry: extracted.industry,
            category: extracted.category || "国内",
            experience_type: extracted.experienceType || "面经",
            country: extracted.country || "大陆",
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
                  imageUrl: imageUrls[0],
                  imageUrls,
                  company: extracted.company,
                  position: extracted.position,
                  industry: extracted.industry,
                  category: extracted.category || "国内",
                  experienceType: extracted.experienceType || "面经",
                  country: extracted.country || "大陆",
                  content: extracted.content,
                  originalContent: extracted.originalContent,
                  status: "done",
                }
              : r
          )
        );
      } catch {
        setRecords((prev) =>
          prev.map((r) =>
            r.id === recordId
              ? {
                  ...r,
                  company: extracted.company,
                  position: extracted.position,
                  industry: extracted.industry,
                  category: extracted.category || "国内",
                  experienceType: extracted.experienceType || "面经",
                  country: extracted.country || "大陆",
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
      // 找到最近添加的 extracting 记录标记为错误
      setRecords((prev) => {
        const idx = prev.findIndex((r) => r.status === "extracting");
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], status: "error", errorMsg: msg };
          return updated;
        }
        return prev;
      });
    }
  };

  // 单张模式：粘贴后立即识别
  const processSingleFile = async (file: File) => {
    const recordId = genId();
    const newRecord: InterviewRecord = {
      id: recordId,
      imageUrl: "",
      imageUrls: [],
      fileName: file.name || "粘贴的图片",
      company: "",
      position: "",
      industry: "",
      category: "国内",
      experienceType: "面经",
      country: "大陆",
      content: "",
      originalContent: "",
      status: "extracting",
    };

    setRecords((prev) => [newRecord, ...prev]);

    try {
      const { imageUrl: uploadedUrl, fileKey } = await uploadImage(file);
      setRecords((prev) =>
        prev.map((r) => r.id === recordId ? { ...r, imageUrl: uploadedUrl, imageUrls: [uploadedUrl] } : r)
      );

      const extracted = await extractInfo([uploadedUrl]);

      try {
        const dbRes = await fetch("/api/records", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-device-id": deviceIdRef.current },
          body: JSON.stringify({
            device_id: deviceIdRef.current,
            image_url: uploadedUrl,
            image_urls: JSON.stringify([uploadedUrl]),
            image_file_key: fileKey,
            company: extracted.company,
            position: extracted.position,
            industry: extracted.industry,
            category: extracted.category || "国内",
            experience_type: extracted.experienceType || "面经",
            country: extracted.country || "大陆",
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
              ? { ...r, id: dbId, company: extracted.company, position: extracted.position, industry: extracted.industry, category: extracted.category || "国内", experienceType: extracted.experienceType || "面经", country: extracted.country || "大陆", content: extracted.content, originalContent: extracted.originalContent, status: "done" }
              : r
          )
        );
      } catch {
        setRecords((prev) =>
          prev.map((r) =>
            r.id === recordId
              ? { ...r, company: extracted.company, position: extracted.position, industry: extracted.industry, category: extracted.category || "国内", experienceType: extracted.experienceType || "面经", country: extracted.country || "大陆", content: extracted.content, originalContent: extracted.originalContent, status: "done" }
              : r
          )
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "处理失败";
      setRecords((prev) => {
        const idx = prev.findIndex((r) => r.status === "extracting");
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], status: "error", errorMsg: msg };
          return updated;
        }
        return prev;
      });
    }
  };

  // 全局粘贴监听
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      // 检测图片
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        // 有图片 → 走图片识别流程
        e.preventDefault();
        setPasteFlash(true);
        setTimeout(() => setPasteFlash(false), 600);

        if (pasteMode === "single") {
          imageFiles.forEach((file) => processSingleFile(file));
        } else {
          const newPending = imageFiles.map((file) => ({
            id: `pf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            file,
            preview: URL.createObjectURL(file),
          }));
          setPendingFiles((prev) => [...prev, ...newPending]);
        }
      } else {
        // 无图片 → 检测纯文字，自动填充到文字输入区
        const pastedText = e.clipboardData?.getData("text");
        if (pastedText && pastedText.trim().length > 0) {
          // 只在焦点不在 textarea/input 时自动填充（避免干扰正常输入）
          const activeEl = document.activeElement;
          const isTyping = activeEl instanceof HTMLTextAreaElement || activeEl instanceof HTMLInputElement;
          if (!isTyping) {
            e.preventDefault();
            setTextInput(pastedText);
          }
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [pasteMode]);

  // 图片灯箱键盘导航
  useEffect(() => {
    if (!previewRecordId) return;
    const record = records.find((r) => r.id === previewRecordId);
    const total = record?.imageUrls?.length || 1;
    if (total <= 1) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") setPreviewRecordId(null);
      };
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setPreviewSubIndex((prev) => (prev > 0 ? prev - 1 : total - 1));
      } else if (e.key === "ArrowRight") {
        setPreviewSubIndex((prev) => (prev < total - 1 ? prev + 1 : 0));
      } else if (e.key === "Escape") {
        setPreviewRecordId(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [previewRecordId, records]);

  // 删除记录
  const handleDelete = async (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
    // 同步删除数据库记录
    try {
      await fetch(`/api/records/${id}`, { method: "DELETE", headers: { "x-device-id": deviceIdRef.current } });
    } catch {
      // DB 删除失败，本地已删除即可
    }
  };

  // 打开预览/编辑弹窗
  const handleDetailOpen = (record: InterviewRecord, mode: "preview" | "edit") => {
    setEditRecord(record);
    setEditCompany(record.company);
    setEditPosition(record.position);
    setEditIndustry(record.industry);
    setEditCategory(record.category || "国内");
    setEditExperienceType(record.experienceType || "面经");
    setEditCountry(record.country || "大陆");
    setEditContent(record.content);
    setEditMode(mode);
    setIndustryDropdownOpen(false);
  };

  const handleEditSave = async () => {
    if (!editRecord) return;
    setRecords((prev) =>
      prev.map((r) =>
        r.id === editRecord.id
          ? { ...r, company: editCompany, position: editPosition, industry: editIndustry, category: editCategory, experienceType: editExperienceType, country: editCountry, content: editContent }
          : r
      )
    );
    setEditRecord(null);
    // 同步更新数据库
    try {
      await fetch(`/api/records/${editRecord.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-device-id": deviceIdRef.current },
        body: JSON.stringify({
          company: editCompany,
          position: editPosition,
          industry: editIndustry,
          category: editCategory,
          experience_type: editExperienceType,
          country: editCountry,
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

    const headers = ["面经类别", "类型", "国家", "行业", "公司名称", "岗位名称", "内容"];
    const rows = doneRecords.map((r) => [
      r.category || "国内",
      r.experienceType || "面经",
      r.country || "大陆",
      r.industry,
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
  const StatusBadge = ({ status, errorMsg, content }: { status: InterviewRecord["status"]; errorMsg?: string; content?: string }) => {
    if (status === "done" && content === "无有效面试信息") {
      return (
        <Badge variant="destructive">
          <AlertCircle className="mr-1 h-3 w-3" />
          失败
        </Badge>
      );
    }
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
  const failedCount = records.filter(
    (r) => r.status === "error" || (r.status === "done" && r.content === "无有效面试信息")
  ).length;

  // 今日和本周统计
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayOfWeek = now.getDay() || 7;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1).getTime();

  const todayCount = records.filter((r) => {
    if (!r.createdAt) return false;
    const t = new Date(r.createdAt).getTime();
    return t >= todayStart;
  }).length;
  const weekCount = records.filter((r) => {
    if (!r.createdAt) return false;
    const t = new Date(r.createdAt).getTime();
    return t >= weekStart;
  }).length;

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: "#F8F7F5" }}>
      {/* 顶部导航 */}
      <header className="shrink-0 border-b z-50" style={{ borderColor: "#E5E2DD", backgroundColor: "rgba(248,247,245,0.95)", backdropFilter: "blur(12px)" }}>
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: "#2D6A6A" }}>
              <ScanSearch className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-semibold" style={{ color: "#1A1A1A" }}>面经整理</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-4 text-sm mr-2" style={{ color: "#6B7280" }}>
              <span className="flex items-center gap-1">
                <span className="text-xs">本日</span>
                <strong style={{ color: "#2D6A6A" }}>{todayCount}</strong>
              </span>
              <span className="flex items-center gap-1">
                <span className="text-xs">本周</span>
                <strong style={{ color: "#2D6A6A" }}>{weekCount}</strong>
              </span>
              {failedCount > 0 && (
                <span className="flex items-center gap-1">
                  <span className="text-xs">失败</span>
                  <strong style={{ color: "#C4463A" }}>{failedCount}</strong>
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open("/campus", "_blank")}
              className="gap-1.5 h-8"
              style={{ borderColor: "#2D6A6A", color: "#2D6A6A" }}
            >
              <Radar className="h-3.5 w-3.5" />
              校招雷达
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open("/chrome-extension", "_blank")}
              className="gap-1.5 h-8"
              style={{ borderColor: "#D4853A", color: "#D4853A" }}
            >
              <Puzzle className="h-3.5 w-3.5" />
              浏览器扩展
            </Button>
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
            {/* 单张/多张切换 */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-medium" style={{ color: "#6B7280" }}>模式</span>
              <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: "#E5E2DD" }}>
                <button
                  onClick={() => { setPasteMode("single"); pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.preview)); setPendingFiles([]); }}
                  className="px-3 py-1 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: pasteMode === "single" ? "#2D6A6A" : "#FFFFFF",
                    color: pasteMode === "single" ? "#FFFFFF" : "#6B7280",
                  }}
                >
                  单张
                </button>
                <button
                  onClick={() => setPasteMode("multi")}
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
                  style={{ backgroundColor: pasteFlash ? "rgba(45,106,106,0.15)" : "#EDEBE8" }}
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

            {/* 文字输入区（始终可见，有内容时展开） */}
            <div className="mt-3">
              <div
                className="rounded-xl border-2 transition-all duration-300 overflow-hidden"
                style={{
                  borderColor: textInput.length > 0 ? "#2D6A6A" : "#E5E2DD",
                  backgroundColor: "#F8F7F5",
                }}
              >
                <div className="p-3">
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="也可以在这里粘贴面经文字内容..."
                    className="w-full resize-none rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all"
                    style={{
                      borderColor: "#E5E2DD",
                      backgroundColor: "#FFFFFF",
                      color: "#1A1A1A",
                      height: textInput.length > 0 ? "160px" : "48px",
                      minHeight: "48px",
                    }}
                    onFocus={(e) => { if (textInput.length === 0) e.target.style.height = "120px"; }}
                    onBlur={(e) => { if (textInput.length === 0) e.target.style.height = "48px"; }}
                  />
                  {textInput.length > 0 && (
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs" style={{ color: "#9CA3AF" }}>
                        {textInput.length} 字
                      </span>
                      <Button
                        onClick={handleTextExtract}
                        disabled={textExtracting || textInput.trim().length === 0}
                        className="gap-1.5 h-8 text-xs font-medium px-4"
                        style={{ backgroundColor: textInput.trim().length === 0 ? "#9CA3AF" : "#D4853A", color: "#FFFFFF" }}
                      >
                        {textExtracting ? (
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
          </div>

          {/* 待提交图片区（仅多张模式） */}
          {pasteMode === "multi" && pendingFiles.length > 0 && (
            <div className="shrink-0 px-4 pb-3">
              <div className="rounded-lg border p-3" style={{ borderColor: "#D4853A", backgroundColor: "rgba(212,133,58,0.04)" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium" style={{ color: "#D4853A" }}>
                    待提交 ({pendingFiles.length} 张)
                  </span>
                  <button
                    onClick={() => {
                      pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.preview));
                      setPendingFiles([]);
                    }}
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
                        onClick={() => {
                          URL.revokeObjectURL(pf.preview);
                          setPendingFiles((prev) => prev.filter((p) => p.id !== pf.id));
                        }}
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
                  onClick={handleSubmit}
                  disabled={pendingFiles.length === 0}
                  className="w-full gap-1.5 h-9 text-sm font-medium"
                  style={{ backgroundColor: "#D4853A", color: "#FFFFFF" }}
                >
                  <>
                    <ScanSearch className="h-3.5 w-3.5" />
                    提交识别
                  </>
                </Button>
              </div>
            </div>
          )}

          {/* 缩略图列表 */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: "#6B7280" }}>
                已识别记录 ({records.length})
              </span>
              {records.length > 0 && (
                <button
                  onClick={() => setConfirmClearOpen(true)}
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
                        <div
                          className="relative h-12 w-12 overflow-hidden rounded-md border"
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
                        <StatusBadge status={record.status} errorMsg={record.errorMsg} content={record.content} />
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
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Spinner className="h-8 w-8" style={{ color: "#2D6A6A" }} />
                <p className="text-sm" style={{ color: "#6B7280" }}>加载中...</p>
              </div>
            </div>
          ) : records.length === 0 ? (
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
                      <TableHead className="w-16 text-center">类别</TableHead>
                      <TableHead className="w-16 text-center">类型</TableHead>
                      <TableHead className="w-16 text-center">国家</TableHead>
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
                            <div
                              className="relative h-10 w-10 overflow-hidden rounded border cursor-pointer hover:opacity-80 transition-opacity"
                              style={{ borderColor: "#E5E2DD" }}
                              onClick={() => {
                                setPreviewSubIndex(0);
                                setPreviewRecordId(record.id);
                              }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={record.imageUrl}
                                alt={record.fileName}
                                className="h-full w-full object-cover"
                              />
                              {record.imageUrls && record.imageUrls.length > 1 && (
                                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: "#2D6A6A" }}>
                                  {record.imageUrls.length}
                                </span>
                              )}
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
                        <TableCell className="text-center">
                          <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: "rgba(212,133,58,0.12)", color: "#D4853A" }}>
                            {record.category || "国内"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${record.experienceType === "笔经" ? "bg-purple-50 text-purple-600" : ""}`} style={record.experienceType === "笔经" ? {} : { backgroundColor: "rgba(45,106,106,0.1)", color: "#2D6A6A" }}>
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
                          <StatusBadge status={record.status} errorMsg={record.errorMsg} content={record.content} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            {record.status === "done" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleDetailOpen(record, "preview")}
                                title="查看"
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
            </>
          )}
        </main>
      </div>

      {/* 预览/编辑弹窗 */}
      <Dialog open={!!editRecord} onOpenChange={(open) => { if (!open) { setEditRecord(null); setIndustryDropdownOpen(false); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg" style={{ color: "#1A1A1A" }}>
                {editRecord ? `${editRecord.company || "未知公司"} - ${editRecord.position || "未知岗位"}` : ""}
              </DialogTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-7 text-xs"
                onClick={() => {
                  if (editMode === "preview") {
                    setEditMode("edit");
                  } else {
                    setEditMode("preview");
                  }
                }}
              >
                <Pencil className="h-3 w-3" />
                {editMode === "preview" ? "编辑" : "预览"}
              </Button>
            </div>
          </DialogHeader>

          {editMode === "preview" ? (
            /* 预览模式 */
            <div className="flex-1 overflow-y-auto py-2">
              <div
                className="text-sm leading-relaxed whitespace-pre-wrap"
                style={{ color: "#1A1A1A", lineHeight: "1.8" }}
              >
                {editRecord?.content || "暂无内容"}
              </div>
            </div>
          ) : (
            /* 编辑模式 */
            <div className="flex-1 overflow-y-auto py-2 space-y-4">
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
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium" style={{ color: "#1A1A1A" }}>
                    类别
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="flex h-9 w-full rounded-md border px-3 text-sm"
                    style={{ borderColor: "#E5E2DD", backgroundColor: "#FFFFFF", color: "#1A1A1A" }}
                  >
                    <option value="国内">国内</option>
                    <option value="海外">海外</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" style={{ color: "#1A1A1A" }}>
                    类型
                  </label>
                  <select
                    value={editExperienceType}
                    onChange={(e) => setEditExperienceType(e.target.value)}
                    className="flex h-9 w-full rounded-md border px-3 text-sm"
                    style={{ borderColor: "#E5E2DD", backgroundColor: "#FFFFFF", color: "#1A1A1A" }}
                  >
                    <option value="面经">面经</option>
                    <option value="笔经">笔经</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" style={{ color: "#1A1A1A" }}>
                    国家
                  </label>
                  <select
                    value={editCountry}
                    onChange={(e) => setEditCountry(e.target.value)}
                    className="flex h-9 w-full rounded-md border px-3 text-sm"
                    style={{ borderColor: "#E5E2DD", backgroundColor: "#FFFFFF", color: "#1A1A1A" }}
                  >
                    <option value="大陆">大陆</option>
                    <option value="香港">香港</option>
                    <option value="台湾">台湾</option>
                    <option value="新加坡">新加坡</option>
                    <option value="美国">美国</option>
                    <option value="英国">英国</option>
                    <option value="日本">日本</option>
                    <option value="韩国">韩国</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
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
          )}

          <DialogFooter className="shrink-0">
            {editMode === "preview" ? (
              <Button variant="outline" onClick={() => setEditRecord(null)}>
                关闭
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setEditMode("preview")}>
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
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* 图片预览灯箱 */}
      {previewRecordId && (() => {
        const record = records.find((r) => r.id === previewRecordId);
        const images = record?.imageUrls?.filter(Boolean) || [];
        if (images.length === 0) return null;
        const total = images.length;
        const goPrev = () => setPreviewSubIndex((prev) => (prev > 0 ? prev - 1 : total - 1));
        const goNext = () => setPreviewSubIndex((prev) => (prev < total - 1 ? prev + 1 : 0));
        const close = () => setPreviewRecordId(null);

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.85)" }}
            onClick={close}
          >
            {/* 关闭按钮 */}
            <button
              className="absolute top-4 right-4 h-8 w-8 rounded-full flex items-center justify-center transition-colors"
              style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#FFFFFF" }}
              onClick={close}
            >
              <X className="h-4 w-4" />
            </button>

            {/* 左箭头 */}
            {total > 1 && (
              <button
                className="absolute left-4 h-10 w-10 rounded-full flex items-center justify-center transition-colors hover:bg-white/25"
                style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#FFFFFF" }}
                onClick={(e) => { e.stopPropagation(); goPrev(); }}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}

            {/* 图片 */}
            <div
              className="flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[previewSubIndex]}
                alt="面经原图"
                className="max-w-[90vw] max-h-[78vh] object-contain rounded select-none"
                style={{ transition: "opacity 0.2s ease" }}
              />
              {/* 底部信息 */}
              <div className="mt-3 flex items-center gap-3 text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
                {record?.company && <span>{record.company}</span>}
                {record?.company && record?.position && <span>·</span>}
                {record?.position && <span>{record.position}</span>}
                {total > 1 && (
                  <>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>|</span>
                    <span>{previewSubIndex + 1} / {total}</span>
                  </>
                )}
              </div>
            </div>

            {/* 右箭头 */}
            {total > 1 && (
              <button
                className="absolute right-4 h-10 w-10 rounded-full flex items-center justify-center transition-colors hover:bg-white/25"
                style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#FFFFFF" }}
                onClick={(e) => { e.stopPropagation(); goNext(); }}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </div>
        );
      })()}

      {/* 清空确认弹窗 */}
      <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ color: "#1A1A1A" }}>确认清空所有记录？</DialogTitle>
          </DialogHeader>
          <p className="text-sm" style={{ color: "#6B7280" }}>
            此操作将删除所有已识别的面经记录，且不可恢复。确定要继续吗？
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClearOpen(false)}>
              取消
            </Button>
            <Button
              style={{ backgroundColor: "#C4463A" }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = "#A83830"; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.backgroundColor = "#C4463A"; }}
              onClick={async () => {
                setConfirmClearOpen(false);
                const ids = records.map((r) => r.id);
                setRecords([]);
                try {
                  await Promise.all(ids.map((id) => fetch(`/api/records/${id}`, { method: "DELETE", headers: { "x-device-id": deviceIdRef.current } })));
                } catch {
                  // DB 清空失败，本地已清空即可
                }
              }}
            >
              确认清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
