"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";
import { motuApiUrl } from "@/lib/utils/public-url";

export function ProjectExportButton({
  projectId,
  format = "images",
  children,
  ...props
}: Omit<ButtonProps, "onClick"> & { projectId: string; format?: "images" | "json" }) {
  const [exporting, setExporting] = useState(false);

  const download = async () => {
    setExporting(true);
    try {
      const response = await fetch(motuApiUrl(`projects/${encodeURIComponent(projectId)}/export/${format}`), {
        credentials: "same-origin",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message || (response.status === 401 ? "登录已失效，请重新登录后导出" : "导出失败，请稍后重试"));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = format === "images" ? `${projectId}-detail-page-images.zip` : `${projectId}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success("导出完成，已开始下载");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button {...props} type="button" disabled={exporting || props.disabled} aria-busy={exporting} onClick={download}>
      {exporting ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : <Download className="h-4 w-4 shrink-0" aria-hidden />}
      {exporting ? "正在打包…" : children}
    </Button>
  );
}
