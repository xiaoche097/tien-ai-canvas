import { Button } from "antd";
import { FolderOpen, ImagePlus, X } from "lucide-react";
import { useRef, useState } from "react";
import type { ReferenceImage } from "@/types/image";
import { resourceFileUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import { readAutoPartsImage } from "./workflow";

export const autoPartsImageUrl = (image: { dataUrl?: string; storageKey?: string }) => image.dataUrl || (resourceIdFromStorageKey(image.storageKey) ? resourceFileUrl(resourceIdFromStorageKey(image.storageKey)!) : "");

export function AutoPartsImageUpload({ label, hint, images, limit, disabled, onChange, onReading, onImport }: { label: string; hint: string; images: ReferenceImage[]; limit: number; disabled: boolean; onChange: (images: ReferenceImage[]) => void; onReading: (reading: boolean) => void; onImport: () => void }) {
    const input = useRef<HTMLInputElement>(null), lock = useRef(false);
    const [reading, setReading] = useState(false), [error, setError] = useState("");
    const add = async (files: File[]) => {
        if (disabled || lock.current || !files.length) return;
        lock.current = true; setReading(true); onReading(true); setError("");
        try {
            if (limit === 1 ? files.length !== 1 : files.length + images.length > limit) throw new Error(`此处最多 ${limit} 张图片`);
            const next = await Promise.all(files.map(readAutoPartsImage));
            onChange(limit === 1 ? next : [...images, ...next]);
        } catch (error) { setError(error instanceof Error ? error.message : "图片导入失败"); }
        finally { lock.current = false; setReading(false); onReading(false); }
    };
    return <section className="auto-parts-upload-section"><div className="auto-parts-section-label"><h3>{label}</h3><span>{images.length} / {limit}</span></div>
        <div className="auto-parts-upload" tabIndex={disabled ? -1 : 0} aria-label={`${label}上传区`} aria-busy={reading} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void add(Array.from(event.dataTransfer.files)); }} onPaste={(event) => { if (event.clipboardData.files.length) { event.preventDefault(); void add(Array.from(event.clipboardData.files)); } }}>
            <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp" multiple={limit > 1} disabled={disabled} onChange={(event) => { void add(Array.from(event.target.files || [])); event.target.value = ""; }} />
            {images.length ? <div className="auto-parts-upload-thumbs">{images.map((image) => <div key={image.id}><img src={autoPartsImageUrl(image)} alt={image.name} /><button type="button" disabled={disabled} aria-label={`移除${image.name}`} onClick={() => onChange(images.filter((item) => item.id !== image.id))}><X size={14} /></button></div>)}</div> : <ImagePlus size={25} aria-hidden />}
            <button type="button" className="auto-parts-upload-trigger" disabled={disabled} onClick={() => input.current?.click()}>{reading ? "正在读取图片…" : images.length && limit === 1 ? "更换图片" : "上传／拖入／粘贴图片"}</button>
            <Button size="small" icon={<FolderOpen size={14} />} disabled={disabled} onClick={onImport}>从素材库导入</Button>
        </div><p className="auto-parts-hint">{hint}</p>{error ? <p className="auto-parts-error" role="alert">{error}</p> : null}
    </section>;
}
