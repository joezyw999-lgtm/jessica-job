"use client";

import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RecordStatus } from "@/types/interview";

interface StatusBadgeProps {
  status: RecordStatus;
  errorMsg?: string;
  content?: string;
}

export function StatusBadge({ status, errorMsg, content }: StatusBadgeProps) {
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
}
