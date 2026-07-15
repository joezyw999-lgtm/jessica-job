"use client";

import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import type { InterviewRecord } from "@/types/interview";
import { genTempId } from "@/types/interview";

interface UseImageExtractOptions {
  deviceId: string;
  deviceIdRef: React.MutableRefObject<string>;
  /** 记录持久化成功回调（数据库写入成功后） */
  onRecordPersisted?: () => void;
}

interface PendingFile {
  id: string;
  file: File;
  preview: string;
}

interface UploadResult {
  imageUrl: string;
  fileKey: string;
  fileName: string;
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
 * 图片上传 + AI 识别流程 Hook
 * - 支持单张立即识别（粘贴即识别）
 * - 支持多张批量提交识别
 * - 自维护 processingRecords 状态
 * - 完成后写入数据库并回调
 */
export function useImageExtract(options: UseImageExtractOptions) {
  const { deviceId, deviceIdRef, onRecordPersisted } = options;

  const [pasteMode, setPasteMode] = useState<"single" | "multi">("single");
  const [pasteFlash, setPasteFlash] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [processingRecords, setProcessingRecords] = useState<InterviewRecord[]>([]);

  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 触发粘贴闪烁
  const triggerPasteFlash = useCallback(() => {
    setPasteFlash(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setPasteFlash(false), 300);
  }, []);

  // 添加一张图片（根据模式决定是否立即识别）
  const addImage = useCallback((file: File) => {
    triggerPasteFlash();
    const id = genTempId("img");
    const preview = URL.createObjectURL(file);

    if (pasteMode === "single") {
      // 单张模式：立即识别
      processImage(id, file);
    } else {
      // 多张模式：加入待提交队列
      setPendingFiles((prev) => [...prev, { id, file, preview }]);
    }
  }, [pasteMode, triggerPasteFlash]);

  // 移除待提交图片
  const removePendingFile = useCallback((id: string) => {
    setPendingFiles((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  // 清空待提交
  const clearPendingFiles = useCallback(() => {
    setPendingFiles((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.preview));
      return [];
    });
  }, []);

  // 上传图片
  const uploadImage = useCallback(async (file: File): Promise<UploadResult> => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (!data.success || !data.data) {
      throw new Error(data.error || "上传失败");
    }

    return {
      imageUrl: data.data.imageUrl,
      fileKey: data.data.fileKey,
      fileName: data.data.fileName,
    };
  }, []);

  // 识别图片（支持单图和多图）
  const extractImages = useCallback(async (imageUrls: string[]): Promise<ExtractResult> => {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrls }),
    });

    const data = await res.json();
    if (!data.success || !data.data) {
      throw new Error(data.error || "识别失败");
    }

