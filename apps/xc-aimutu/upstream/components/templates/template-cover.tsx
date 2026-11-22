"use client";

import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { motuFileUrl } from "@/lib/utils/public-url";

export function TemplateCover({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const url = src?.startsWith("/api/files/") ? motuFileUrl(src.slice("/api/files/".length)) : src;
  const available = Boolean(url && !url.endsWith("/window.svg") && !failed);
  return available ? <img src={url} alt={name} className="h-full w-full object-cover object-top" onError={() => setFailed(true)} /> : (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <ImageIcon className="h-10 w-10" aria-hidden />
      <span className="text-xs">暂无封面，可上传第一张参考图</span>
    </div>
  );
}
