import { Button } from "antd";
import { Download, Minus, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AppModal } from "@/components/ui/product/app-modal";
import type { ReferenceImage } from "@/types/image";
import type { AiConfig } from "@/stores/use-config-store";

export type TryOnResultContext = {
    batchId?: string;
    title: string;
    time: string;
    mode: string;
    ratio: string;
    resolution: string;
    model?: string;
    modelLabel?: string;
    settings?: Partial<Pick<AiConfig, "size" | "imageResolution" | "quality" | "imageParameters">>;
    products: ReferenceImage[];
    references: ReferenceImage[];
};
export type TryOnResultImage = { dataUrl?: string; storageKey?: string; width?: number; height?: number; mimeType?: string; context?: TryOnResultContext };

export function TryOnResultViewer({ images, index, onIndexChange, onClose, imageUrl, onDownload }: {
    images: TryOnResultImage[];
    index: number;
    onIndexChange: (index: number) => void;
    onClose: () => void;
    imageUrl: (image: { dataUrl?: string; storageKey?: string }) => string;
    onDownload: (index: number) => void;
}) {
    const [zoom, setZoom] = useState(1);
    const [natural, setNatural] = useState({ width: 1, height: 1 });
    const [area, setArea] = useState({ width: 800, height: 600 });
    const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
    const image = images[index];
    const context = image?.context;
    useEffect(() => {
        if (!viewport) return;
        const observer = new ResizeObserver(([entry]) => setArea({ width: entry.contentRect.width, height: entry.contentRect.height }));
        observer.observe(viewport);
        return () => observer.disconnect();
    }, [viewport]);
    useEffect(() => { setZoom(1); viewport?.scrollTo(0, 0); }, [index, viewport]);
    const fit = Math.max(.01, Math.min((area.width - 48) / natural.width, (area.height - 48) / natural.height, 1));
    if (!image) return null;
    return <AppModal open flush rootClassName="app-user-overlays try-on-viewer-modal" closable={false} footer={null} width="calc(100vw - 24px)" style={{ top: 12, paddingBottom: 0 }} onCancel={onClose} aria-labelledby="try-on-viewer-title">
        <div className="try-on-viewer">
            <header><h2 id="try-on-viewer-title">结果图 {index + 1} / {images.length}</h2><Button type="text" aria-label="关闭大图" onClick={onClose}><X size={18} /></Button></header>
            <div className="try-on-viewer-body">
                <nav aria-label="切换结果图片">{images.map((item, i) => <button type="button" key={`${item.storageKey}-${i}`} aria-label={`查看大图 ${i + 1}`} aria-pressed={index === i} onClick={() => onIndexChange(i)}><img src={imageUrl(item)} alt={`结果 ${i + 1}`} /></button>)}</nav>
                <div className="try-on-viewer-viewport" ref={setViewport}><div className="try-on-viewer-canvas"><img className="try-on-lightbox" src={imageUrl(image)} alt={`生成结果 ${index + 1} 大图`} style={{ width: natural.width * fit * zoom, height: natural.height * fit * zoom }} onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} /></div></div>
                <aside><h3>{context?.title || "万物上身"}</h3><p className="try-on-viewer-brand">镜彻 · 任务详情</p><dl><dt>生成时间</dt><dd>{context?.time ? new Date(context.time).toLocaleString() : "未记录"}</dd><dt>生成模式</dt><dd>{context?.mode || "未记录"}</dd><dt>图片比例</dt><dd>{context?.ratio || (image.width && image.height ? `${image.width} × ${image.height}` : "原图比例")}</dd><dt>清晰度</dt><dd>{context?.resolution || "模型默认"}</dd></dl>
                    {context?.modelLabel ? <p className="try-on-note">执行模型：{context.modelLabel}</p> : null}
                    {context?.products.length ? <section><h4>商品／原模特图</h4><div>{context.products.map((item, i) => <img key={`${item.id}-${i}`} src={imageUrl(item)} alt={`原商品图 ${i + 1}`} />)}</div></section> : null}
                    {context?.references.length ? <section><h4>目标参考图</h4><div>{context.references.map((item, i) => <img key={`${item.id}-${i}`} src={imageUrl(item)} alt={`目标参考图 ${i + 1}`} />)}</div></section> : null}
                    {!context ? <p>此历史结果未保存参考图快照。</p> : null}
                </aside>
            </div>
            <footer><div className="try-on-zoom-controls"><Button aria-label="缩小图片" disabled={zoom <= .5} onClick={() => setZoom((value) => Math.max(.5, value - .25))}><Minus size={15} /></Button><span aria-live="polite">{Math.round(fit * zoom * 100)}%</span><Button aria-label="放大图片" disabled={zoom >= 4} onClick={() => setZoom((value) => Math.min(4, value + .25))}><Plus size={15} /></Button><Button icon={<RotateCcw size={14} />} onClick={() => setZoom(1)}>适应窗口</Button></div><Button icon={<Download size={15} />} onClick={() => onDownload(index)}>下载原图</Button></footer>
        </div>
    </AppModal>;
}
