import { Button, Spin } from "antd";
import { FolderOpen, Footprints, ImagePlus, X } from "lucide-react";
import { useRef } from "react";
import type { ShoeView, TryOnProduct } from "./workflow";

const views = [{ id: "pair", label: "双脚鞋图" }, { id: "outer", label: "单鞋外侧图" }, { id: "inner", label: "单鞋内侧图" }] as const;

export function ShoeUpload({ images, mode, disabled, readingView, imageUrl, onModeChange, onFiles, onImport, onRemove, onHover }: {
    images: TryOnProduct[];
    mode: "single" | "multi";
    disabled: boolean;
    readingView: ShoeView | null;
    imageUrl: (image: TryOnProduct) => string;
    onModeChange: (mode: "single" | "multi") => void;
    onFiles: (files: File[], view: ShoeView) => void;
    onImport: (view: ShoeView) => void;
    onRemove: (view: ShoeView) => void;
    onHover: (target: `shoe-${ShoeView}` | null) => void;
}) {
    const inputs = useRef<Partial<Record<ShoeView, HTMLInputElement | null>>>({});
    return <div className="try-on-shoe-upload">
        <div className="try-on-segment" role="group" aria-label="鞋靴商品视角">{(["single", "multi"] as const).map((value) => <button key={value} type="button" disabled={disabled} aria-pressed={mode === value} onClick={() => onModeChange(value)}><Footprints size={15} aria-hidden />{value === "single" ? "单视角图" : "多视角图"}</button>)}</div>
        <div className="try-on-shoe-grid">{views.filter((view) => mode === "multi" || view.id === "pair").map((view) => {
            const image = images.find((item) => item.shoeView === view.id);
            const loading = readingView === view.id;
            const label = mode === "single" ? "鞋靴商品图" : view.label;
            return <div key={view.id} className="try-on-shoe-slot" data-shoe-view={view.id} data-upload-target={`shoe-${view.id}`} aria-label={label} aria-busy={loading} tabIndex={0} onPointerEnter={() => onHover(`shoe-${view.id}`)} onPointerLeave={() => onHover(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onFiles(Array.from(event.dataTransfer.files), view.id); }}>
                <input ref={(element) => { inputs.current[view.id] = element; }} hidden type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={(event) => { onFiles(Array.from(event.target.files || []), view.id); event.target.value = ""; }} />
                {image ? <div className="try-on-shoe-preview"><img src={imageUrl(image)} alt={label} /><button type="button" disabled={disabled} aria-label={`移除${label}`} onClick={() => onRemove(view.id)}><X size={14} /></button></div> : null}
                <button className="try-on-shoe-trigger" type="button" disabled={disabled} onClick={() => inputs.current[view.id]?.click()}>{loading ? <Spin size="small" /> : image ? <ImagePlus size={17} aria-hidden /> : <Footprints size={19} aria-hidden />}<span>{loading ? "读取并校验中…" : image ? `更换${label}` : mode === "single" ? "上传／拖入／粘贴鞋图" : `上传${label}`}</span></button>
                <Button size="small" disabled={disabled} icon={<FolderOpen size={13} />} onClick={() => onImport(view.id)}>从素材库导入</Button>
            </div>;
        })}</div>
        <p className="try-on-note">{mode === "multi" ? "请上传同一双鞋的双脚、外侧和内侧图，各 1 张。多角度帮助还原鞋型与细节。" : "上传 1 张清晰鞋图，完整展示鞋头、鞋底和鞋跟。"}</p>
    </div>;
}
