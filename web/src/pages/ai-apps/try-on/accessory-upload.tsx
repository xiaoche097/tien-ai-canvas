import { Button, Spin } from "antd";
import { FolderOpen, ImagePlus, X } from "lucide-react";
import { useRef } from "react";
import { accessoryTypes, type AccessoryType, type TryOnProduct } from "./workflow";

export function AccessoryUpload({ category, image, disabled, reading, imageUrl, onCategoryChange, onFiles, onImport, onRemove, onHover }: {
    category: AccessoryType;
    image?: TryOnProduct;
    disabled: boolean;
    reading: boolean;
    imageUrl: (image: TryOnProduct) => string;
    onCategoryChange: (category: AccessoryType) => void;
    onFiles: (files: File[]) => void;
    onImport: () => void;
    onRemove: () => void;
    onHover: (target: "product" | null) => void;
}) {
    const input = useRef<HTMLInputElement>(null);
    const selected = accessoryTypes.find((item) => item.id === category)!;
    const label = `${selected.label}商品图`;
    return <>
        <div className="try-on-section-heading"><h2 id="try-on-accessory-type-label">商品类型</h2></div>
        <div className="try-on-accessory-types" role="group" aria-labelledby="try-on-accessory-type-label">{accessoryTypes.map((item) => <button key={item.id} type="button" disabled={disabled} aria-pressed={category === item.id} onClick={() => onCategoryChange(item.id)}>{item.label}</button>)}</div>
        <div className="try-on-section-heading"><h2>{label}</h2><small>{image ? 1 : 0} / 1</small></div>
        <div className="try-on-drop try-on-accessory-drop" data-upload-target="product" data-has-image={Boolean(image)} aria-label={`${label}上传区域`} aria-busy={reading} aria-describedby="try-on-product-feedback try-on-accessory-hint" tabIndex={disabled ? -1 : 0} onPointerEnter={() => onHover("product")} onPointerLeave={() => onHover(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!disabled) onFiles(Array.from(event.dataTransfer.files)); }}>
            <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp" aria-label={`上传${label}`} disabled={disabled} onChange={(event) => { onFiles(Array.from(event.target.files || [])); event.target.value = ""; }} />
            {image ? <div className="try-on-accessory-preview"><img src={imageUrl(image)} alt={label} /><button type="button" disabled={disabled} aria-label={`移除${label}`} onClick={onRemove}><X size={14} aria-hidden /></button></div> : null}
            {image ? <span className="try-on-upload-name" title={image.name}>{image.name}</span> : null}
            <div className="try-on-upload-actions">
                <button className="try-on-upload-trigger" type="button" disabled={disabled} onClick={() => input.current?.click()}>{reading ? <Spin size="small" /> : <ImagePlus aria-hidden size={18} />}<strong>{reading ? "正在读取并校验图片…" : image ? "更换图片" : `上传／拖入／粘贴${label}`}</strong></button>
                <Button size="small" icon={<FolderOpen aria-hidden size={14} />} disabled={disabled} onClick={onImport}>从素材库导入</Button>
            </div>
        </div>
        <p id="try-on-accessory-hint" className="try-on-note">{selected.hint}</p>
    </>;
}
