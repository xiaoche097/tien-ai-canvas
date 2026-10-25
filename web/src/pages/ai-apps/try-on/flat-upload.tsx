import { Button, Spin } from "antd";
import { FolderOpen, ImagePlus, Layers, Shirt, X } from "lucide-react";
import { useRef } from "react";
import type { FlatMode, GarmentSlot, TryOnProduct } from "./workflow";

const slots = [{ id: "upper", label: "上装", hint: "T 恤、衬衫、外套等" }, { id: "lower", label: "下装", hint: "长裤、短裤、半身裙等" }, { id: "full", label: "全身／连体装", hint: "连衣裙、连体裤等完整服装" }] as const;

export function FlatUpload({ images, mode, disabled, readingSlot, imageUrl, onModeChange, onFiles, onImport, onRemove, onHover }: {
    images: TryOnProduct[];
    mode: FlatMode;
    disabled: boolean;
    readingSlot: GarmentSlot | null;
    imageUrl: (image: TryOnProduct) => string;
    onModeChange: (mode: FlatMode) => void;
    onFiles: (files: File[], slot: GarmentSlot) => void;
    onImport: (slot: GarmentSlot) => void;
    onRemove: (slot: GarmentSlot) => void;
    onHover: (target: `flat-${GarmentSlot}` | null) => void;
}) {
    const inputs = useRef<Partial<Record<GarmentSlot, HTMLInputElement | null>>>({});
    return <div className="try-on-flat-upload">
        <div className="try-on-flat-tabs" role="group" aria-label="服装类型">
            <button type="button" disabled={disabled} aria-pressed={mode === "separates"} onClick={() => onModeChange("separates")}><Shirt aria-hidden size={16} />换上下装</button>
            <button type="button" disabled={disabled} aria-pressed={mode === "onepiece"} onClick={() => onModeChange("onepiece")}><Layers aria-hidden size={16} />换连体装</button>
        </div>
        <div className="try-on-flat-slots">{slots.filter((slot) => mode === "onepiece" ? slot.id === "full" : slot.id !== "full").map((slot) => {
            const image = images.find((item) => item.garmentSlot === slot.id);
            const loading = readingSlot === slot.id;
            return <div key={slot.id} className="try-on-flat-slot" data-upload-target={`flat-${slot.id}`} data-has-image={Boolean(image)} aria-label={`${slot.label}上传区域`} aria-busy={loading} tabIndex={disabled ? -1 : 0} onPointerEnter={() => onHover(`flat-${slot.id}`)} onPointerLeave={() => onHover(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!disabled) onFiles(Array.from(event.dataTransfer.files), slot.id); }}>
                <input ref={(element) => { inputs.current[slot.id] = element; }} hidden type="file" accept="image/png,image/jpeg,image/webp" aria-label={`上传${slot.label}`} disabled={disabled} onChange={(event) => { onFiles(Array.from(event.target.files || []), slot.id); event.target.value = ""; }} />
                {image ? <div className="try-on-flat-preview"><img src={imageUrl(image)} alt={`${slot.label}商品图`} /><button type="button" disabled={disabled} aria-label={`移除${slot.label}`} onClick={() => onRemove(slot.id)}><X aria-hidden size={14} /></button></div> : null}
                {image ? <span className="try-on-upload-name" title={image.name}>{slot.label} · {image.name}</span> : <span className="try-on-flat-slot-hint">{slot.hint} · 每个位置 1 张</span>}
                <div className="try-on-upload-actions">
                    <button className="try-on-flat-trigger" type="button" disabled={disabled} onClick={() => inputs.current[slot.id]?.click()}>{loading ? <Spin size="small" /> : <ImagePlus aria-hidden size={18} />}<strong>{loading ? "正在读取图片…" : image ? `更换${slot.label}` : `上传／拖入／粘贴${slot.label}`}</strong></button>
                    <Button size="small" icon={<FolderOpen aria-hidden size={14} />} disabled={disabled} onClick={() => onImport(slot.id)}>从素材库导入</Button>
                </div>
            </div>;
        })}</div>
        <p className="try-on-note">{mode === "onepiece" ? "上传完整服装，保留领口、腰线与裙摆结构。" : "可只上传上装或下装，也可组合搭配；未替换的服装沿用参考模特原穿搭。"}图片无遮挡、无褶皱更利于还原。</p>
    </div>;
}
