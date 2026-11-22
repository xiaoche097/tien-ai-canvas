import { Button, Select, Spin } from "antd";
import { FolderOpen, ImagePlus, ShoppingBag, X } from "lucide-react";
import { useRef, useState } from "react";
import { bagTypes, type BagMode, type BagOptions, type BagSlot, type BagSource, type TryOnProduct } from "./workflow";

export function BagSettings({ value, onChange }: { value: Omit<BagOptions, "views">; onChange: (value: Omit<BagOptions, "views">) => void }) {
    return <>
        <label className="try-on-field"><span>包型与背法</span><Select aria-label="包型与背法" value={value.type} options={bagTypes.map((item) => ({ value: item.id, label: item.label }))} onChange={(type) => onChange({ ...value, type })} /></label>
        <div className="try-on-field"><span id="try-on-bag-age-label">目标模特年龄</span><div className="try-on-flat-tabs" role="group" aria-labelledby="try-on-bag-age-label">{[{ id: "adult", label: "成人" }, { id: "child", label: "儿童" }].map((item) => <button key={item.id} type="button" aria-pressed={value.ageGroup === item.id} onClick={() => onChange({ ...value, ageGroup: item.id as BagOptions["ageGroup"] })}>{item.label}</button>)}</div><p className="try-on-note">默认成人。请选择与目标模特图相符的年龄组；不改变人物年龄或商品设计。</p></div>
    </>;
}

export function BagUpload({ images, mode, disabled, readingSlot, imageUrl, onModeChange, onFiles, onImport, onRemove, onSource, onHover }: {
    images: TryOnProduct[]; mode: BagMode; disabled: boolean; readingSlot: BagSlot | null;
    imageUrl: (image: TryOnProduct) => string;
    onModeChange: (mode: BagMode) => void;
    onFiles: (files: File[], slot: BagSlot, source: BagSource) => void;
    onImport: (slot: BagSlot, source: BagSource) => void;
    onRemove: (slot: BagSlot) => void;
    onSource: (slot: BagSlot, source: BagSource) => void;
    onHover: (target: `bag-${BagSlot}-${BagSource}` | null) => void;
}) {
    const inputs = useRef<Partial<Record<BagSlot, HTMLInputElement | null>>>({});
    const [sources, setSources] = useState<Partial<Record<BagSlot, BagSource>>>({});
    const views = [{ id: "front", label: "包袋正面整体图" }, { id: "back", label: "包袋背面／包带图" }, { id: "side", label: "包袋右侧／厚度图" }] as const;
    return <div className="try-on-shoe-upload try-on-bag-upload">
        <div className="try-on-segment" role="group" aria-label="包袋商品视角">{(["single", "multi"] as const).map((value) => <button key={value} type="button" disabled={disabled} aria-pressed={mode === value} onClick={() => onModeChange(value)}><ShoppingBag size={15} aria-hidden />{value === "single" ? "单视角图" : "多视角图"}</button>)}</div>
        <div className="try-on-shoe-grid">{views.filter((view) => mode === "multi" || view.id === "front").map((view) => {
            const image = images.find((item) => item.bagSlot === view.id);
            const source = image?.bagView?.source || sources[view.id] || "flat";
            const target = `bag-${view.id}-${source}` as const;
            const label = mode === "single" ? "包袋商品图" : view.label;
            const loading = readingSlot === view.id;
            return <div className="try-on-shoe-slot" key={view.id} data-bag-slot={view.id} data-upload-target={target} aria-label={label} aria-busy={loading} tabIndex={disabled ? -1 : 0} onPointerEnter={() => onHover(target)} onPointerLeave={() => onHover(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!disabled) onFiles(Array.from(event.dataTransfer.files), view.id, source); }}>
                <input ref={(element) => { inputs.current[view.id] = element; }} hidden type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} aria-label={`上传${label}`} onChange={(event) => { onFiles(Array.from(event.target.files || []), view.id, source); event.target.value = ""; }} />
                {image ? <div className="try-on-shoe-preview"><img src={imageUrl(image)} alt={label} /><button type="button" disabled={disabled} aria-label={`移除${label}`} onClick={() => onRemove(view.id)}><X size={14} aria-hidden /></button></div> : null}
                <button className="try-on-shoe-trigger" type="button" disabled={disabled} onClick={() => inputs.current[view.id]?.click()}>{loading ? <Spin size="small" /> : image ? <ImagePlus size={17} aria-hidden /> : <ShoppingBag size={19} aria-hidden />}<span>{loading ? "读取并校验中…" : image ? `更换${label}` : mode === "single" ? "上传／拖入／粘贴包图" : `上传${label}`}</span></button>
                <Button size="small" disabled={disabled} icon={<FolderOpen size={13} />} onClick={() => onImport(view.id, source)}>从素材库导入</Button>
                <Select className="try-on-bag-source-select" aria-label={`${label}来源`} disabled={disabled} value={source} options={[{ value: "flat", label: "平铺商品图" }, { value: "mannequin", label: "人台展示图" }]} onChange={(value) => { setSources((current) => ({ ...current, [view.id]: value })); onSource(view.id, value); onHover(null); }} />
            </div>;
        })}</div>
        <p className="try-on-note">{mode === "multi" ? "请上传同一款包的正面整体、背面包带和右侧厚度图，各 1 张。可使用平铺或人台照片，多角度共同还原包型、容量和背带结构。" : "上传 1 张清晰包图，完整展示包身、包带和五金。支持平铺或人台照片。"}</p>
    </div>;
}