    return {
      company: data.data.company || "",
      position: data.data.position || "",
      industry: data.data.industry || "",
      category: data.data.category || "国内",
      experienceType: data.data.experienceType || data.data.experience_type || "面经",
      country: data.data.country || "大陆",
      content: data.data.content || "",
      originalContent: data.data.originalContent || data.data.original_content || "",
    };
  }, []);

  // 保存记录到数据库
  const saveRecord = useCallback(async (record: Omit<InterviewRecord, "id"> & { id?: string }): Promise<{ record: InterviewRecord; duplicated?: boolean; message?: string }> => {
    const res = await fetch("/api/records", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-device-id": deviceIdRef.current,
      },
      body: JSON.stringify({
        image_url: record.imageUrl,
        image_urls: record.imageUrls || [],
        image_file_key: record.imageFileKey,
        file_name: record.fileName,
        company: record.company,
        position: record.position,
        industry: record.industry,
        content: record.content,
        original_content: record.originalContent,
        status: record.status,
        category: record.category,
        experience_type: record.experienceType,
        country: record.country,
        device_id: deviceIdRef.current,
      }),
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || "保存失败");
    }

    return {
      record: {
        id: data.data.id,
        company: data.data.company || "",
        position: data.data.position || "",
        industry: data.data.industry || "",
        content: data.data.content || "",
        originalContent: data.data.originalContent || data.data.original_content || "",
        imageUrl: data.data.imageUrl || data.data.image_url || "",
        imageUrls: data.data.imageUrls || data.data.image_urls || [],
        imageFileKey: data.data.imageFileKey || data.data.image_file_key || "",
        fileName: data.data.fileName || data.data.file_name || "",
        status: data.data.status || "done",
        errorMsg: "",
        category: data.data.category || "国内",
        experienceType: data.data.experienceType || data.data.experience_type || "面经",
        country: data.data.country || "大陆",
        deviceId: data.data.deviceId || data.data.device_id || "",
        createdAt: data.data.createdAt || data.data.created_at,
        updatedAt: data.data.updatedAt || data.data.updated_at,
      },
      duplicated: data.duplicated,
      message: data.message,
    };
  }, [deviceIdRef]);

  // 处理单张图片（上传 + 识别 + 保存）
  const processImage = useCallback(async (id: string, file: File) => {
    // 1. 添加 processing 记录
    const tempId = genTempId("rec");
    const preview = URL.createObjectURL(file);
    setProcessingRecords((prev) => [
      {
        id: tempId,
        company: "",
        position: "",
        industry: "",
        content: "",
        originalContent: "",
        imageUrl: preview,
        imageUrls: [preview],
        imageFileKey: "",
        fileName: file.name,
        status: "extracting",
        errorMsg: "",
        category: "国内",
        experienceType: "面经",
        country: "大陆",
        deviceId: deviceId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      ...prev,
    ]);

    try {
      // 2. 上传
      const uploadRes = await uploadImage(file);
      // 3. 识别
      const extractRes = await extractImages([uploadRes.imageUrl]);
      // 4. 保存到数据库
      const { record: saved, duplicated, message } = await saveRecord({
        ...extractRes,
        imageUrl: uploadRes.imageUrl,
        imageUrls: [uploadRes.imageUrl],
        imageFileKey: uploadRes.fileKey,
        fileName: uploadRes.fileName || file.name,
        status: "done",
        deviceId,
      });

      // 5. 移除 processing，持久化后由 onRecordPersisted 触发列表刷新
      setProcessingRecords((prev) => prev.filter((r) => r.id !== tempId));
      URL.revokeObjectURL(preview);

      if (duplicated) {
        toast(message || "记录已存在，未重复保存");
      }
      onRecordPersisted?.();
    } catch (err: any) {
      // 错误状态
      setProcessingRecords((prev) =>
        prev.map((r) =>
          r.id === tempId
            ? { ...r, status: "error", errorMsg: err.message || "识别失败" }
            : r
        )
      );
    }
  }, [deviceId, uploadImage, extractImages, saveRecord, onRecordPersisted]);

  // 提交所有待识别图片（多图合并为一条记录）
  const submitPendingFiles = useCallback(async () => {
    if (pendingFiles.length === 0) return;

    const files = [...pendingFiles];
    clearPendingFiles();

    // 1. 添加 processing 记录（显示第一张图的缩略图）
    const tempId = genTempId("rec");
    const firstPreview = files[0].preview;
    const allPreviews = files.map((f) => f.preview);
    setProcessingRecords((prev) => [
      {
        id: tempId,
        company: "",
        position: "",
        industry: "",
        content: "",
        originalContent: "",
        imageUrl: firstPreview,
        imageUrls: allPreviews,
        imageFileKey: "",
        fileName: files.map((f) => f.file.name).join(", "),
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
      // 2. 批量上传所有图片
      const uploadResults = await Promise.all(
        files.map((pf) => uploadImage(pf.file))
      );
      const imageUrls = uploadResults.map((r) => r.imageUrl);
      const fileKeys = uploadResults.map((r) => r.fileKey);
      const fileNames = uploadResults.map((r) => r.fileName);

      // 3. 一次识别（多图合并）
      const extractRes = await extractImages(imageUrls);

      // 4. 保存一条记录
      const { record: saved, duplicated, message } = await saveRecord({
        ...extractRes,
        imageUrl: imageUrls[0], // 第一张作为封面
        imageUrls,
        imageFileKey: fileKeys[0] || "",
        fileName: fileNames.join(", ") || files[0].file.name,
        status: "done",
        deviceId,
      });

      // 5. 移除 processing，触发列表刷新
      setProcessingRecords((prev) => prev.filter((r) => r.id !== tempId));
      allPreviews.forEach((p) => URL.revokeObjectURL(p));
      onRecordPersisted?.();

      if (duplicated) {
        toast(message || "记录已存在，未重复保存");
      }
    } catch (err: any) {
      setProcessingRecords((prev) =>
        prev.map((r) =>
          r.id === tempId
            ? { ...r, status: "error", errorMsg: err.message || "识别失败" }
            : r
        )
      );
    }
  }, [pendingFiles, uploadImage, extractImages, saveRecord, deviceId, clearPendingFiles, onRecordPersisted]);

  return {
    // 状态
    pasteMode,
    setPasteMode,
    pasteFlash,
    pendingFiles,
    processingRecords,
    // 操作
    addImage,
    removePendingFile,
    clearPendingFiles,
    submitPendingFiles,
  };
}
