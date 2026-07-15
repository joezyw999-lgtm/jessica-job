"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import type { InterviewRecord } from "@/types/interview";
import { genTempId } from "@/types/interview";

interface UseTextExtractOptions {
  deviceId: string;
  deviceIdRef: React.MutableRefObject<string>;
  /** 记录持久化成功回调 */
  onRecordPersisted?: () => void;
}

interface ExtractResult {
  company: string;
  position: string;
  industry: string;
  category: string;
  experienceType: string;
  country: string;
  content: string;
  originalContent: string;
}

/**
 * 文本面经识别 Hook
 * - 自维护文本输入、识别中状态、processing 记录
 * - 完成后写入数据库并回调
 */
export function useTextExtract(options: UseTextExtractOptions) {
  const { deviceId, deviceIdRef, onRecordPersisted } = options;

  const [textContent, setTextContent] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [processingRecords, setProcessingRecords] = useState<InterviewRecord[]>([]);

  // 文本识别
  const extractText = useCallback(async () => {
    const text = textContent.trim();
    if (!text) return;

    setExtracting(true);
    const tempId = genTempId("txt");

    // 添加 processing 记录
    setProcessingRecords((prev) => [
      {
        id: tempId,
        company: "",
        position: "",
        industry: "",
        content: "",
        originalContent: text,
        imageUrl: "",
        imageUrls: [],
        imageFileKey: "",
        fileName: "",
        status: "extracting",
        errorMsg: "",
        category: "国内",
        experienceType: "面经",
        country: "大陆",
        deviceId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      ...prev,
    ]);

    try {
      const res = await fetch("/api/extract-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();
      if (!data.success || !data.data) {
        throw new Error(data.error || "识别失败");
      }

      const result: ExtractResult = {
        company: data.data.company || "",
        position: data.data.position || "",
        industry: data.data.industry || "",
        category: data.data.category || "国内",
        experienceType: data.data.experienceType || data.data.experience_type || "面经",
        country: data.data.country || "大陆",
        content: data.data.content || "",
        originalContent: data.data.originalContent || data.data.original_content || text,
      };

      // 保存到数据库
      const saveRes = await fetch("/api/records", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceIdRef.current,
        },
        body: JSON.stringify({
          image_url: "",
          image_urls: [],
          image_file_key: "",
          file_name: "",
          company: result.company,
          position: result.position,
          industry: result.industry,
          content: result.content,
          original_content: result.originalContent,
          status: "done",
          category: result.category,
          experience_type: result.experienceType,
          country: result.country,
          device_id: deviceIdRef.current,
        }),
      });

      const saveData = await saveRes.json();
      if (!saveData.success) {
        throw new Error(saveData.error || "保存失败");
      }

      // 成功：移除 processing，清空输入
      setProcessingRecords((prev) => prev.filter((r) => r.id !== tempId));
      setTextContent("");
      onRecordPersisted?.();

      // 去重提示
      if (saveData.duplicated) {
        toast.info("记录已存在，未重复保存");
      }
    } catch (err: any) {
      setProcessingRecords((prev) =>
        prev.map((r) =>
          r.id === tempId
            ? { ...r, status: "error", errorMsg: err.message || "识别失败" }
            : r
        )
      );
    } finally {
      setExtracting(false);
    }
  }, [textContent, deviceId, deviceIdRef, onRecordPersisted]);

  return {
    textContent,
    setTextContent,
    extracting,
    extractText,
    processingRecords,
  };
}
