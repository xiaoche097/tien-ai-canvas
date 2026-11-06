import { useEffect, useRef, useState } from "react";
import { App, Button, Checkbox, Input, Select, Spin } from "antd";
import { Armchair, ArrowLeft, ArrowUpRight, CalendarDays, Camera, Car, Compass, Cpu, Download, Globe2, History, ImagePlus, Package, Palette, Settings2, Sparkles, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { AssetLibraryPickerModal, type AssetLibraryPickerItem } from "@/components/assets/asset-library-picker-modal";
import { ModelPicker } from "@/components/model-picker";
import { ImageParameterFields } from "@/components/image-parameter-fields";
import { AppModal } from "@/components/ui/product/app-modal";
import { modelCapabilityConfigFor } from "@/lib/model-capabilities";
import { defaultImageParamsForModel } from "@/lib/model-selection";
import { modelOptionLabel, selectableModelsByCapability, useConfigStore, type AiConfig } from "@/stores/use-config-store";
import { runBackendGenerationTask } from "@/services/api/generation-task";
import { cancelGenerationTask, listGenerationTasks, queryGenerationTask, type GenerationTask } from "@/services/api/task-center";
import { resourceIdFromStorageKey } from "@/services/api/resources";
import { downloadBrowserMedia } from "@/services/browser-download";
import type { ReferenceImage } from "@/types/image";
import type { AutoPartsIntent, AutoPartsVehicle } from "@/services/api/auto-parts";
import { AutoPartsImageUpload, autoPartsImageUrl } from "./image-upload";
import { autoPartsConfiguration, autoPartsInputError, autoPartsSeatingOptions, autoPartsVehicleSelection, productLabels, sceneLabels } from "./workflow";

type ResultImage = { dataUrl?: string; storageKey?: string; width?: number; height?: number };
const statuses: Record<string, string> = { queued: "任务排队中", running: "正在生成效果图", succeeded: "已完成", failed: "生成失败", cancelled: "已取消" };
const optionLabel = (Icon: LucideIcon, label: string) => <span className="auto-parts-select-option"><Icon size={14} /><span>{label}</span></span>;
const selectProps = { virtual: false, className: "auto-parts-field-select", classNames: { popup: { root: "auto-parts-select-popup" } } };

export function AutoPartsWorkbench({ vehicle, onBack }: { vehicle: AutoPartsVehicle; onBack: () => void }) {
    const { message } = App.useApp();
    const config = useConfigStore((state) => state.config);
    const [model, setModel] = useState(config.imageModel), [settings, setSettings] = useState<Partial<AiConfig>>({ size: "3:2", imageResolution: "auto" });
    const models = selectableModelsByCapability(config, "image"), selectedModel = models.includes(model) ? model : "";
    const runtime: AiConfig = { ...config, ...settings, taskWorkflowProvider: "model", model: selectedModel, imageModel: selectedModel, count: "1", transparentBackground: "false" };
    const profile = modelCapabilityConfigFor(runtime, selectedModel).image;
    const [form, setForm] = useState<Omit<AutoPartsIntent, "productCount">>({ vehicleId: vehicle.id, ...autoPartsVehicleSelection(vehicle, vehicle.markets[0]), productType: "seat-cover", brand: "neutral", scene: "installation", description: "", confirmed: false });
    const vehicleConfiguration = autoPartsConfiguration(vehicle, form.market, form.year);
    const seatingOptions = autoPartsSeatingOptions(vehicleConfiguration, form.configuration);
    const cabins = [...new Set(seatingOptions.map((layout) => layout.cabin))];
    const selectedSeating = seatingOptions.find((layout) => layout.cabin === form.cabin && layout.id === form.seatingId);
    const marketOptions = vehicle.markets.map((market) => ({ value: market, label: optionLabel(Globe2, vehicle.configurations.find((item) => item.market === market)?.marketLabel || market) }));
    const yearOptions = vehicle.configurations.filter((item) => item.market === form.market).map((item) => ({ value: item.year, label: optionLabel(CalendarDays, item.yearLabel) }));
    const [products, setProducts] = useState<ReferenceImage[]>([]), [interior, setInterior] = useState<ReferenceImage[]>([]), [reading, setReading] = useState(false);
    const [busy, setBusy] = useState(false), [cancelling, setCancelling] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState(""), [taskID, setTaskID] = useState("");
    const [outputs, setOutputs] = useState<ResultImage[]>([]), [preview, setPreview] = useState<ResultImage | null>(null), [picker, setPicker] = useState<"products" | "interior" | null>(null);
    const [history, setHistory] = useState<GenerationTask[]>([]), [historyLoading, setHistoryLoading] = useState(false), [historyError, setHistoryError] = useState("");
    const controller = useRef<AbortController | null>(null);
    const referenceCount = products.length + interior.length;
    const disabled = busy || reading || cancelling;
    const update = <K extends keyof typeof form>(key: K, value: typeof form[K]) => { setForm((current) => ({ ...current, [key]: value, ...(key === "confirmed" ? {} : { confirmed: false }) })); setError(""); };
    useEffect(() => () => controller.current?.abort(), []);
    const loadHistory = async () => {
        setHistoryLoading(true); setHistoryError("");
        try {
            const tasks = await listGenerationTasks(200);
            setHistory(tasks.filter((task) => { try { const metadata = JSON.parse(task.inputJson || "{}").metadata; return metadata?.aiApplicationId === "auto-parts-center" && metadata.autoParts?.vehicleId === vehicle.id; } catch { return false; } }).slice(0, 6));
        } catch (error) { setHistoryError(error instanceof Error ? error.message : "历史记录加载失败"); }
        finally { setHistoryLoading(false); }
    };
    const showHistory = async (task: GenerationTask) => {
        if (disabled) return;
        setHistoryLoading(true); setHistoryError("");
        try { const detail = await queryGenerationTask(task.id); const images = JSON.parse(detail.resultJson || "{}").images; if (!Array.isArray(images) || !images.length) throw new Error("这条任务暂时没有可查看的结果，请到任务中心查看状态"); setOutputs(images); setStatus("正在查看历史结果，当前输入未改变"); }
        catch (error) { setHistoryError(error instanceof Error ? error.message : "结果读取失败"); }
        finally { setHistoryLoading(false); }
    };
    const generate = async () => {
        if (controller.current || disabled || historyLoading) return;
        const intent = { ...form, productCount: products.length };
        const inputError = autoPartsInputError(intent, interior.length, vehicle);
        if (inputError) { setError(inputError); return; }
        if (!selectedModel || !profile) { setError("请选择可用的图片模型"); return; }
        if (referenceCount > profile.references.maxImages) { setError(`当前模型最多支持 ${profile.references.maxImages} 张参考图，本次需要 ${referenceCount} 张`); return; }
        if (profile.references.maxImageBytes && [...products, ...interior].some((image) => (image.bytes || 0) > profile.references.maxImageBytes)) { setError("有图片超过当前模型的文件大小限制"); return; }
        const abort = new AbortController(); controller.current = abort; setBusy(true); setError(""); setTaskID(""); setStatus("正在准备产品与实车参考");
        try {
            const result = await runBackendGenerationTask({ mode: "image", config: runtime, signal: abort.signal, prompt: "使用服务端当前启用的汽配实车效果图能力。", referenceImages: [...products, ...interior], metadata: { source: "ai-apps", aiApplicationId: "auto-parts-center", aiApplicationName: "汽配AI中心", autoParts: intent, promptTemplateOperation: "auto_parts_scene" }, onTaskUpdate: (task) => { setTaskID(task.id); setStatus(statuses[task.status] || task.status); } });
            if (!result.images?.length) throw new Error("任务未返回图片，请到任务中心检查结果");
            setOutputs(result.images); setStatus("效果图已生成，请核对商品与内饰细节");
        } catch (error) { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : "生成失败"); }
        finally { controller.current = null; setBusy(false); }
    };
    const cancel = async () => {
        if (cancelling) return;
        setCancelling(true);
        controller.current?.abort();
        try { if (taskID) { await cancelGenerationTask(taskID); setStatus("已请求取消任务，最终状态可在任务中心查看"); } else setStatus("已停止等待，若任务已提交请到任务中心确认状态"); }
        catch (error) { setError(error instanceof Error ? error.message : "取消尚未确认，请查看任务中心"); }
        finally { setCancelling(false); }
    };
    const importAssets = (ids: string[], picked: AssetLibraryPickerItem[] = []) => {
        if (!picker || disabled) return;
        const next = picked.filter((item) => ids.includes(item.id)).map((item): ReferenceImage => ({ id: item.id, name: item.title, type: "image/png", dataUrl: item.imageUrl || "", storageKey: item.imageStorageKey, width: item.asset?.kind === "image" ? item.asset.data.width : undefined, height: item.asset?.kind === "image" ? item.asset.data.height : undefined, bytes: item.asset?.kind === "image" ? item.asset.data.bytes : undefined }));
        if (!next.length || next.some((image) => !image.dataUrl && !resourceIdFromStorageKey(image.storageKey))) { void message.error("请选择可读取的图片素材"); return; }
        if (picker === "interior") { if (next.length !== 1) { void message.error("请选择 1 张真实内饰图"); return; } setInterior(next); }
        else { const images = [...products, ...next.filter((image) => !products.some((item) => item.id === image.id))]; if (images.length > 4) { void message.error("同款产品参考最多 4 张"); return; } setProducts(images); }
        setForm((current) => ({ ...current, confirmed: false })); setPicker(null); setError("");
    };
    const download = (image: ResultImage) => { void downloadBrowserMedia({ fileName: `${vehicle.make}-${vehicle.model}-效果图.png`, storageKey: image.storageKey, url: image.dataUrl }).catch((error) => message.error(error instanceof Error ? error.message : "下载失败")); };
    return <div className="auto-parts-workbench">
        <header className="auto-parts-workbench-header"><button type="button" className="auto-parts-back" disabled={disabled} onClick={onBack}><ArrowLeft size={16} />车型目录</button><div><h1>{vehicle.make} {vehicle.model}</h1><p>汽配AI中心 · 实车效果图工作台</p></div><a href={vehicleConfiguration?.sourceUrl || vehicle.sourceUrl} target="_blank" rel="noreferrer">当前配置资料<ArrowUpRight size={14} /></a></header>
        <aside className="auto-parts-controls"><div className="auto-parts-controls-scroll"><fieldset disabled={disabled} inert={disabled}>
<div className="auto-parts-form-section"><h2><Car size={17} />目标车辆</h2><div className="auto-parts-vehicle-fields"><label><span className="auto-parts-field-label"><Globe2 size={15} />销售市场</span><Select {...selectProps} aria-label="销售市场" value={form.market} options={marketOptions} onChange={(market) => { setForm((current) => ({ ...current, ...autoPartsVehicleSelection(vehicle, market), confirmed: false })); setError(""); }} /></label><label><span className="auto-parts-field-label"><CalendarDays size={15} />车型年款</span><Select {...selectProps} aria-label="车型年款" value={form.year || undefined} options={yearOptions} placeholder="选择年款" onChange={(year) => { setForm((current) => ({ ...current, ...autoPartsVehicleSelection(vehicle, current.market, year), confirmed: false })); setError(""); }} /></label></div><label><span className="auto-parts-field-label"><Settings2 size={15} />车型型号／配置</span><Select {...selectProps} aria-label="车型型号配置" value={form.configuration || undefined} showSearch optionFilterProp="value" placeholder="选择此年款的已有型号" options={(vehicleConfiguration?.trims || []).map((value) => ({ value, label: optionLabel(Car, value) }))} onChange={(value) => { const options = autoPartsSeatingOptions(vehicleConfiguration, value); const availableCabins = [...new Set(options.map((layout) => layout.cabin))]; setForm((current) => ({ ...current, configuration: value, cabin: availableCabins.length === 1 ? availableCabins[0] : "", seatingId: "", confirmed: false })); setError(""); }} /></label><label><span className="auto-parts-field-label"><Compass size={15} />驾驶位</span><Select {...selectProps} aria-label="驾驶位" value={form.driveSide} options={vehicleConfiguration ? [{ value: vehicleConfiguration.driveSide, label: optionLabel(Compass, vehicleConfiguration.driveSide === "left" ? "左舵 · 当前市场规格" : "右舵 · 当前市场规格") }] : []} onChange={(value) => update("driveSide", value)} /></label><label><span className="auto-parts-field-label"><Car size={15} />驾驶室／车身</span><Select {...selectProps} aria-label="驾驶室车身" disabled={!form.configuration} value={form.cabin || undefined} placeholder="选择实车驾驶室" options={cabins.map((value) => ({ value, label: optionLabel(Car, value) }))} onChange={(cabin) => { setForm((current) => ({ ...current, cabin, seatingId: "", confirmed: false })); setError(""); }} /></label>
            <label><span className="auto-parts-field-label"><Armchair size={15} />座椅结构／选装</span><Select {...selectProps} aria-label="座椅结构" disabled={!form.cabin} value={form.seatingId || undefined} placeholder="对照实车选择座椅" options={seatingOptions.filter((layout) => layout.cabin === form.cabin).map((layout) => ({ value: layout.id, label: optionLabel(Armchair, layout.label) }))} onChange={(value) => update("seatingId", value)} /></label>
            {selectedSeating ? <div className="auto-parts-seat-details"><h3><Armchair size={16} />{selectedSeating.label}</h3><dl><dt>前排</dt><dd>{selectedSeating.front}</dd><dt>后排</dt><dd>{selectedSeating.rear}</dd><dt>中控</dt><dd>{selectedSeating.console}</dd></dl><p>{selectedSeating.note}</p><a href={selectedSeating.sourceUrl} target="_blank" rel="noreferrer">座椅参考资料<ArrowUpRight size={12} /></a></div> : null}
            <div className="auto-parts-vehicle-summary"><Car size={16} /><div><strong>{form.configuration || "请选择车型型号"}</strong><span>{vehicleConfiguration?.yearLabel}</span><span>{vehicleConfiguration?.generation}</span></div></div><p className="auto-parts-hint">{vehicleConfiguration?.catalogNote}</p></div>
            <div className="auto-parts-form-section"><h2><ImagePlus size={17} />参考图片</h2><label><span className="auto-parts-field-label"><Package size={15} />产品品类</span><Select {...selectProps} value={form.productType} options={Object.entries(productLabels).map(([value, label]) => ({ value, label: optionLabel(Package, label) }))} onChange={(value) => update("productType", value)} /></label></div>
        </fieldset>
        <AutoPartsImageUpload label="同款产品图" hint="1～4 张同一款产品的互补角度；保留材质、缝线、包边与可见标志。" images={products} limit={4} disabled={disabled} onReading={setReading} onChange={(images) => { setProducts(images); update("confirmed", false); }} onImport={() => setPicker("products")} />
        <AutoPartsImageUpload label="目标实车内饰" hint="必填 1 张对应车辆的真实内饰图，清晰展示安装位置。默认保持原内饰颜色和布局。JPG / PNG / WEBP，300～4096px，每张最多 20MB。" images={interior} limit={1} disabled={disabled} onReading={setReading} onChange={(images) => { setInterior(images); update("confirmed", false); }} onImport={() => setPicker("interior")} />
        <fieldset disabled={disabled} inert={disabled}><div className="auto-parts-form-section"><h2><Camera size={17} />摄影与输出</h2><div className="auto-parts-field-grid"><label><span className="auto-parts-field-label"><Palette size={15} />品牌风格</span><Select {...selectProps} value={form.brand} options={[{ value: "neutral", label: optionLabel(Palette, "中性专业") }, ...["RIDEPOSH", "FNINEPRO", "FREESOO"].map((value) => ({ value, label: optionLabel(Palette, value) }))]} onChange={(value) => update("brand", value)} /></label><label><span className="auto-parts-field-label"><Camera size={15} />拍摄场景</span><Select {...selectProps} value={form.scene} options={Object.entries(sceneLabels).map(([value, label]) => ({ value, label: optionLabel(Camera, label) }))} onChange={(value) => update("scene", value)} /></label></div><label>补充要求 <span className="auto-parts-hint">可选</span><Input.TextArea value={form.description} rows={3} maxLength={2000} placeholder="例如：保留原车米色内饰，只替换前排座椅套，呈现自然贴合与真实缝线。" onChange={(event) => update("description", event.target.value)} /></label><p className="auto-parts-hint">品牌仅调整摄影气质，不改产品颜色，不添加性能、质保或认证声明。</p></div>
            <div className="auto-parts-form-section"><label><span className="auto-parts-field-label"><Cpu size={15} />执行模型</span><ModelPicker config={runtime} capability="image" value={selectedModel} fullWidth showConfiguredModelName showOptionPrices showSelectedPrice={false} placeholder="选择图片模型" requirements={{ capability: "image", input: { textCount: 1, imageCount: referenceCount || 2, referenceImageCount: referenceCount || 2, videoCount: 0, audioCount: 0, characterCount: 0 } }} onChange={(value) => { setModel(value); setSettings(defaultImageParamsForModel(runtime, value)); }} /></label><p className="auto-parts-hint">{selectedModel ? modelOptionLabel(config, selectedModel) : "请选择支持图片参考的已配置模型。"} · 本次需 {referenceCount} 张参考图</p>{profile ? <ImageParameterFields profile={profile} config={runtime} showCount={false} showTransparent={false} onChange={(key, value) => setSettings((current) => ({ ...current, [key]: value }))} /> : null}</div>
<Checkbox checked={form.confirmed} onChange={(event) => update("confirmed", event.target.checked)}>我已核对年款、配置、驾驶室、前后排座椅及中控与实车参考一致；本次生成仅用于视觉展示。</Checkbox>
        </fieldset></div><footer className="auto-parts-submit">{error ? <p className="auto-parts-error" role="alert">{error}</p> : null}<div><span>生成 1 张效果图</span><small>按所选模型计费</small></div><Button type="primary" size="large" block disabled={disabled || historyLoading || !selectedModel || !form.configuration || !selectedSeating || !form.confirmed} loading={busy} icon={<Sparkles size={16} />} onClick={() => void generate()}>生成效果图</Button>{busy || cancelling ? <Button block loading={cancelling} disabled={cancelling} onClick={() => void cancel()}>取消当前任务</Button> : null}<Link to="/tasks">前往任务中心<ArrowUpRight size={12} /></Link></footer></aside>
        <section className="auto-parts-results"><header><h2>生成结果</h2><span>商品与实车共同参考</span></header><div className="auto-parts-result-scroll">{busy ? <div className="auto-parts-generation-status" role="status"><Spin /><span>{status}</span></div> : null}{status && !busy ? <p className="auto-parts-hint" role="status">{status}</p> : null}{outputs.length ? <div className="auto-parts-output-grid">{outputs.map((image, index) => <article key={`${image.storageKey}-${index}`}><button type="button" onClick={() => setPreview(image)} aria-label={`放大查看效果图 ${index + 1}`}><img src={autoPartsImageUrl(image)} alt={`${vehicle.make} ${vehicle.model} 汽配效果图`} /></button><footer><span>效果图 · 请人工核对</span><Button size="small" type="text" icon={<Download size={14} />} onClick={() => download(image)}>下载原图</Button></footer></article>)}</div> : !busy ? <div className="auto-parts-result-empty"><ImagePlus size={35} /><h3>让产品进入真实车内</h3><p>上传产品与实车内饰，生成保持原车布局的效果图。</p><div><span>产品保真</span><span>内饰不改色</span><span>单张真实构图</span></div></div> : null}<p className="auto-parts-result-note">效果图不等于真实安装、尺寸适配或安全认证。商品细节、车辆结构与使用条件需另行核对。</p><section className="auto-parts-history"><header><h3><History size={15} />本车型生成记录</h3><Button size="small" loading={historyLoading} disabled={disabled} onClick={() => void loadHistory()}>读取记录</Button></header>{historyError ? <p className="auto-parts-error" role="alert">{historyError}</p> : null}{history.map((task) => <button key={task.id} type="button" disabled={disabled || historyLoading} onClick={() => void showHistory(task)}><span>{statuses[task.status] || task.status}</span><time>{new Date(task.createdAt).toLocaleString()}</time></button>)}{!history.length && !historyLoading ? <p className="auto-parts-hint">从最近 200 条任务中读取此车型的结果；完整记录见任务中心。</p> : null}</section></div></section>
        <AssetLibraryPickerModal open={Boolean(picker)} title={picker === "interior" ? "选择真实内饰图" : "选择同款产品参考"} remoteLibrary remoteKind="image" mediaKinds={["image"]} acceptRemoteItems items={[]} categoryLabels={{}} multiple={picker === "products"} onClose={() => setPicker(null)} onConfirm={importAssets} />
        <AppModal title="效果图预览" open={Boolean(preview)} onCancel={() => setPreview(null)} footer={preview ? <Button icon={<Download size={14} />} onClick={() => download(preview)}>下载原图</Button> : null} width={1000}>{preview ? <img className="auto-parts-full-preview" src={autoPartsImageUrl(preview)} alt="汽配效果图预览" /> : null}</AppModal>
    </div>;
}
