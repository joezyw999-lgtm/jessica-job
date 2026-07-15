"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { InterviewRecord, RecordQueryParams } from "@/types/interview";
import { dbToRecord, recordToDb, genTempId } from "@/types/interview";

interface UseRecordsOptions {
  deviceId: string;
  deviceIdRef: React.MutableRefObject<string>;
  /** 是否开启轮询同步（毫秒），0 表示不轮询 */
  pollInterval?: number;
  /** 每页条数 */
  pageSize?: number;
}

interface UseRecordsResult {
  records: InterviewRecord[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  loading: boolean;
  /** 仅本地处理中的记录（不在分页列表里，单独维护） */
  processingRecords: InterviewRecord[];

  /** 加载分页数据 */
  loadRecords: (params?: RecordQueryParams) => Promise<void>;
  /** 加载下一页 */
  loadMore: () => Promise<void>;
  /** 手动刷新 */
  refresh: () => Promise<void>;

  /** 添加一条本地处理中的记录（在最前面显示） */
  addProcessingRecord: (record: InterviewRecord) => string;
  /** 更新本地处理中的记录状态 */
  updateProcessingRecord: (id: string, patch: Partial<InterviewRecord>) => void;
  /** 把处理完成的记录加入数据库（并从 processing 中移除） */
  persistRecord: (tempId: string, record: Omit<InterviewRecord, "id"> & { id?: string }) => Promise<string>;
  /** 直接保存一条记录到数据库 */
  createRecord: (record: Omit<InterviewRecord, "id" | "createdAt"> & { id?: string }) => Promise<InterviewRecord>;
  /** 更新记录 */
  updateRecord: (id: string, patch: Partial<InterviewRecord>) => Promise<void>;
  /** 删除记录 */
  deleteRecord: (id: string) => Promise<void>;
  /** 批量删除记录 */
  batchDelete: (ids: string[]) => Promise<void>;
  /** 清空所有记录 */
  clearAll: () => Promise<void>;

  /** 刷新过期的图片 URL */
  refreshImageUrls: () => Promise<void>;
}

/**
 * 面经记录管理 Hook
 * - 后端分页查询 + 本地 processing 记录（正在识别中的）合并展示
 * - 支持轮询同步扩展插件写入的数据
 */
export function useRecords(options: UseRecordsOptions): UseRecordsResult {
  const { deviceId, deviceIdRef, pollInterval = 15000, pageSize: initialPageSize = 20 } = options;

  const [records, setRecords] = useState<InterviewRecord[]>([]);
  const [processingRecords, setProcessingRecords] = useState<InterviewRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(initialPageSize);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const filterRef = useRef<RecordQueryParams>({});

  // 加载分页数据
  const loadRecords = useCallback(async (params: RecordQueryParams = {}) => {
    if (!deviceId) return;
    filterRef.current = params;
    setLoading(true);
    try {
      const searchParams = new URLSearchParams();
      searchParams.set("page", String(params.page || 1));
      searchParams.set("pageSize", String(params.pageSize || pageSize));
      if (params.keyword) searchParams.set("keyword", params.keyword);
      if (params.company) searchParams.set("company", params.company);
      if (params.position) searchParams.set("position", params.position);
      if (params.industry) searchParams.set("industry", params.industry);
      if (params.category) searchParams.set("category", params.category);
      if (params.experienceType) searchParams.set("experienceType", params.experienceType);
      if (params.country) searchParams.set("country", params.country);
      if (params.status) searchParams.set("status", params.status);

      const res = await fetch(`/api/records?${searchParams.toString()}`, {
        headers: { "x-device-id": deviceIdRef.current },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        const loaded = data.data.map((row: Record<string, unknown>) => dbToRecord(row));
        setRecords(loaded);
        setTotal(data.pagination?.total || loaded.length);
        setPage(data.pagination?.page || 1);
        setHasMore(data.pagination?.hasMore ?? false);
      }
    } catch {
      // 失败不抛出，保持当前数据
    } finally {
      setLoading(false);
    }
  }, [deviceId, deviceIdRef, pageSize]);

  // 加载下一页（追加模式）
  const loadMore = useCallback(async () => {
    if (!deviceId || !hasMore) return;
    const nextPage = page + 1;
    try {
      const searchParams = new URLSearchParams();
      searchParams.set("page", String(nextPage));
      searchParams.set("page_size", String(pageSize));
      const params = filterRef.current;
      if (params.keyword) searchParams.set("keyword", params.keyword);
      if (params.company) searchParams.set("company", params.company);
      if (params.industry) searchParams.set("industry", params.industry);
      if (params.category) searchParams.set("category", params.category);
      if (params.experienceType) searchParams.set("experienceType", params.experienceType);
      if (params.country) searchParams.set("country", params.country);
      if (params.status) searchParams.set("status", params.status);

      const res = await fetch(`/api/records?${searchParams.toString()}`, {
        headers: { "x-device-id": deviceIdRef.current },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        const loaded = data.data.map((row: Record<string, unknown>) => dbToRecord(row));
        setRecords(prev => [...prev, ...loaded]);
        setPage(nextPage);
        setHasMore(data.pagination?.hasMore ?? false);
      }
    } catch {
      // ignore
    }
  }, [deviceId, deviceIdRef, page, pageSize, hasMore]);

  // 刷新（回到第 1 页重新加载）
  const refresh = useCallback(async () => {
    await loadRecords({ ...filterRef.current, page: 1, pageSize: filterRef.current.pageSize || pageSize });
  }, [loadRecords, pageSize]);

  // 添加处理中的记录
  const addProcessingRecord = useCallback((record: InterviewRecord): string => {
    const id = record.id || genTempId("rec");
    setProcessingRecords(prev => [{ ...record, id }, ...prev]);
    return id;
  }, []);

  // 更新处理中的记录
  const updateProcessingRecord = useCallback((id: string, patch: Partial<InterviewRecord>) => {
    setProcessingRecords(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    // 同时检查是否已经在正式列表里了
    setRecords(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }, []);

  // 保存到数据库，返回数据库 id
  const persistRecord = useCallback(async (
    tempId: string,
    record: Omit<InterviewRecord, "id"> & { id?: string }
  ): Promise<string> => {
    try {
      const dbBody = recordToDb({
        device_id: deviceIdRef.current,
        ...record,
      });
      const res = await fetch("/api/records", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceIdRef.current,
        },
        body: JSON.stringify(dbBody),
      });
      const data = await res.json();
      if (data.success && data.data) {
        const dbRecord = dbToRecord(data.data);
        // 从 processing 移除
        setProcessingRecords(prev => prev.filter(r => r.id !== tempId));
        // 加到正式列表顶部
        setRecords(prev => {
          // 去重
          const exists = prev.some(r => String(r.id) === String(dbRecord.id));
          if (exists) {
            return prev.map(r => String(r.id) === String(dbRecord.id) ? dbRecord : r);
          }
          return [dbRecord, ...prev];
        });
        setTotal(prev => prev + 1);
        return dbRecord.id;
      }
      // 失败时本地保留
      return tempId;
    } catch {
      // DB 失败：从 processing 移除（已完成状态），但更新本地状态
      setProcessingRecords(prev => prev.filter(r => r.id !== tempId));
      setRecords(prev => {
        const newRec: InterviewRecord = { ...record, id: record.id || tempId } as InterviewRecord;
        return [newRec, ...prev];
      });
      return tempId;
    }
  }, [deviceIdRef]);

  // 直接创建记录
  const createRecord = useCallback(async (record: Omit<InterviewRecord, "id" | "createdAt"> & { id?: string }): Promise<InterviewRecord> => {
    const dbBody = recordToDb({
      device_id: deviceIdRef.current,
      ...record,
    });
    const res = await fetch("/api/records", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-device-id": deviceIdRef.current,
      },
      body: JSON.stringify(dbBody),
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || "创建失败");
    }
    const dbRecord = dbToRecord(data.data);
    return dbRecord;
  }, [deviceIdRef]);

  // 更新记录
  const updateRecord = useCallback(async (id: string, patch: Partial<InterviewRecord>) => {
    // 先本地更新（乐观更新）
    setRecords(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    setProcessingRecords(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

    try {
      const dbBody = recordToDb(patch);
      await fetch(`/api/records/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceIdRef.current,
        },
        body: JSON.stringify(dbBody),
      });
    } catch {
      // 失败回滚？这里先不回滚，避免闪烁
    }
  }, [deviceIdRef]);

  // 删除记录
  const deleteRecord = useCallback(async (id: string) => {
    // 乐观删除
    setRecords(prev => prev.filter(r => r.id !== id));
    setProcessingRecords(prev => prev.filter(r => r.id !== id));
    setTotal(prev => Math.max(0, prev - 1));

    try {
      await fetch(`/api/records/${id}`, {
        method: "DELETE",
        headers: { "x-device-id": deviceIdRef.current },
      });
    } catch {
      // 失败不回滚
    }
  }, [deviceIdRef]);

  // 批量删除
  const batchDelete = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);

    // 乐观删除
    setRecords(prev => prev.filter(r => !idSet.has(r.id)));
    setProcessingRecords(prev => prev.filter(r => !idSet.has(r.id)));
    setTotal(prev => Math.max(0, prev - ids.length));

    try {
      const res = await fetch("/api/records/batch-delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceIdRef.current,
        },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        throw new Error("删除失败");
      }
    } catch (e) {
      console.error("批量删除失败", e);
      // 失败不回滚
    }
  }, [deviceIdRef]);

  // 清空所有
  const clearAll = useCallback(async () => {
    // 清空本地
    setRecords([]);
    setProcessingRecords([]);
    setTotal(0);
    // TODO: 后端批量删除 API（暂不实现，由用户逐条删或前端清空即可）
  }, []);

  // 刷新图片 URL
  const refreshImageUrls = useCallback(async () => {
    try {
      const res = await fetch("/api/records/refresh-urls", { method: "POST" });
      const data = await res.json();
      if (data.success && data.data) {
        const urlMap = data.data as Record<string, string>;
        if (Object.keys(urlMap).length > 0) {
          setRecords(prev => prev.map(r => {
            const newUrl = urlMap[r.id];
            if (newUrl) return { ...r, imageUrl: newUrl, imageUrls: [newUrl] };
            return r;
          }));
          setProcessingRecords(prev => prev.map(r => {
            const newUrl = urlMap[r.id];
            if (newUrl) return { ...r, imageUrl: newUrl, imageUrls: [newUrl] };
            return r;
          }));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // 轮询同步（页面可见时才轮询，节省资源）
  useEffect(() => {
    if (!deviceId || pollInterval <= 0) return;

    let lastTotal = total;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      if (document.hidden) return; // 页面不可见时跳过
      try {
        // 只查第一页少量数据，检查是否有新增
        const searchParams = new URLSearchParams();
        searchParams.set("page", "1");
        searchParams.set("page_size", String(pageSize));
        const params = filterRef.current;
        if (params.keyword) searchParams.set("keyword", params.keyword);

        const res = await fetch(`/api/records?${searchParams.toString()}`, {
          headers: { "x-device-id": deviceIdRef.current },
        });
        const data = await res.json();
        if (data.success && data.pagination) {
          // 总数变化 → 刷新（说明有新增或删除）
          if (data.pagination.total !== lastTotal) {
            lastTotal = data.pagination.total;
            setTotal(data.pagination.total);
            // 合并新数据（只更新第一页的记录，避免全量重绘）
            const loaded = data.data.map((row: Record<string, unknown>) => dbToRecord(row));
            setRecords(prev => {
              const existingIds = new Set(prev.map(r => String(r.id)));
              const newRecords = loaded.filter((r: InterviewRecord) => !existingIds.has(String(r.id)));
              if (newRecords.length === 0) {
                // 没有新记录，但总数变化了，可能有删除 → 整体刷新
                if (data.pagination.total < prev.length) {
                  return loaded;
                }
                return prev;
              }
              // 把新记录插入到前面
              return [...newRecords, ...prev];
            });
          }
        }
      } catch {
        // ignore
      }
    };

    const startPolling = () => {
      if (timer) return;
      timer = setInterval(poll, pollInterval);
    };

    const stopPolling = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    // 页面可见性变化
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        // 页面重新可见时立即刷新一次，再启动轮询
        poll();
        startPolling();
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [deviceId, deviceIdRef, pollInterval, pageSize, total]);

  // 监听扩展派发的刷新事件
  useEffect(() => {
    const handleDataChanged = () => { refresh(); };
    window.addEventListener("mianjing-data-changed", handleDataChanged);
    return () => window.removeEventListener("mianjing-data-changed", handleDataChanged);
  }, [refresh]);

  // 合并 processing + records 供外部使用？
  // 不，外部自行组合，保持灵活
  return {
    records,
    total,
    page,
    pageSize,
    hasMore,
    loading,
    processingRecords,

    loadRecords,
    loadMore,
    refresh,

    addProcessingRecord,
    updateProcessingRecord,
    persistRecord,
    createRecord,
    updateRecord,
    deleteRecord,
    batchDelete,
    clearAll,

    refreshImageUrls,
  };
}
