"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const STORAGE_KEY = "mianjing_device_id";

// 生成设备 ID
function generateDeviceId(): string {
  return `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 设备 ID 管理 Hook
 * - 负责初始化、同步 localStorage / URL 参数 / 扩展
 * - 通过 CustomEvent 与扩展通信
 * - 提供 current ref，供 fetch 同步使用
 */
export function useDeviceId() {
  const [deviceId, setDeviceId] = useState<string>("");
  const deviceIdRef = useRef<string>("");
  const [fromTab, setFromTab] = useState(false);

  // 同步 deviceId 到 ref
  const updateDeviceId = useCallback((id: string) => {
    deviceIdRef.current = id;
    setDeviceId(id);
    localStorage.setItem(STORAGE_KEY, id);
    // 通知扩展
    try {
      window.dispatchEvent(
        new CustomEvent("mianjing-device-id-updated", { detail: id })
      );
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    // 1. 从 URL 参数读取（扩展同步用）
    const urlParams = new URLSearchParams(window.location.search);
    const urlDeviceId = urlParams.get("device_id");
    const fromExtension = urlParams.get("from") === "ext" || !!urlDeviceId;
    if (urlDeviceId) {
      localStorage.setItem(STORAGE_KEY, urlDeviceId);
      window.history.replaceState({}, "", window.location.pathname);
    }
    setFromTab(fromExtension);

    // 2. 从 localStorage 读取
    let did = localStorage.getItem(STORAGE_KEY);
    if (!did) {
      did = generateDeviceId();
      localStorage.setItem(STORAGE_KEY, did);
    }
    updateDeviceId(did);

    // 3. 监听 storage 事件（跨标签页同步）
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue && e.newValue !== deviceIdRef.current) {
        deviceIdRef.current = e.newValue;
        setDeviceId(e.newValue);
      }
    };

    // 4. 监听扩展通过 executeScript 派发的 deviceId 变更事件
    const handleDeviceIdChanged = (e: Event) => {
      const newId = (e as CustomEvent).detail;
      if (newId && newId !== deviceIdRef.current) {
        localStorage.setItem(STORAGE_KEY, newId);
        deviceIdRef.current = newId;
        setDeviceId(newId);
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("mianjing-device-id-changed", handleDeviceIdChanged);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("mianjing-device-id-changed", handleDeviceIdChanged);
    };
  }, [updateDeviceId]);

  return {
    deviceId,
    deviceIdRef,
    fromTab,
  };
}
