"use client";

import { useState, useEffect } from "react";
import { Pencil, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { INDUSTRY_LIST } from "@/types/interview";
import type { InterviewRecord } from "@/types/interview";

interface RecordEditDialogProps {
  open: boolean;
  record: InterviewRecord | null;
  initialMode?: "preview" | "edit";
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, patch: Partial<InterviewRecord>) => void | Promise<void>;
  industryOptions?: string[];
}

const CATEGORY_OPTIONS = ["国内", "海外"];
const TYPE_OPTIONS = ["面经", "笔经"];
const COUNTRY_OPTIONS = ["大陆", "香港", "台湾", "新加坡", "美国", "英国", "日本", "韩国", "其他"];

export function RecordEditDialog({
  open,
  record,
  initialMode = "preview",
  onOpenChange,
  onSave,
  industryOptions = INDUSTRY_LIST,
}: RecordEditDialogProps) {
  const [mode, setMode] = useState<"preview" | "edit">(initialMode);
  const [industryDropdownOpen, setIndustryDropdownOpen] = useState(false);

  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [industry, setIndustry] = useState("");
  const [category, setCategory] = useState("国内");
  const [experienceType, setExperienceType] = useState("面经");
  const [country, setCountry] = useState("大陆");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  // 打开时填充表单
  useEffect(() => {
    if (open && record) {
      setCompany(record.company);
      setPosition(record.position);
      setIndustry(record.industry);
      setCategory(record.category || "国内");
      setExperienceType(record.experienceType || "面经");
      setCountry(record.country || "大陆");
      setContent(record.content);
      setMode(initialMode);
      setIndustryDropdownOpen(false);
    }
  }, [open, record, initialMode]);

  const handleSave = async () => {
    if (!record) return;
    setSaving(true);
    try {
      await onSave(record.id, {
        company,
        position,
        industry,
        category,
        experienceType,
        country,
        content,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setIndustryDropdownOpen(false);
        onOpenChange(o);
      }}
    >
      <DialogContent
        className="sm:max-w-2xl max-h-[85vh] flex flex-col"
        showCloseButton={false}
      >
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg" style={{ color: "#1A1A1A" }}>
              {record ? `${record.company || "未知公司"} - ${record.position || "未知岗位"}` : ""}
            </DialogTitle>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-7 text-xs"
              onClick={() => setMode(mode === "preview" ? "edit" : "preview")}
            >
              <Pencil className="h-3 w-3" />
              {mode === "preview" ? "编辑" : "预览"}
            </Button>
          </div>
        </DialogHeader>

        {mode === "preview" ? (
          <div className="flex-1 overflow-y-auto py-2">
            <div
              className="text-sm leading-relaxed whitespace-pre-wrap"
              style={{ color: "#1A1A1A", lineHeight: "1.8" }}
            >
              {record?.content || "暂无内容"}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto py-2 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: "#1A1A1A" }}>
                公司名称
              </label>
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
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
                  style={{ borderColor: "#E5E2DD", backgroundColor: "#FFFFFF", color: industry || "#9CA3AF" }}
                >
                  {industry || "选择行业"}
                  <ChevronDown className="h-4 w-4 ml-2 shrink-0" style={{ color: "#6B7280" }} />
                </button>
                {industryDropdownOpen && (
                  <div
                    className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border py-1 shadow-lg"
                    style={{ borderColor: "#E5E2DD", backgroundColor: "#FFFFFF" }}
                  >
                    {industryOptions.map((ind) => (
                      <button
                        key={ind}
                        type="button"
                        onClick={() => { setIndustry(ind); setIndustryDropdownOpen(false); }}
                        className="flex w-full items-center px-3 py-1.5 text-sm text-left hover:bg-gray-50"
                        style={{
                          color: ind === industry ? "#2D6A6A" : "#1A1A1A",
                          fontWeight: ind === industry ? 600 : 400,
                        }}
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
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="输入岗位名称"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: "#1A1A1A" }}>
                  类别
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="flex h-9 w-full rounded-md border px-3 text-sm"
                  style={{ borderColor: "#E5E2DD", backgroundColor: "#FFFFFF", color: "#1A1A1A" }}
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: "#1A1A1A" }}>
                  类型
                </label>
                <select
                  value={experienceType}
                  onChange={(e) => setExperienceType(e.target.value)}
                  className="flex h-9 w-full rounded-md border px-3 text-sm"
                  style={{ borderColor: "#E5E2DD", backgroundColor: "#FFFFFF", color: "#1A1A1A" }}
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: "#1A1A1A" }}>
                  国家
                </label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="flex h-9 w-full rounded-md border px-3 text-sm"
                  style={{ borderColor: "#E5E2DD", backgroundColor: "#FFFFFF", color: "#1A1A1A" }}
                >
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: "#1A1A1A" }}>
                面经内容
              </label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="面经内容"
                rows={8}
                className="resize-y"
              />
            </div>
          </div>
        )}

        <DialogFooter className="shrink-0">
          {mode === "preview" ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setMode("preview")}>
                取消
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                style={{ backgroundColor: "#2D6A6A" }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = "#245757";
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = "#2D6A6A";
                }}
              >
                {saving ? "保存中..." : "保存"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
