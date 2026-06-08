"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Radar,
  Trash2,
  Pencil,
  ExternalLink,
  RefreshCw,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  Building2,
  Calendar,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Filter,
  Download,
  X,
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";

const RECRUITMENT_TYPES = [
  "校招",
  "秋招",
  "春招",
  "暑期实习",
  "寒假实习",
  "留用实习",
  "管培生",
  "提前批",
  "补录",
  "应届生招聘",
];

const SOURCE_TYPE_MAP: Record<string, string> = {
  official: "官方",
  university: "高校",
  third_party: "第三方",
};

const TYPE_COLOR_MAP: Record<string, string> = {
  校招: "bg-[#2D6A6A]/10 text-[#2D6A6A] border-[#2D6A6A]/20",
  秋招: "bg-[#2D6A6A]/10 text-[#2D6A6A] border-[#2D6A6A]/20",
  春招: "bg-[#3D8B5E]/10 text-[#3D8B5E] border-[#3D8B5E]/20",
  暑期实习: "bg-[#D4853A]/10 text-[#D4853A] border-[#D4853A]/20",
  寒假实习: "bg-[#D4853A]/10 text-[#D4853A] border-[#D4853A]/20",
  留用实习: "bg-[#D4853A]/10 text-[#D4853A] border-[#D4853A]/20",
  管培生: "bg-[#6366F1]/10 text-[#6366F1] border-[#6366F1]/20",
  提前批: "bg-[#8B5CF6]/10 text-[#8B5CF6] border-[#8B5CF6]/20",
  补录: "bg-[#EC4899]/10 text-[#EC4899] border-[#EC4899]/20",
  应届生招聘: "bg-[#2D6A6A]/10 text-[#2D6A6A] border-[#2D6A6A]/20",
};

interface CampusRecord {
  id: string;
  company_name: string;
  recruitment_type: string;
  year: string | null;
  cohort: string | null;
  theme: string | null;
  positions: string | null;
  locations: string | null;
  requirements: string | null;
  application_url: string | null;
  source_url: string;
  source_name: string | null;
  source_type: string;
  description: string | null;
  status: string;
  discovered_at: string | null;
  created_at: string;
}

interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

