"use client";

import { useEffect, useRef, useState } from "react";
import { UploadCloud, X } from "lucide-react";

interface ImageUploadProps {
  id: string;
  label: string;
  description?: string;
  files: File[];
  onChange: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
}

function ImagePreview({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url ? <img src={url} alt={file.name} className="h-full w-full object-contain" /> : null;
}

export function ImageUpload({ id, label, description, files, onChange, multiple = false, disabled = false }: ImageUploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");

  function addFiles(incoming: File[]) {
    if (disabled || !incoming.length) return;
    const images = incoming.filter(file => file.type.startsWith("image/"));
    setError(images.length !== incoming.length ? "仅支持图片文件，其他文件未添加。" : !multiple && images.length > 1 ? "此处仅支持一张图片，已选择第一张。" : "");
    if (images.length) onChange(multiple ? [...files, ...images] : [images[0]]);
  }

  return (
    <div className="motu-image-upload flex flex-col gap-3" data-multiple={multiple} data-has-files={files.length > 0}>
      <div
        className="motu-upload-target"
        data-dragging={dragOver && !disabled}
        aria-disabled={disabled}
        onDragOver={event => {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = disabled ? "none" : "copy";
          if (!disabled && Array.from(event.dataTransfer.types).includes("Files")) setDragOver(true);
        }}
        onDragLeave={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false);
        }}
        onDrop={event => {
          event.preventDefault();
          event.stopPropagation();
          setDragOver(false);
          addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <input
          ref={input}
          id={id}
          type="file"
          accept="image/*"
          multiple={multiple}
          disabled={disabled}
          className="sr-only"
          tabIndex={-1}
          aria-label={label}
          onChange={event => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <button type="button" className="motu-upload-trigger" disabled={disabled} aria-label={label} aria-describedby={`${id}-help`} onClick={() => input.current?.click()}>
          <span className="motu-upload-icon"><UploadCloud className="h-6 w-6" aria-hidden /></span>
          <span className="text-sm font-medium">{dragOver && !disabled ? "松开即可添加图片" : files.length ? multiple ? "继续添加图片" : "更换图片" : label}</span>
          <span id={`${id}-help`} className="text-xs text-muted-foreground">点击选择或拖拽图片到此处 · {multiple ? "可添加多张" : "单张图片"}</span>
        </button>
      </div>
      {description && <p className="text-xs leading-5 text-muted-foreground">{description}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div aria-live="polite" className="text-xs text-muted-foreground">{files.length ? `已选择 ${files.length} 张图片` : "尚未选择图片"}</div>
      {files.length > 0 && (
        <ul className={multiple ? "grid grid-cols-2 gap-3 sm:grid-cols-3" : "grid grid-cols-1 gap-3"}>
          {files.map((file, index) => (
            <li key={`${file.name}-${file.lastModified}-${index}`} className="motu-upload-preview relative min-w-0">
              <div className="aspect-square overflow-hidden rounded-md bg-muted"><ImagePreview file={file} /></div>
              <p className="mt-2 truncate text-xs" title={file.name}>{file.name}</p>
              <button type="button" className="motu-upload-remove" disabled={disabled} aria-label={`删除图片 ${file.name}`} onClick={() => { setError(""); onChange(files.filter((_, i) => i !== index)); }}>
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
