"use client";

import { useState } from "react";
import { Download, Puzzle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    title: "下载扩展文件",
    desc: "点击下方按钮下载 Chrome 扩展压缩包",
  },
  {
    title: "解压文件",
    desc: "将下载的 zip 文件解压到一个固定目录",
  },
  {
    title: "打开扩展管理页",
    desc: "在 Chrome 地址栏输入 chrome://extensions 并回车",
  },
  {
    title: "开启开发者模式",
    desc: "在扩展管理页右上角打开「开发者模式」开关",
  },
  {
    title: "加载扩展",
    desc: '点击「加载已解压的扩展程序」，选择解压后的文件夹',
  },
  {
    title: "开始使用",
    desc: "在任意网页点击扩展图标，Ctrl+V 粘贴面经截图即可识别",
  },
];

export default function ChromeExtensionPage() {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/chrome-extension/download");
      if (!res.ok) throw new Error("下载失败");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mianjing-chrome-extension.zip";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("下载失败，请稍后重试");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-8"
      style={{ background: "#F8F7F5" }}
    >
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: "#2D6A6A" }}
          >
            <Puzzle className="h-8 w-8 text-white" />
          </div>
          <h1
            className="text-2xl font-semibold mb-2"
            style={{ color: "#1A1A1A" }}
          >
            面经识客 - Chrome 扩展
          </h1>
          <p style={{ color: "#6B7280" }}>
            在任何网页复制面经截图，一键粘贴识别
          </p>
        </div>

        {/* Download */}
        <div
          className="rounded-xl p-6 mb-8 text-center"
          style={{ background: "#FFFFFF", border: "1px solid #E5E2DD" }}
        >
          <p className="text-sm mb-4" style={{ color: "#6B7280" }}>
            下载 Chrome 扩展安装包，安装后在任何网页都能使用面经识别
          </p>
          <Button
            onClick={handleDownload}
            disabled={downloading}
            className="gap-2 px-8 h-11 text-sm font-medium"
            style={{ background: "#D4853A", color: "white" }}
          >
            <Download className="h-4 w-4" />
            {downloading ? "打包中..." : "下载扩展压缩包"}
          </Button>
        </div>

        {/* Install Steps */}
        <div
          className="rounded-xl p-6"
          style={{ background: "#FFFFFF", border: "1px solid #E5E2DD" }}
        >
          <h2
            className="text-base font-semibold mb-5"
            style={{ color: "#1A1A1A" }}
          >
            安装步骤
          </h2>
          <div className="space-y-4">
            {STEPS.map((step, i) => (
              <div key={i} className="flex gap-4">
                <div
                  className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                  style={{ background: "#2D6A6A" }}
                >
                  {i + 1}
                </div>
                <div>
                  <div
                    className="text-sm font-medium"
                    style={{ color: "#1A1A1A" }}
                  >
                    {step.title}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                    {step.desc}
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <ChevronRight
                    className="flex-shrink-0 h-4 w-4 self-center opacity-30"
                    style={{ color: "#6B7280" }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          {[
            { title: "单张/多张", desc: "支持模式切换" },
            { title: "自动识别", desc: "公司/岗位/内容" },
            { title: "数据互通", desc: "与主站同步" },
          ].map((f, i) => (
            <div
              key={i}
              className="rounded-lg p-3 text-center"
              style={{ background: "#FFFFFF", border: "1px solid #E5E2DD" }}
            >
              <div
                className="text-sm font-medium"
                style={{ color: "#2D6A6A" }}
              >
                {f.title}
              </div>
              <div className="text-xs" style={{ color: "#6B7280" }}>
                {f.desc}
              </div>
            </div>
          ))}
        </div>

        {/* Back */}
        <div className="text-center mt-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.history.back()}
            style={{ color: "#6B7280" }}
          >
            返回主页
          </Button>
        </div>
      </div>
    </div>
  );
}
