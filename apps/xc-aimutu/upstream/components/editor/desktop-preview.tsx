"use client";

import { buildGalleryImages, buildProductDescription, getPreviewConfig } from "./editor-utils";

interface DesktopPreviewProps {
  project: any;
  selectedHeroIndex: number;
  onSelectHeroIndex: (index: number) => void;
  onOpenLightbox: (src: string) => void;
  emptyHeroTitle?: string;
}

export function DesktopPreview({ project, selectedHeroIndex, onSelectHeroIndex, onOpenLightbox, emptyHeroTitle }: DesktopPreviewProps) {
  const config = getPreviewConfig(project);
  const images = buildGalleryImages(project, config.heroImageCount);
  const active = emptyHeroTitle ? null : images[selectedHeroIndex] ?? images[0];
  const analysis = project.analysis?.normalizedResult;
  const details = project.sections.filter((section: any) => section.type !== "HERO");

  return <div data-preview-scroll className="h-full overflow-y-auto overscroll-contain rounded-xl border border-border bg-card text-card-foreground">
    <div className="border-b border-border px-8 py-4 text-sm text-muted-foreground">商品桌面预览 · 与移动端共用当前版本素材</div>
    <div data-preview-hero className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-8 p-8">
      <div className="min-w-0 space-y-4">
        {active ? <button type="button" className="block w-full cursor-zoom-in overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`查看原图：${active.label}`} onClick={() => onOpenLightbox(active.url)}><img src={active.url} alt={active.label} className="block h-auto w-full" decoding="async" /></button> : <div className="grid place-items-center rounded-xl bg-muted text-sm text-muted-foreground" style={{ aspectRatio: config.heroAspectRatio.replace(":", "/") }}>尚未生成主图</div>}
        <div className="grid grid-cols-5 items-start gap-3">
          {images.map((image, index) => <button key={image.id} type="button" aria-label={`预览主图：${image.label}`} aria-pressed={active?.id === image.id} onClick={() => onSelectHeroIndex(index)} className={`overflow-hidden rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active?.id === image.id ? "border-primary ring-1 ring-primary" : "border-border"}`}><img src={image.url} alt={image.label} className="block h-auto w-full" loading="lazy" decoding="async" /></button>)}
        </div>
      </div>
      <div className="min-w-0 space-y-6 break-words">
        <h3 className="text-2xl font-semibold leading-relaxed">{analysis?.productName || project.name}</h3>
        <p className="whitespace-pre-line text-sm leading-7 text-muted-foreground">{buildProductDescription(analysis, project.sections)}</p>
        <div className="rounded-xl bg-muted p-5"><p className="text-sm text-muted-foreground">商品价格</p><p className="mt-2 text-xl font-semibold">{analysis?.price == null || analysis.price === "" ? "未配置" : String(analysis.price)}</p></div>
        {Array.isArray(analysis?.coreSellingPoints) && analysis.coreSellingPoints.length > 0 && <ul className="list-disc space-y-3 pl-5 text-sm leading-6">{analysis.coreSellingPoints.map((point: string, index: number) => <li key={index}>{point}</li>)}</ul>}
        <p className="border-t border-border pt-4 text-xs leading-6 text-muted-foreground">内部视觉模拟，仅展示项目当前素材。设备切换不会重新生成图片或修改导出尺寸。</p>
      </div>
    </div>
    <div className="border-y border-border px-8 py-4 text-base font-semibold">商品详情 · {details.length} 个模块</div>
    <div className="mx-auto max-w-[800px]">
      {details.map((section: any) => <section key={section.id} data-preview-section={section.id} aria-label={section.title}>
        {section.imageUrl ? <button type="button" onClick={() => onOpenLightbox(section.imageUrl)} aria-label={`查看原图：${section.title}`} className="block w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><img src={section.imageUrl} alt={section.title} className="block h-auto w-full" loading="lazy" decoding="async" /></button> : <div className="grid min-h-48 place-items-center border-b border-border bg-muted p-8 text-center text-sm text-muted-foreground">{section.title} · 尚未生成图像</div>}
      </section>)}
    </div>
  </div>;
}
