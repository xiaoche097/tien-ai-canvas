import { useId } from "react";
import { Checkbox, Input, InputNumber } from "antd";
import type { NativeTextLayer } from "@/lib/psd-layer-contract";
import { psdTextPixels, updatePsdTextLayout } from "@/lib/psd-text-layout";

export function PsdTextLayerEditor({ lines, width, height, disabled, onChange }: {
    lines: NativeTextLayer[]; width: number; height: number; disabled: boolean; onChange: (lines: NativeTextLayer[]) => void;
}) {
    const prefix = useId(), canvas = { width, height };
    return <div className="space-y-3" aria-label="文字图层校对">
        {lines.map((line, index) => {
            const pixel = psdTextPixels(line, canvas), textId = `${prefix}-text-${index}`;
            const update = (patch: Parameters<typeof updatePsdTextLayout>[2]) => onChange(lines.map((item, i) => i === index ? updatePsdTextLayout(item, canvas, patch) : item));
            const numeric = [
                { key: "fontSizePx", label: "字号", min: height / 1000, max: height * 0.3 },
                { key: "rotation", label: "旋转角度", min: -180, max: 180 },
                { key: "x", label: "左边距", min: 0, max: width - pixel.width },
                { key: "y", label: "上边距", min: 0, max: height - pixel.height },
                { key: "width", label: "文本框宽度", min: 1, max: width - pixel.x },
                { key: "height", label: "文本框高度", min: 1, max: height - pixel.y },
            ] as const;
            return <fieldset key={index} disabled={disabled} className="min-w-0 space-y-2 rounded-lg border border-[var(--border)] p-3">
                <legend className="px-1 text-sm font-medium">文字 {index + 1}</legend>
                <label htmlFor={textId} className="text-xs opacity-75">文案</label>
                <Input.TextArea id={textId} aria-label={`校对文字 ${index + 1}`} aria-invalid={!line.text.trim()} aria-describedby={!line.text.trim() ? `${textId}-error` : undefined} value={line.text} autoSize={{ minRows: 2, maxRows: 8 }} disabled={disabled} onChange={(event) => update({ text: event.target.value })} />
                {!line.text.trim() && <p id={`${textId}-error`} role="alert" className="text-xs text-[var(--destructive)]">文字不能为空，请补充后再应用。</p>}
                <details>
                    <summary className="cursor-pointer text-sm">排版设置</summary>
                    <p className="my-2 text-xs opacity-75">位置、尺寸与字号使用原图像素；字体仍为近似重建，应用后可在精修中调整。</p>
                    <div className="grid grid-cols-2 gap-3">
                        {numeric.map((field) => <label key={field.key} className="grid min-w-0 gap-1 text-xs">{field.label}{field.key === "rotation" ? "（°）" : "（px）"}
                            <InputNumber aria-label={`文字 ${index + 1} ${field.label}`} className="w-full" disabled={disabled} min={field.min} max={field.max} step={1} precision={1} value={field.key === "rotation" ? line.rotation : pixel[field.key]} onChange={(value) => { if (typeof value === "number" && Number.isFinite(value)) update({ [field.key]: value }); }} />
                        </label>)}
                        <label className="grid min-w-0 gap-1 text-xs">文字颜色<input aria-label={`文字 ${index + 1} 颜色`} type="color" value={line.color} disabled={disabled} className="h-9 w-full rounded border border-[var(--border)] bg-[var(--background)]" onChange={(event) => update({ color: event.target.value })} /></label>
                        <label className="grid min-w-0 gap-1 text-xs">对齐<select aria-label={`文字 ${index + 1} 对齐`} value={line.align} disabled={disabled} className="h-9 rounded border border-[var(--border)] bg-[var(--background)] px-2" onChange={(event) => update({ align: event.target.value as NativeTextLayer["align"] })}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
                    </div>
                    <Checkbox className="mt-3" checked={line.bold} disabled={disabled} onChange={(event) => update({ bold: event.target.checked })}>文字 {index + 1} 加粗</Checkbox>
                </details>
            </fieldset>;
        })}
    </div>;
}
