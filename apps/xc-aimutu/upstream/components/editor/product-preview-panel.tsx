"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Monitor, Smartphone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/hooks/use-editor-store";
import { DesktopPreview } from "./desktop-preview";
import { PhonePreviewPanel } from "./phone-preview-panel";
import { previewScale, resolvePreviewDevice, type PreviewZoom } from "./preview-state";

interface ProductPreviewPanelProps {
  project: any;
  expanded: boolean;
  onToggleExpanded: () => void;
  selectedHeroIndex: number;
  previewSelection?: { sectionId: string; revision: number } | null;
  onSelectHeroIndex: (index: number) => void;
  onOpenLightbox: (src: string) => void;
}

export function ProductPreviewPanel({ project, expanded, onToggleExpanded, selectedHeroIndex, previewSelection, onSelectHeroIndex, onOpenLightbox }: ProductPreviewPanelProps) {
  const savedDevice = useEditorStore((state) => state.previewDevices[project.id]);
  const setDevice = useEditorStore((state) => state.setPreviewDevice);
  const device = resolvePreviewDevice(project.platform, savedDevice);
  const [zoom, setZoom] = useState<PreviewZoom>("fit");
  const viewport = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setBounds({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const scale = previewScale(zoom, bounds.width, bounds.height, device);
  const width = device === "desktop" ? 1000 : 396;
  const height = device === "desktop" && zoom === "fit" ? Math.max(1, (bounds.height - 32) / scale) : 780;
  const selectedSection = project.sections.find((section: any) => section.id === previewSelection?.sectionId);
  const contentProps = { project, selectedHeroIndex, onSelectHeroIndex, onOpenLightbox, emptyHeroTitle: selectedSection?.type === "HERO" && !selectedSection.imageUrl ? selectedSection.title : undefined };
  useLayoutEffect(() => {
    if (!selectedSection || !viewport.current) return;
    const preview = viewport.current.querySelector(`[data-preview-device="${device}"]`);
    const scroller = preview?.querySelector<HTMLElement>("[data-preview-scroll]");
    const target = selectedSection.type === "HERO"
      ? preview?.querySelector<HTMLElement>("[data-preview-hero]")
      : Array.from(preview?.querySelectorAll<HTMLElement>("[data-preview-section]") ?? []).find((element) => element.dataset.previewSection === selectedSection.id);
    if (!scroller || !target) return;
    let following = true;
    const align = () => {
      if (!following) return;
      scroller.scrollTop = Math.max(0, scroller.scrollTop + (target.getBoundingClientRect().top - scroller.getBoundingClientRect().top) / scale);
      if (viewport.current) viewport.current.scrollTop = 0;
    };
    const stopFollowing = () => { following = false; };
    // Lazy images above the target can change its position after selection.
    // Keep it aligned until the user starts navigating the preview themselves.
    scroller.addEventListener("load", align, true);
    const navigationEvents = ["wheel", "touchstart", "pointerdown", "keydown"];
    navigationEvents.forEach((event) => scroller.addEventListener(event, stopFollowing, { passive: true }));
    align();
    return () => {
      scroller.removeEventListener("load", align, true);
      navigationEvents.forEach((event) => scroller.removeEventListener(event, stopFollowing));
    };
  }, [previewSelection, device, scale, selectedSection?.id, selectedSection?.imageUrl]);

  return <Card className="flex h-[920px] min-h-0 min-w-0 flex-col">
    <CardHeader className="motu-preview-toolbar">
      <CardTitle className="mr-auto">商品页预览</CardTitle>
        <div role="group" aria-label="预览设备" className="inline-flex rounded-xl border border-border bg-muted p-1">
          {(["desktop", "mobile"] as const).map((value) => <Button key={value} size="sm" variant="ghost" aria-pressed={device === value} onClick={() => setDevice(project.id, project.platform, value)} className={device === value ? "bg-card text-foreground shadow-sm" : ""}>{value === "desktop" ? <Monitor className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}{value === "desktop" ? "桌面端" : "移动端"}</Button>)}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">缩放<select aria-label="预览缩放" className="h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground" value={zoom} onChange={(event) => setZoom(event.target.value === "fit" ? "fit" : Number(event.target.value) as PreviewZoom)}><option value="fit">适应容器</option><option value={50}>50%</option><option value={75}>75%</option><option value={100}>100%</option></select></label>
      <Button size="sm" variant="outline" aria-pressed={expanded} onClick={onToggleExpanded}>{expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}{expanded ? "恢复三栏" : "扩大预览"}</Button>
      <details className="relative text-xs text-muted-foreground"><summary className="cursor-pointer" aria-label="预览说明">说明</summary><CardDescription className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-border bg-card p-3 shadow-lg">{project.platform === "amazon" ? "Amazon 素材通用预览，仅供布局参考，不代表平台最终页面。切换设备共用当前版本图片。" : "设备间共用当前版本素材；切换仅影响预览，不改变生成比例或编辑草稿。"}</CardDescription></details>
    </CardHeader>
    <CardContent className="flex min-h-0 flex-1 flex-col p-0">
      {selectedSection && <p className="border-b border-border px-4 py-2 text-sm" aria-live="polite">当前模块：{selectedSection.title}{!selectedSection.imageUrl && " · 尚未生成图像"}</p>}
      <div ref={viewport} className="min-h-0 flex-1 overflow-auto bg-muted/30 p-4" tabIndex={0} aria-label="商品预览画布">
      <div className="relative mx-auto" style={{ width: width * scale, height: height * scale, visibility: bounds.width ? "visible" : "hidden" }}>
        <div className="absolute left-0 top-0 origin-top-left" style={{ width, height, transform: `scale(${scale})` }}>
          <div data-preview-device="desktop" className={device === "desktop" ? "h-full" : "hidden"}><DesktopPreview {...contentProps} /></div>
          <div data-preview-device="mobile" className={device === "mobile" ? "h-full" : "hidden"}><PhonePreviewPanel {...contentProps} embedded /></div>
        </div>
      </div>
      </div>
    </CardContent>
  </Card>;
}