export default function CampusPage() {
  const [records, setRecords] = useState<CampusRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);

  // 筛选条件
  const [filterType, setFilterType] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [filterKeyword, setFilterKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");

  // 采集状态
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectProgress, setCollectProgress] = useState<{
    phase: string;
    keyword: string;
    current: number;
    total: number;
    totalFound: number;
    newRecords: number;
    duplicates: number;
    logs: Array<{ time: string; message: string; type: "info" | "success" | "warning" }>;
  }>({
    phase: "",
    keyword: "",
    current: 0,
    total: 0,
    totalFound: 0,
    newRecords: 0,
    duplicates: 0,
    logs: [],
  });

  // 编辑弹窗
  const [editRecord, setEditRecord] = useState<CampusRecord | null>(null);
  const [editForm, setEditForm] = useState<Partial<CampusRecord>>({});
  const [saving, setSaving] = useState(false);

  // 上次采集时间
  const [lastSearchTime, setLastSearchTime] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // 加载记录
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
      });
      if (filterType !== "all") params.set("recruitment_type", filterType);
      if (filterYear !== "all") params.set("year", filterYear);
      if (filterSource !== "all") params.set("source_type", filterSource);
      if (filterKeyword) params.set("keyword", filterKeyword);

      const res = await fetch(`/api/campus/records?${params}`);
      const data = await res.json();
      if (data.success) {
        setRecords(data.data || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error("获取记录失败:", err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterType, filterYear, filterSource, filterKeyword]);

  // 加载搜索任务信息
  const fetchSearchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/campus/search-tasks");
      const data = await res.json();
      if (data.success) {
        setLastSearchTime(data.lastSearchTime);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    fetchSearchTasks();
  }, [fetchSearchTasks]);

  // SSE 采集
  const startCollecting = useCallback(
    async (forceRefresh: boolean = false) => {
      setIsCollecting(true);
      setCollectProgress({
        phase: "starting",
        keyword: "",
        current: 0,
        total: 0,
        totalFound: 0,
        newRecords: 0,
        duplicates: 0,
        logs: [],
      });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/campus/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forceRefresh }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error("请求失败");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          let currentEvent = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                const now = new Date().toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                });

                if (currentEvent === "start") {
                  setCollectProgress((prev) => ({
                    ...prev,
                    phase: "searching",
                    total: data.totalKeywords as number,
                    logs: [
                      ...prev.logs,
                      {
                        time: now,
                        message: `开始采集，共 ${data.totalKeywords} 个关键词${data.skippedKeywords > 0 ? `（跳过 ${data.skippedKeywords} 个已搜索）` : ""}`,
                        type: "info",
                      },
                    ],
                  }));
                } else if (currentEvent === "progress") {
                  setCollectProgress((prev) => ({
                    ...prev,
                    phase: data.phase as string,
                    keyword: (data.keyword as string) || prev.keyword,
                    current: (data.current as number) || prev.current,
                    total: (data.total as number) || prev.total,
                    logs:
                      data.phase === "analyzing"
                        ? [
                            ...prev.logs,
                            {
                              time: now,
                              message: `分析关键词: ${data.keyword}（${data.resultsToAnalyze} 条结果）`,
                              type: "info",
                            },
                          ]
                        : prev.logs,
                  }));
                } else if (currentEvent === "found") {
                  setCollectProgress((prev) => ({
                    ...prev,
                    totalFound: prev.totalFound + ((data.resultsCount as number) || 0),
                    logs: [
                      ...prev.logs,
                      {
                        time: now,
                        message: `"${data.keyword}" 发现 ${data.resultsCount} 条搜索结果`,
                        type: "info",
                      },
                    ],
                  }));
                } else if (currentEvent === "record") {
                  setCollectProgress((prev) => ({
                    ...prev,
                    newRecords: prev.newRecords + 1,
                    logs: [
                      ...prev.logs,
                      {
                        time: now,
                        message: `新增: ${data.company_name} - ${data.recruitment_type}`,
                        type: "success",
                      },
                    ],
                  }));
                } else if (currentEvent === "warning") {
                  setCollectProgress((prev) => ({
                    ...prev,
                    logs: [
                      ...prev.logs,
                      {
                        time: now,
                        message: `${data.keyword ? `[${data.keyword}] ` : ""}${data.message}`,
                        type: "warning",
                      },
                    ],
                  }));
                } else if (currentEvent === "complete") {
                  setCollectProgress((prev) => ({
                    ...prev,
                    phase: "complete",
                    totalFound: (data.totalFound as number) || prev.totalFound,
                    newRecords: (data.newRecords as number) || prev.newRecords,
                    duplicates: (data.duplicates as number) || prev.duplicates,
                    logs: [
                      ...prev.logs,
                      {
                        time: now,
                        message: `采集完成！共发现 ${data.totalFound} 条结果，新增 ${data.newRecords} 条，去重 ${data.duplicates} 条`,
                        type: "success",
                      },
                    ],
                  }));
                } else if (currentEvent === "error") {
                  setCollectProgress((prev) => ({
                    ...prev,
                    phase: "error",
                    logs: [
                      ...prev.logs,
                      {
                        time: now,
                        message: `错误: ${data.message}`,
                        type: "warning",
                      },
                    ],
                  }));
                }
              } catch {
                // ignore parse errors
              }
            }
          }
        }

        // 采集完成后刷新记录
        await fetchRecords();
        await fetchSearchTasks();
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setCollectProgress((prev) => ({
            ...prev,
            phase: "error",
            logs: [
              ...prev.logs,
              {
                time: new Date().toLocaleTimeString("zh-CN"),
                message: `采集失败: ${(err as Error).message}`,
                type: "warning",
              },
            ],
          }));
        }
      } finally {
        setIsCollecting(false);
      }
    },
    [fetchRecords, fetchSearchTasks]
  );

  // 删除记录
  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("确定删除这条记录吗？")) return;
      try {
        const res = await fetch(`/api/campus/records/${id}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (data.success) {
          setRecords((prev) => prev.filter((r) => r.id !== id));
          setTotal((prev) => prev - 1);
        }
      } catch {
        // ignore
      }
    },
    []
  );

  // 保存编辑
  const handleSave = useCallback(async () => {
    if (!editRecord) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/campus/records/${editRecord.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (data.success) {
        setRecords((prev) =>
          prev.map((r) => (r.id === editRecord.id ? { ...r, ...editForm } : r))
        );
        setEditRecord(null);
        setEditForm({});
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }, [editRecord, editForm]);

  // 导出 CSV
  const handleExport = useCallback(() => {
    const headers = [
      "公司名称",
      "招聘类型",
      "年份",
      "届别",
      "主题",
      "岗位",
      "工作地点",
      "要求",
      "网申链接",
      "来源链接",
      "来源名称",
      "来源类型",
      "描述",
      "状态",
      "发现时间",
    ];
    const rows = records.map((r) => [
      r.company_name,
      r.recruitment_type,
      r.year || "",
      r.cohort || "",
      r.theme || "",
      r.positions || "",
      r.locations || "",
      r.requirements || "",
      r.application_url || "",
      r.source_url,
      r.source_name || "",
      SOURCE_TYPE_MAP[r.source_type] || r.source_type,
      r.description || "",
      r.status,
      r.discovered_at
        ? new Date(r.discovered_at).toLocaleString("zh-CN")
        : "",
    ]);

    const csvContent =
      "\uFEFF" +
      [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `校招信息_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [records]);

  const totalPages = Math.ceil(total / pageSize);

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return "-";
    return new Date(timeStr).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F8F7F5" }}>
      {/* 顶部导航 */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{
          backgroundColor: "rgba(255,255,255,0.95)",
          borderColor: "#E5E2DD",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-1 text-sm hover:opacity-70 transition-opacity"
              style={{ color: "#6B7280" }}
            >
              <ArrowLeft className="size-4" />
              面经整理
            </Link>
            <div className="h-4 w-px" style={{ backgroundColor: "#E5E2DD" }} />
            <div className="flex items-center gap-2">
              <Radar className="size-5" style={{ color: "#2D6A6A" }} />
              <span
                className="font-semibold"
                style={{ color: "#1A1A1A", fontSize: "16px" }}
              >
                校招雷达
              </span>
            </div>
          </div>
          <p className="text-xs" style={{ color: "#6B7280" }}>
            AI 全网采集校园招聘信息
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-4">
        {/* 控制面板 */}
        <Card
          style={{
            borderColor: "#E5E2DD",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => startCollecting(false)}
                  disabled={isCollecting}
                  style={{
                    backgroundColor: isCollecting ? "#6B7280" : "#2D6A6A",
                    color: "#fff",
                  }}
                  className="hover:opacity-90 transition-opacity"
                >
                  {isCollecting ? (
                    <>
                      <Spinner className="size-4 mr-1" />
                      采集中...
                    </>
                  ) : (
                    <>
                      <Radar className="size-4 mr-1" />
                      一键采集
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startCollecting(true)}
                  disabled={isCollecting}
                  style={{ borderColor: "#E5E2DD", color: "#6B7280" }}
                >
                  <RefreshCw className="size-3.5 mr-1" />
                  强制刷新
                </Button>
                {lastSearchTime && (
                  <span className="text-xs" style={{ color: "#6B7280" }}>
                    上次采集: {formatTime(lastSearchTime)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="text-xs px-2 py-1 rounded"
                  style={{ backgroundColor: "#2D6A6A/10", color: "#2D6A6A" }}
                >
                  共 {total} 条
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  disabled={records.length === 0}
                  style={{ borderColor: "#E5E2DD", color: "#6B7280" }}
                >
                  <Download className="size-3.5 mr-1" />
                  导出
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 采集进度面板 */}
        {isCollecting && (
          <Card
            style={{
              borderColor: "#2D6A6A",
              borderWidth: "1px",
              boxShadow: "0 2px 8px rgba(45,106,106,0.08)",
            }}
          >
            <CardHeader className="pb-2 pt-4 px-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Spinner
                    className="size-4"
                    style={{ color: "#2D6A6A" }}
                  />
                  <CardTitle
                    className="text-sm font-semibold"
                    style={{ color: "#2D6A6A" }}
                  >
                    {collectProgress.phase === "searching"
                      ? `正在搜索: ${collectProgress.keyword}`
                      : collectProgress.phase === "analyzing"
                        ? `正在分析: ${collectProgress.keyword}`
                        : "准备中..."}
                  </CardTitle>
                </div>
                <span className="text-xs" style={{ color: "#6B7280" }}>
                  {collectProgress.current}/{collectProgress.total} 关键词
                </span>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-4 space-y-3">
              <Progress
                value={
                  collectProgress.total > 0
                    ? (collectProgress.current / collectProgress.total) * 100
                    : 0
                }
                className="h-1.5"
              />
              <div className="flex gap-4 text-xs" style={{ color: "#6B7280" }}>
                <span>搜索结果: {collectProgress.totalFound}</span>
                <span style={{ color: "#3D8B5E" }}>
                  新增: {collectProgress.newRecords}
                </span>
                <span>去重: {collectProgress.duplicates}</span>
              </div>
              {/* 日志区域 */}
              <div
                className="max-h-32 overflow-y-auto rounded-md p-2 text-xs space-y-0.5"
                style={{
                  backgroundColor: "#F8F7F5",
                  fontFamily: "monospace",
                }}
              >
                {collectProgress.logs.map((log, idx) => (
                  <div key={idx} className="flex gap-2">
                    <span style={{ color: "#9CA3AF" }}>{log.time}</span>
                    <span
                      style={{
                        color:
                          log.type === "success"
                            ? "#3D8B5E"
                            : log.type === "warning"
                              ? "#D4853A"
                              : "#1A1A1A",
                      }}
                    >
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 采集完成提示 */}
        {!isCollecting && collectProgress.phase === "complete" && (
          <Card
            style={{
              borderColor: "#3D8B5E",
              borderWidth: "1px",
              backgroundColor: "#3D8B5E/5",
            }}
          >
            <CardContent className="py-3 flex items-center gap-2">
              <CheckCircle2 className="size-4" style={{ color: "#3D8B5E" }} />
              <span className="text-sm" style={{ color: "#3D8B5E" }}>
                采集完成！共发现 {collectProgress.totalFound} 条搜索结果，新增{" "}
                {collectProgress.newRecords} 条校招信息，去重{" "}
                {collectProgress.duplicates} 条
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() =>
                  setCollectProgress((prev) => ({ ...prev, phase: "" }))
                }
              >
                <X className="size-3" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 筛选栏 */}
        <Card style={{ borderColor: "#E5E2DD" }}>
          <CardContent className="py-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Filter className="size-4" style={{ color: "#6B7280" }} />
              <Select
                value={filterType}
                onValueChange={(v) => {
                  setFilterType(v);
                  setPage(1);
                }}
              >
                <SelectTrigger
                  size="sm"
                  style={{ borderColor: "#E5E2DD", minWidth: "110px" }}
                >
                  <SelectValue placeholder="招聘类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  {RECRUITMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filterYear}
                onValueChange={(v) => {
                  setFilterYear(v);
                  setPage(1);
                }}
              >
                <SelectTrigger
                  size="sm"
                  style={{ borderColor: "#E5E2DD", minWidth: "100px" }}
                >
                  <SelectValue placeholder="年份" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部年份</SelectItem>
                  <SelectItem value="2027">2027</SelectItem>
                  <SelectItem value="2026">2026</SelectItem>
                  <SelectItem value="2025">2025</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filterSource}
                onValueChange={(v) => {
                  setFilterSource(v);
                  setPage(1);
                }}
              >
                <SelectTrigger
                  size="sm"
                  style={{ borderColor: "#E5E2DD", minWidth: "110px" }}
                >
                  <SelectValue placeholder="来源类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部来源</SelectItem>
                  <SelectItem value="official">官方</SelectItem>
                  <SelectItem value="university">高校</SelectItem>
                  <SelectItem value="third_party">第三方</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex-1 flex items-center gap-2">
                <div
                  className="flex items-center gap-1.5 flex-1 max-w-xs rounded-md border px-2 h-8"
                  style={{ borderColor: "#E5E2DD" }}
                >
                  <Search className="size-3.5" style={{ color: "#9CA3AF" }} />
                  <input
                    type="text"
                    placeholder="搜索公司/岗位..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setFilterKeyword(searchInput);
                        setPage(1);
                      }
                    }}
                    className="flex-1 text-sm bg-transparent outline-none"
                    style={{ color: "#1A1A1A" }}
                  />
                </div>
                {(filterType !== "all" ||
                  filterYear !== "all" ||
                  filterSource !== "all" ||
                  filterKeyword) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFilterType("all");
                      setFilterYear("all");
                      setFilterSource("all");
                      setFilterKeyword("");
                      setSearchInput("");
                      setPage(1);
                    }}
                    style={{ color: "#6B7280" }}
                  >
                    <X className="size-3 mr-1" />
                    清除
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 结果表格 */}
        <Card style={{ borderColor: "#E5E2DD" }}>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Spinner className="size-5" style={{ color: "#2D6A6A" }} />
                <span className="ml-2 text-sm" style={{ color: "#6B7280" }}>
                  加载中...
                </span>
              </div>
            ) : records.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Radar
                  className="size-12 mb-3"
                  style={{ color: "#E5E2DD" }}
                />
                <p className="text-sm" style={{ color: "#6B7280" }}>
                  暂无校招信息
                </p>
                <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>
                  点击上方「一键采集」开始全网搜索
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow style={{ borderColor: "#E5E2DD" }}>
                      <TableHead
                        className="w-[140px]"
                        style={{ color: "#6B7280", fontSize: "12px" }}
                      >
                        <div className="flex items-center gap-1">
                          <Building2 className="size-3" />
                          公司
                        </div>
                      </TableHead>
                      <TableHead
                        className="w-[90px]"
                        style={{ color: "#6B7280", fontSize: "12px" }}
                      >
                        类型
                      </TableHead>
                      <TableHead
                        className="w-[60px]"
                        style={{ color: "#6B7280", fontSize: "12px" }}
                      >
                        年份
                      </TableHead>
                      <TableHead
                        style={{ color: "#6B7280", fontSize: "12px" }}
                      >
                        主题/岗位
                      </TableHead>
                      <TableHead
                        className="w-[80px]"
                        style={{ color: "#6B7280", fontSize: "12px" }}
                      >
                        <div className="flex items-center gap-1">
                          <MapPin className="size-3" />
                          地点
                        </div>
                      </TableHead>
                      <TableHead
                        className="w-[70px]"
                        style={{ color: "#6B7280", fontSize: "12px" }}
                      >
                        来源
                      </TableHead>
                      <TableHead
                        className="w-[90px]"
                        style={{ color: "#6B7280", fontSize: "12px" }}
                      >
                        操作
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((record) => (
                      <TableRow
                        key={record.id}
                        className="group transition-colors"
                        style={{
                          borderColor: "#E5E2DD",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            "rgba(45,106,106,0.03)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor = "")
                        }
                      >
                        <TableCell>
                          <span
                            className="font-medium text-sm"
                            style={{ color: "#1A1A1A" }}
                          >
                            {record.company_name}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs px-1.5 py-0 ${TYPE_COLOR_MAP[record.recruitment_type] || "bg-gray-100 text-gray-600 border-gray-200"}`}
                          >
                            {record.recruitment_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span
                            className="text-sm"
                            style={{ color: "#6B7280" }}
                          >
                            {record.year || "-"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[300px]">
                            {record.theme && (
                              <p
                                className="text-sm truncate"
                                style={{ color: "#1A1A1A" }}
                                title={record.theme}
                              >
                                {record.theme}
                              </p>
                            )}
                            {record.positions && (
                              <p
                                className="text-xs truncate mt-0.5"
                                style={{ color: "#6B7280" }}
                                title={record.positions}
                              >
                                {record.positions}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className="text-xs"
                            style={{ color: "#6B7280" }}
                            title={record.locations || ""}
                          >
                            {record.locations
                              ? record.locations.length > 12
                                ? record.locations.slice(0, 12) + "..."
                                : record.locations
                              : "-"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="text-xs px-1.5 py-0"
                            style={{
                              color:
                                record.source_type === "official"
                                  ? "#2D6A6A"
                                  : record.source_type === "university"
                                    ? "#3D8B5E"
                                    : "#6B7280",
                              borderColor:
                                record.source_type === "official"
                                  ? "rgba(45,106,106,0.2)"
                                  : record.source_type === "university"
                                    ? "rgba(61,139,94,0.2)"
                                    : "#E5E2DD",
                              backgroundColor:
                                record.source_type === "official"
                                  ? "rgba(45,106,106,0.05)"
                                  : record.source_type === "university"
                                    ? "rgba(61,139,94,0.05)"
                                    : "transparent",
                            }}
                          >
                            {SOURCE_TYPE_MAP[record.source_type] ||
                              record.source_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {record.application_url && (
                              <a
                                href={record.application_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 rounded hover:bg-gray-100 transition-colors"
                                title="网申链接"
                              >
                                <ExternalLink
                                  className="size-3.5"
                                  style={{ color: "#2D6A6A" }}
                                />
                              </a>
                            )}
                            <button
                              onClick={() => {
                                setEditRecord(record);
                                setEditForm({
                                  company_name: record.company_name,
                                  recruitment_type: record.recruitment_type,
                                  year: record.year,
                                  cohort: record.cohort,
                                  theme: record.theme,
                                  positions: record.positions,
                                  locations: record.locations,
                                  requirements: record.requirements,
                                  application_url: record.application_url,
                                  description: record.description,
                                });
                              }}
                              className="p-1 rounded hover:bg-gray-100 transition-colors"
                              title="编辑"
                            >
                              <Pencil
                                className="size-3.5"
                                style={{ color: "#6B7280" }}
                              />
                            </button>
                            <button
                              onClick={() => handleDelete(record.id)}
                              className="p-1 rounded hover:bg-gray-100 transition-colors"
                              title="删除"
                            >
                              <Trash2
                                className="size-3.5"
                                style={{ color: "#C4463A" }}
                              />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: "#6B7280" }}>
              共 {total} 条，第 {page}/{totalPages} 页
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                style={{ borderColor: "#E5E2DD", color: "#6B7280" }}
              >
                <ChevronLeft className="size-3.5" />
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                style={{ borderColor: "#E5E2DD", color: "#6B7280" }}
              >
                下一页
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* 编辑弹窗 */}
      <Dialog
        open={!!editRecord}
        onOpenChange={(open) => {
          if (!open) {
            setEditRecord(null);
            setEditForm({});
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle style={{ color: "#1A1A1A" }}>编辑校招信息</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  className="text-xs font-medium mb-1 block"
                  style={{ color: "#6B7280" }}
                >
                  公司名称
                </label>
                <Input
                  value={editForm.company_name || ""}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      company_name: e.target.value,
                    }))
                  }
                  style={{ borderColor: "#E5E2DD" }}
                />
              </div>
              <div>
                <label
                  className="text-xs font-medium mb-1 block"
                  style={{ color: "#6B7280" }}
                >
                  招聘类型
                </label>
                <Select
                  value={editForm.recruitment_type || ""}
                  onValueChange={(v) =>
                    setEditForm((prev) => ({ ...prev, recruitment_type: v }))
                  }
                >
                  <SelectTrigger style={{ borderColor: "#E5E2DD" }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECRUITMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  className="text-xs font-medium mb-1 block"
                  style={{ color: "#6B7280" }}
                >
                  年份
                </label>
                <Input
                  value={editForm.year || ""}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, year: e.target.value }))
                  }
                  placeholder="如 2026"
                  style={{ borderColor: "#E5E2DD" }}
                />
              </div>
              <div>
                <label
                  className="text-xs font-medium mb-1 block"
                  style={{ color: "#6B7280" }}
                >
                  届别
                </label>
                <Input
                  value={editForm.cohort || ""}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, cohort: e.target.value }))
                  }
                  placeholder="如 2026届"
                  style={{ borderColor: "#E5E2DD" }}
                />
              </div>
            </div>
            <div>
              <label
                className="text-xs font-medium mb-1 block"
                style={{ color: "#6B7280" }}
              >
                主题
              </label>
              <Input
                value={editForm.theme || ""}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, theme: e.target.value }))
                }
                style={{ borderColor: "#E5E2DD" }}
              />
            </div>
            <div>
              <label
                className="text-xs font-medium mb-1 block"
                style={{ color: "#6B7280" }}
              >
                岗位
              </label>
              <Textarea
                value={editForm.positions || ""}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    positions: e.target.value,
                  }))
                }
                rows={2}
                style={{ borderColor: "#E5E2DD" }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  className="text-xs font-medium mb-1 block"
                  style={{ color: "#6B7280" }}
                >
                  工作地点
                </label>
                <Input
                  value={editForm.locations || ""}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      locations: e.target.value,
                    }))
                  }
                  style={{ borderColor: "#E5E2DD" }}
                />
              </div>
              <div>
                <label
                  className="text-xs font-medium mb-1 block"
                  style={{ color: "#6B7280" }}
                >
                  网申链接
                </label>
                <Input
                  value={editForm.application_url || ""}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      application_url: e.target.value,
                    }))
                  }
                  style={{ borderColor: "#E5E2DD" }}
                />
              </div>
            </div>
            <div>
              <label
                className="text-xs font-medium mb-1 block"
                style={{ color: "#6B7280" }}
              >
                要求
              </label>
              <Textarea
                value={editForm.requirements || ""}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    requirements: e.target.value,
                  }))
                }
                rows={2}
                style={{ borderColor: "#E5E2DD" }}
              />
            </div>
            <div>
              <label
                className="text-xs font-medium mb-1 block"
                style={{ color: "#6B7280" }}
              >
                描述
              </label>
              <Textarea
                value={editForm.description || ""}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                rows={2}
                style={{ borderColor: "#E5E2DD" }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditRecord(null);
                setEditForm({});
              }}
              style={{ borderColor: "#E5E2DD", color: "#6B7280" }}
            >
              取消
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              style={{ backgroundColor: "#2D6A6A", color: "#fff" }}
              className="hover:opacity-90"
            >
              {saving ? <Spinner className="size-4 mr-1" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
