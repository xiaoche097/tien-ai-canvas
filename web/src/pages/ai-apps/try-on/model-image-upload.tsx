import { Button, Spin } from "antd";
import { FolderOpen, ImagePlus, X } from "lucide-react";
import { useRef } from "react";
import type { ReferenceImage } from "@/types/image";

export function ModelImageUpload({ kind = "model", target, image, disabled, reading, imageUrl, onFiles, onImport, onRemove, onHover }: {
    kind?: "model" | "face";
    target: "product" | "model";
    image?: ReferenceImage;
    disabled: boolean;
    reading: boolean;
    imageUrl: (image: ReferenceImage) => string;
    onFiles: (files: File[]) => void;
    onImport: () => void;
    onRemove: () => void;
    onHover: (target: "product" | "model" | null) => void;
}) {
    const input = useRef<HTMLInputElement>(null);
    const original = target === "product";
    const label = original ? "原模特图" : kind === "face" ? "目标人脸参考图" : "目标模特参考图";
    return <>
        <div className="try-on-section-heading"><h2>{label}</h2><small>必填 · {image ? 1 : 0} / 1</small></div>
        <div className="try-on-drop try-on-model-upload" data-upload-target={target} data-has-image={Boolean(image)} aria-label={`${label}上传区域`} aria-busy={reading} aria-describedby={`try-on-${target}-hint try-on-${target === "model" ? "model" : "product"}-feedback`} tabIndex={disabled ? -1 : 0} onPointerEnter={() => onHover(target)} onPointerLeave={() => onHover(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!disabled) onFiles(Array.from(event.dataTransfer.files)); }}>
            <input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp" aria-label={`上传${label}`} disabled={disabled} onChange={(event) => { onFiles(Array.from(event.target.files || [])); event.target.value = ""; }} />
            {image ? <><div className="try-on-model-preview"><img src={imageUrl(image)} alt={label} /><button type="button" disabled={disabled} aria-label={`移除${label}`} onClick={onRemove}><X size={14} aria-hidden /></button></div><span className="try-on-upload-name" title={image.name}>{image.name}</span></> : null}
            <div className="try-on-upload-actions"><button className="try-on-upload-trigger" type="button" disabled={disabled} onClick={() => input.current?.click()}>{reading ? <Spin size="small" /> : <ImagePlus size={18} aria-hidden />}<strong>{reading ? "正在读取并校验图片…" : image ? "更换图片" : `上传／拖入／粘贴${label}`}</strong></button><Button size="small" disabled={disabled} icon={<FolderOpen size={14} aria-hidden />} onClick={onImport}>从素材库导入</Button></div>
        </div>
        <p id={`try-on-${target}-hint`} className="try-on-note">{kind === "face" ? original ? "保留原发型、身体、肤色、服装、动作与场景，仅替换面部身份。建议使用脸部清晰、无遮挡的单人照片。" : "由你上传清晰的单人人脸参考图，尽量正面、无遮挡。仅借用面部特征，肤色与光线跟随原图，不复制服装、发型或背景。" : original ? "保留这张图中的服装、动作、构图与场景。建议上传人物清晰、服装无遮挡的单人照片。" : "由你上传希望替换成的人物照片，清晰展示面部、发型与肤色。仅借用人物特征，不复制参考图的服装、动作或背景。"}</p>
    </>;
}
