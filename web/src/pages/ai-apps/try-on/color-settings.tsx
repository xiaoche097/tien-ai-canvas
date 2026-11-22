import { Button, ColorPicker, Input, Select, Switch } from "antd";
import { Check, ChevronRight, Pipette } from "lucide-react";
import { useEffect, useState } from "react";
import { AppDrawer } from "@/components/ui/product/app-drawer";
import { colorPalette, defaultColorEdit, filterPalette, validColorHex, type ColorEditOptions } from "./color-palette";

export function ColorSettings({ value, onChange }: { value: ColorEditOptions; onChange: (value: ColorEditOptions) => void }) {
    const [open, setOpen] = useState(false);
    const [category, setCategory] = useState("");
    const [query, setQuery] = useState("");
    const selected = colorPalette.flatMap((group) => group.colors).find((color) => color.hex === value.hex);
    const groups = filterPalette(category, query);
    return <div className="try-on-color-settings">
        <div className="try-on-segment" role="group" aria-label="颜色来源"><button type="button" aria-pressed={value.mode === "palette"} onClick={() => onChange({ ...value, mode: "palette", hex: validColorHex(value.hex) ? value.hex : defaultColorEdit.hex })}>替换颜色</button><button type="button" aria-pressed={value.mode === "reference"} onClick={() => onChange({ ...value, mode: "reference", hex: value.mode === "reference" ? value.hex : "" })}>参考图颜色</button></div>
        <label className="try-on-field"><span>换色对象</span><Input value={value.target} maxLength={120} placeholder="例如：上衣底布，保留白色标志" onChange={(event) => onChange({ ...value, target: event.target.value })} /></label>
        {value.mode === "palette" ? <button className="try-on-color-current" type="button" onClick={() => setOpen(true)}><span className="try-on-color-dot" style={{ backgroundColor: validColorHex(value.hex) ? value.hex : "transparent" }} /><span><strong>{selected?.name || "自定义颜色"}</strong><small>{value.hex}</small></span><ChevronRight size={16} aria-hidden /></button> : <p className="try-on-note">上传一张配色图，可点击具体部位取色；未取色时由模型参考图中主要商品颜色。参考图只提供配色。</p>}
        <div className="try-on-switch"><label htmlFor="try-on-color-fidelity">真彩还原 · 色彩保真增强</label><Switch id="try-on-color-fidelity" checked={value.fidelity} onChange={(fidelity) => onChange({ ...value, fidelity })} /></div>
        <p className="try-on-note">加强目标颜色与面料明暗约束；当前为生成模型约束，不代表实物校色或零色差。</p>
        <AppDrawer title="替换颜色" open={open} onClose={() => setOpen(false)} width={480}>
            <div className="try-on-palette-filters"><Select aria-label="颜色分类" value={category} onChange={setCategory} options={[{ value: "", label: "全部颜色" }, ...colorPalette.map((group) => ({ value: group.name, label: group.name }))]} /><Input aria-label="搜索颜色" allowClear placeholder="搜索颜色名或 HEX" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
            <div className="try-on-palette-custom"><strong>自定义</strong><div><ColorPicker disabledAlpha value={validColorHex(value.hex) ? value.hex : defaultColorEdit.hex} onChange={(color) => onChange({ ...value, hex: color.toHexString().toUpperCase() })} /><Input aria-label="自定义 HEX 色值" value={value.hex} maxLength={7} status={validColorHex(value.hex) ? undefined : "error"} onChange={(event) => onChange({ ...value, hex: event.target.value.toUpperCase() })} /><Button disabled={!validColorHex(value.hex)} onClick={() => setOpen(false)}>使用此色</Button></div></div>
            {!groups.length ? <p role="status">没有匹配颜色，试试其他关键词或自定义色值。</p> : groups.map((group) => <section className="try-on-palette-group" key={group.name}><h3>{group.name}</h3><div>{group.colors.map((color) => <button type="button" key={`${color.name}-${color.hex}`} aria-pressed={value.hex === color.hex} aria-label={`${color.name} ${color.hex}`} title={`${color.name} ${color.hex}`} onClick={() => { onChange({ ...value, hex: color.hex }); setOpen(false); }}><span className="try-on-color-dot" style={{ backgroundColor: color.hex }}>{value.hex === color.hex ? <Check size={16} aria-hidden /> : null}</span><span>{color.name}</span></button>)}</div></section>)}
            <p className="try-on-note">色板为屏幕参考色，非实物标准色卡；准确品牌色请填写确认过的 HEX 色值。</p>
        </AppDrawer>
    </div>;
}

export function ColorReferenceSampler({ src, hex, onSample }: { src: string; hex: string; onSample: (hex: string) => void }) {
    const [error, setError] = useState("");
    useEffect(() => setError(""), [src]);
    const sample = (image: HTMLImageElement, x: number, y: number) => {
        try {
            if (!image.naturalWidth) throw new Error();
            const canvas = document.createElement("canvas");
            canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (!ctx) throw new Error();
            ctx.drawImage(image, 0, 0);
            const px = Math.max(0, Math.min(canvas.width - 1, Math.floor(x * canvas.width)));
            const py = Math.max(0, Math.min(canvas.height - 1, Math.floor(y * canvas.height)));
            const [r, g, b, alpha] = ctx.getImageData(px, py, 1, 1).data;
            if (alpha < 255) { setError("请选择不透明的商品区域，避开透明背景。"); return; }
            onSample(`#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}`);
            setError("");
        } catch { setError("当前图片无法读取像素，请重新上传图片，或使用替换颜色填写 HEX。"); }
    };
    return <div className="try-on-color-sampler"><p><Pipette size={14} aria-hidden />点击商品中间色调取色，避开高光和阴影</p><button type="button" aria-label="从参考图取色，键盘激活取图像中心色" onClick={(event) => { const image = event.currentTarget.querySelector("img")!; const rect = image.getBoundingClientRect(); sample(image, event.detail === 0 ? .5 : (event.clientX - rect.left) / rect.width, event.detail === 0 ? .5 : (event.clientY - rect.top) / rect.height); }}><img key={src} src={src} alt="配色参考，可点击取色" /></button><div aria-live="polite">{hex ? <><span className="try-on-color-dot" style={{ backgroundColor: hex }} />已取色 {hex}<Button size="small" onClick={() => onSample("")}>清除取色</Button></> : "未指定取色点：参考整张图的主商品颜色"}</div>{error ? <p className="try-on-upload-error" role="alert">{error}</p> : null}</div>;
}
