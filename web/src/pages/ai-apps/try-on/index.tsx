import { App, Button, Input, Select, Spin, Switch } from "antd";
import { ArrowLeft, ArrowRight, Check, Download, FolderOpen, Footprints, Glasses, History, ImagePlus, Layers, LayoutGrid, List, Palette, PersonStanding, Plus, RotateCcw, ScanFace, Shirt, Sparkles, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { AssetLibraryPickerModal, type AssetLibraryPickerItem } from "@/components/assets/asset-library-picker-modal";
import { ImageParameterFields } from "@/components/image-parameter-fields";
import { ModelPicker } from "@/components/model-picker";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { AppModal } from "@/components/ui/product/app-modal";
import { AppDrawer } from "@/components/ui/product/app-drawer";
import { modelCapabilityConfigFor } from "@/lib/model-capabilities";
import { defaultImageParamsForModel } from "@/lib/model-selection";
import { modelChannelLabel } from "@/lib/model-picker-groups";
import { prepareBackendGenerationTask, runBackendGenerationTask } from "@/services/api/generation-task";
import { cancelGenerationTask, listGenerationTasks, queryGenerationTask, type GenerationTask } from "@/services/api/task-center";
import { resourceFileUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import { downloadBrowserMedia } from "@/services/browser-download";
import { modelOptionLabel, selectableModelsByCapability, useConfigStore, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import { accessoryTypes, descriptionPresetsFor, flatModeProducts, replaceGarmentSlot, replaceShoeView, tryOnGuides, tryOnInputError, tryOnIntent, tryOnReferences, tryOnTools, type AccessoryType, type FlatMode, type GarmentSlot, type ShoeView, type TryOnProduct } from "./workflow";
import { ShoeUpload } from "./shoe-upload";
import { FlatUpload } from "./flat-upload";
import { GenerationModeSelect } from "./generation-mode-select";
import { AccessoryUpload } from "./accessory-upload";
import { ModelImageUpload } from "./model-image-upload";
import { PoseModeSelect } from "./pose-mode-select";
import { useToolDraftState } from "./use-tool-draft-state";
import { ColorSettings, ColorReferenceSampler } from "./color-settings";
import { defaultColorEdit, type ColorEditOptions } from "./color-palette";
import { poseModes, type PoseMode } from "./workflow";
import { TryOnResultViewer, type TryOnResultContext, type TryOnResultImage } from "./result-viewer";
import "./try-on.css";

type Output = TryOnResultImage;
type UploadTarget = "product" | "model" | `shoe-${ShoeView}` | `flat-${GarmentSlot}`;
const urlFor = (image: { dataUrl?: string; storageKey?: string }) => image.dataUrl || (resourceIdFromStorageKey(image.storageKey) ? resourceFileUrl(resourceIdFromStorageKey(image.storageKey)!) : "");
const taskLabels: Record<string, string> = { queued: "排队中", running: "生成中", succeeded: "已完成", failed: "失败", cancelled: "已取消" };
const toolIcons = [Shirt, Layers, Footprints, Glasses, UserRound, PersonStanding, ScanFace, Palette];
const isTryOnTask = (task: GenerationTask) => {
    try { return JSON.parse(task.inputJson || "{}").metadata?.aiApplicationId === "universal-try-on"; } catch { return false; }
};

async function readImage(file: File): Promise<ReferenceImage> {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("请选择 PNG、JPG 或 WEBP 图片");
    if (file.size > 20 * 1024 * 1024) throw new Error("单张图片不能超过 20MB");
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("图片读取失败")); reader.readAsDataURL(file);
    });
    const image = new Image(); image.src = dataUrl;
    try { await image.decode(); } catch { throw new Error("无法解码图片，文件可能已损坏，请重新保存为 PNG、JPG 或 WEBP"); }
    if (Math.min(image.width, image.height) < 300 || Math.max(image.width, image.height) > 4096) throw new Error(`当前尺寸 ${image.width} × ${image.height}px，图片每条边需在 300～4096px 之间`);
    return { id: crypto.randomUUID(), name: file.name, type: file.type, dataUrl, width: image.width, height: image.height, bytes: file.size };
}

export default function TryOnPage() {
    const { message } = App.useApp();
    const config = useConfigStore((state) => state.config);
    const [toolId, setToolId] = useState<string>("outfit");
    const models = selectableModelsByCapability(config, "image");
    const [model, setModel] = useToolDraftState(toolId, config.imageModel);
    const selectedModel = models.includes(model) ? model : "";
    const [settings, setSettings] = useToolDraftState<Partial<AiConfig>>(toolId, { size: "3:4", imageResolution: "auto", count: "1" });
    const runtime: AiConfig = { ...config, ...settings, model: selectedModel, imageModel: selectedModel, count: "1", transparentBackground: "false" };
    const profile = modelCapabilityConfigFor(runtime, selectedModel).image;
    const tool = tryOnTools.find((item) => item.id === toolId)!;
    const isIdentityTool = tool.id === "model" || tool.id === "face";
    const [accessoryType, setAccessoryType] = useToolDraftState<AccessoryType>(toolId, "bag");
    const accessory = accessoryTypes.find((item) => item.id === accessoryType)!;
    const guide = tool.id === "accessory" ? { ...tryOnGuides.accessory, productLabel: `${accessory.label}商品图`, productHint: accessory.hint, placeholder: accessory.placeholder, smartHint: accessory.modelHint } : tryOnGuides[tool.id];
    const [accessoryProducts, setAccessoryProducts] = useToolDraftState<Partial<Record<AccessoryType, TryOnProduct>>>(toolId, {});
    const [generalProducts, setProducts] = useToolDraftState<TryOnProduct[]>(toolId, []);
    const [modelProducts, setModelProducts] = useToolDraftState<TryOnProduct[]>(toolId, []);
    const [faceProducts, setFaceProducts] = useToolDraftState<TryOnProduct[]>(toolId, []);
    const identityProducts = tool.id === "face" ? faceProducts : modelProducts;
    const setIdentityProducts = tool.id === "face" ? setFaceProducts : setModelProducts;
    const [shoeProducts, setShoeProducts] = useToolDraftState<TryOnProduct[]>(toolId, []);
    const [shoeMode, setShoeMode] = useToolDraftState<"single" | "multi">(toolId, "single");
    const [shoeReading, setShoeReading] = useState<ShoeView | null>(null);
    const shoeImportView = useRef<ShoeView>("pair");
    const [flatProducts, setFlatProducts] = useToolDraftState<TryOnProduct[]>(toolId, []);
    const [flatMode, setFlatMode] = useToolDraftState<FlatMode>(toolId, "separates");
    const [flatReading, setFlatReading] = useState<GarmentSlot | null>(null);
    const flatImportSlot = useRef<GarmentSlot>("upper");
    const products = isIdentityTool ? identityProducts : tool.id === "accessory" ? accessoryProducts[accessoryType] ? [accessoryProducts[accessoryType]!] : [] : tool.id === "flat" ? flatModeProducts(flatProducts, flatMode) : tool.id === "shoes" ? shoeMode === "single" ? shoeProducts.filter((image) => image.shoeView === "pair") : shoeProducts : generalProducts;
    const [generalReferences, setGeneralReferences] = useToolDraftState<ReferenceImage[]>(toolId, []);
    const [colorReferences, setColorReferences] = useToolDraftState<ReferenceImage[]>(toolId, []);
    const [modelReferences, setModelReferences] = useToolDraftState<ReferenceImage[]>(toolId, []);
    const [faceReferences, setFaceReferences] = useToolDraftState<ReferenceImage[]>(toolId, []);
    const identityReferences = tool.id === "face" ? faceReferences : modelReferences;
    const setIdentityReferences = tool.id === "face" ? setFaceReferences : setModelReferences;
    const references = isIdentityTool ? identityReferences : tool.id === "color" ? colorReferences : generalReferences;
    const setReferences = isIdentityTool ? setIdentityReferences : tool.id === "color" ? setColorReferences : setGeneralReferences;
    const [generalReferenceMode, setReferenceMode] = useToolDraftState(toolId, "smart");
    const [poseMode, setPoseMode] = useToolDraftState<PoseMode>(toolId, "smart");
    const [colorEdit, setColorEdit] = useToolDraftState<ColorEditOptions>(toolId, defaultColorEdit);
    const referenceMode = isIdentityTool ? "reference" : tool.id === "color" ? colorEdit.mode === "reference" ? "reference" : "smart" : tool.id === "pose" ? poseMode === "reference" ? "reference" : "smart" : generalReferenceMode;
    const [generalDescription, setGeneralDescription] = useToolDraftState(tool.id === "accessory" ? `accessory-${accessoryType}` : toolId, "");
    const [poseDescription, setPoseDescription] = useToolDraftState(toolId, "");
    const [colorDescription, setColorDescription] = useToolDraftState(toolId, "");
    const [modelDescription, setModelDescription] = useToolDraftState(toolId, "");
    const [faceDescription, setFaceDescription] = useToolDraftState(toolId, "");
    const description = tool.id === "face" ? faceDescription : tool.id === "model" ? modelDescription : tool.id === "color" ? colorDescription : tool.id === "pose" ? poseMode === "text" ? poseDescription : "" : generalDescription;
    const setDescription = tool.id === "face" ? setFaceDescription : tool.id === "model" ? setModelDescription : tool.id === "color" ? setColorDescription : tool.id === "pose" ? setPoseDescription : setGeneralDescription;
    const descriptionRequired = guide.targetRequired && referenceMode === "smart" && tool.id !== "color";
    const [consistent, setConsistent] = useToolDraftState(toolId, false);
    const [generationMode, setGenerationMode] = useToolDraftState(toolId, "professional");
    const [count, setCount] = useToolDraftState(toolId, 1);
    const [outputs, setOutputs] = useState<Output[]>([]);
    const [resultView, setResultView] = useState("grid");
    const [mobilePanel, setMobilePanel] = useState("controls");
    const [resultMeta, setResultMeta] = useState<{ label: string; time: string }>();
    const [activeBatchId, setActiveBatchId] = useState("");
    const [recentRefresh, setRecentRefresh] = useState(0);
    const [recentLoading, setRecentLoading] = useState(false);
    const [recentError, setRecentError] = useState("");
    const resultRevision = useRef(0);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [reading, setReading] = useState<"product" | "model" | null>(null);
    const [uploadErrors, setUploadErrors] = useState({ product: "", model: "" });
    const readingRef = useRef(false);
    const expandingRef = useRef(false);
    const hoveredUpload = useRef<UploadTarget | null>(null);
    const [picker, setPicker] = useState<"product" | "model" | null>(null);
    const [dialog, setDialog] = useState<"help" | "words" | null>(null);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [history, setHistory] = useState<GenerationTask[]>([]);
    const [historyError, setHistoryError] = useState("");
    const [historyLoading, setHistoryLoading] = useState(false);
    const [preview, setPreview] = useState<number | null>(null);
    const [expanding, setExpanding] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const controller = useRef<AbortController | null>(null);
    const taskId = useRef("");
    const productInput = useRef<HTMLInputElement>(null);
    const modelInput = useRef<HTMLInputElement>(null);
    const total = count * (referenceMode === "reference" ? Math.max(1, references.length) : 1);
    const referenceCount = Math.max(tool.id === "shoes" && shoeMode === "multi" ? 3 : 1, products.length) + (referenceMode === "reference" ? 1 : 0) + (consistent && count > 1 ? 1 : 0);
    const modelLabel = selectedModel ? [modelOptionLabel(config, selectedModel), modelChannelLabel(config, selectedModel)].filter((value, index, values) => value && values.indexOf(value) === index).join(" · ") : "";
    const resultGroups = new Map<string, { label: string; time?: string; items: { image: Output; index: number }[] }>();
    outputs.forEach((image, index) => {
        const key = image.context?.batchId || "restored";
        if (!resultGroups.has(key)) resultGroups.set(key, { label: image.context?.title || resultMeta?.label || "生成结果", time: image.context?.time || resultMeta?.time, items: [] });
        resultGroups.get(key)!.items.push({ image, index });
    });

    useEffect(() => () => controller.current?.abort(), []);
    useEffect(() => {
        const abort = new AbortController();
        const revision = resultRevision.current;
        setRecentLoading(true); setRecentError("");
        void (async () => {
            try {
                const tasks = (await listGenerationTasks(200, undefined, undefined, abort.signal)).filter(isTryOnTask);
                const latest = tasks.find((task) => task.status === "succeeded");
                if (!latest) return;
                const input = JSON.parse(latest.inputJson || "{}");
                const batchId = input.metadata?.batchId;
                const batch = tasks.filter((task) => task.status === "succeeded" && (batchId ? JSON.parse(task.inputJson || "{}").metadata?.batchId === batchId : task.id === latest.id)).sort((a, b) => (JSON.parse(a.inputJson || "{}").metadata?.batchIndex || 0) - (JSON.parse(b.inputJson || "{}").metadata?.batchIndex || 0));
                const details = await Promise.all(batch.map((task) => queryGenerationTask(task.id, { signal: abort.signal })));
                const images = details.flatMap((task) => (JSON.parse(task.resultJson || "{}").images || []).map((image: Output) => ({ ...image, context: JSON.parse(task.inputJson || "{}").metadata?.tryOnSnapshot })));
                if (!abort.signal.aborted && revision === resultRevision.current && images.length) {
                    setOutputs(images);
                    setActiveBatchId(images[0].context?.batchId || "restored");
                    setResultMeta({ label: latest.model || "历史生成", time: latest.createdAt });
                    setStatus(`已恢复最近一组 ${images.length} 张结果`);
                }
            } catch (reason) {
                if (!abort.signal.aborted && revision === resultRevision.current) setRecentError(reason instanceof Error ? reason.message : "历史结果读取失败");
            } finally { if (!abort.signal.aborted) setRecentLoading(false); }
        })();
        return () => abort.abort();
    }, [recentRefresh]);
    const loadHistory = async () => {
        setHistoryLoading(true); setHistoryError("");
        try {
            const tasks = await listGenerationTasks(200);
            setHistory(tasks.filter((task) => {
                return isTryOnTask(task) && Date.parse(task.createdAt) >= Date.now() - 30 * 86400000;
            }));
        } catch (reason) { setHistoryError(reason instanceof Error ? reason.message : "任务记录加载失败"); }
        finally { setHistoryLoading(false); }
    };
    useEffect(() => {
        if (!historyOpen) return;
        void loadHistory(); const timer = window.setInterval(() => void loadHistory(), 5000);
        return () => window.clearInterval(timer);
    }, [historyOpen]);

    const addFiles = async (files: File[], target: "product" | "model", view: ShoeView | GarmentSlot = "pair") => {
        if (busy || readingRef.current || !files.length) return;
        readingRef.current = true;
        setReading(target);
        if (target === "product" && tool.id === "shoes") setShoeReading(view as ShoeView);
        if (target === "product" && tool.id === "flat") setFlatReading(view as GarmentSlot);
        const revision = resultRevision.current;
        setError("");
        setUploadErrors((current) => ({ ...current, [target]: "" }));
        const limit = target === "product" ? guide.maxProducts : tool.id === "color" || isIdentityTool ? 1 : 4;
        try {
            const current = target === "product" ? products : references;
            const singleSlot = isIdentityTool || target === "model" && tool.id === "color" || target === "product" && (guide.maxProducts === 1 || tool.id === "shoes" || tool.id === "flat");
            if (singleSlot ? files.length !== 1 : files.length + current.length > limit) throw new Error(singleSlot ? "每个上传位置仅支持 1 张图片" : `最多选择 ${limit} 张${target === "product" ? "商品" : "模特"}图`);
            const results = await Promise.allSettled(files.map(readImage));
            if (revision !== resultRevision.current) return;
            const next = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
            const failures = results.flatMap((result, index) => result.status === "rejected" ? [`${files[index].name}：${result.reason instanceof Error ? result.reason.message : "图片读取失败"}`] : []);
            if (target === "product") {
                if (isIdentityTool) { if (next.length) setIdentityProducts(next); }
                else if (tool.id === "shoes") { if (next.length) setShoeProducts((items) => replaceShoeView(items, next[0], view as ShoeView)); }
                else if (tool.id === "flat") { if (next.length) setFlatProducts((items) => replaceGarmentSlot(items, next[0], view as GarmentSlot)); }
                else if (tool.id === "accessory") { if (next.length) setAccessoryProducts((items) => ({ ...items, [accessoryType]: next[0] })); }
                else setProducts((items) => guide.maxProducts === 1 ? next.length ? next : items : [...items, ...next].slice(0, limit));
            }
            else if (isIdentityTool) { if (next.length) setIdentityReferences(next); }
            else if (tool.id === "color") { if (next.length) { setColorReferences(next); setColorEdit((current) => ({ ...current, hex: "" })); } }
            else { setReferences((items) => [...items, ...next].slice(0, limit)); setReferenceMode("reference"); }
            if (failures.length) throw new Error(failures.join("\n"));
        } catch (reason) {
            if (revision !== resultRevision.current) return;
            const detail = reason instanceof Error ? reason.message : "图片导入失败";
            setUploadErrors((current) => ({ ...current, [target]: detail }));
            void message.error(detail);
        } finally { readingRef.current = false; setReading(null); setShoeReading(null); setFlatReading(null); }
    };
    useEffect(() => {
        const paste = (event: ClipboardEvent) => {
            const element = event.target instanceof Element ? event.target : null;
            const files = Array.from(event.clipboardData?.files || []);
            if (element?.closest('input, textarea, [contenteditable="true"], [role="textbox"], .ant-modal, .ant-drawer, .ant-select-dropdown, .ant-popover')) return;
            const area = element?.closest<HTMLElement>("[data-upload-target]");
            const target = (area?.dataset.uploadTarget as UploadTarget | undefined) || hoveredUpload.current;
            if (!target || busy || readingRef.current || picker || dialog || historyOpen || preview !== null) return;
            if (!files.length) {
                const detail = "剪贴板中没有图片，请先复制图片或截图，再按 Ctrl+V 粘贴。";
                setUploadErrors((current) => ({ ...current, [target === "model" ? "model" : "product"]: detail }));
                return;
            }
            event.preventDefault();
            if (target.startsWith("shoe-")) void addFiles(files, "product", target.slice(5) as ShoeView);
            else if (target.startsWith("flat-")) void addFiles(files, "product", target.slice(5) as GarmentSlot);
            else void addFiles(files, target as "product" | "model");
        };
        document.addEventListener("paste", paste);
        return () => document.removeEventListener("paste", paste);
    });
    const importAssets = (ids: string[], picked: AssetLibraryPickerItem[] = []) => {
        if (!picker || busy || cancelling || readingRef.current || expanding) return;
        const selected = new Set(ids);
        const current = picker === "product" ? products : references;
        const next = picked.filter((item) => selected.has(item.id) && !current.some((image) => image.id === item.id)).map((item): ReferenceImage => {
            const image = item.asset?.kind === "image" ? item.asset.data : undefined;
            return { id: item.id, name: item.title, type: image?.mimeType || "image/png", dataUrl: item.imageUrl || image?.dataUrl || "", storageKey: item.imageStorageKey || image?.storageKey, width: image?.width, height: image?.height, bytes: image?.bytes };
        });
        if (next.some((item) => !item.dataUrl && !resourceIdFromStorageKey(item.storageKey))) { void message.error("所选素材没有可读取的图片"); return; }
        if (isIdentityTool) {
            if (next.length !== 1) { void message.error(`请选择 1 张${picker === "product" ? "原模特图" : guide.referenceLabel}`); return; }
            if (picker === "product") setIdentityProducts(next); else setIdentityReferences(next);
            setError(""); setUploadErrors((current) => ({ ...current, [picker === "product" ? "product" : "model"]: "" })); setPicker(null); return;
        }
        if (picker === "model" && tool.id === "color") {
            if (next.length !== 1) { void message.error("请选择 1 张配色参考图"); return; }
            setColorReferences(next); setColorEdit((current) => ({ ...current, hex: "" })); setPicker(null); return;
        }
        const limit = picker === "product" ? guide.maxProducts : 4;
        if (picker === "product" && tool.id === "accessory") {
            if (next.length !== 1) { void message.error(`请选择 1 张${accessory.label}商品图`); return; }
            setAccessoryProducts((items) => ({ ...items, [accessoryType]: next[0] }));
            setError(""); setUploadErrors((current) => ({ ...current, product: "" }));
            setPicker(null); return;
        }
        if (picker === "product" && tool.id === "flat") {
            if (next.length !== 1) { void message.error("每个服装位置请选择 1 张图片"); return; }
            const slot = flatMode === "onepiece" ? "full" : flatImportSlot.current === "lower" ? "lower" : "upper";
            setFlatProducts((items) => replaceGarmentSlot(items, next[0], slot));
            setError(""); setUploadErrors((current) => ({ ...current, product: "" }));
            setPicker(null); return;
        }
        if (picker === "product" && tool.id === "shoes") {
            if (next.length !== 1) { void message.error("每个鞋靴视角请选择 1 张图片"); return; }
            const shoeView = shoeMode === "single" ? "pair" : shoeImportView.current;
            setShoeProducts((items) => replaceShoeView(items, next[0], shoeView));
            setError(""); setUploadErrors((current) => ({ ...current, product: "" }));
            setPicker(null); return;
        }
        if (picker === "product" && guide.maxProducts === 1 && next.length === 1) { setProducts(next); setPicker(null); return; }
        if (current.length + next.length > limit) { void message.error(`最多选择 ${limit} 张图片`); return; }
        if (picker === "product") setProducts([...products, ...next]);
        else { setReferences([...references, ...next]); setReferenceMode("reference"); }
        setPicker(null);
    };
    const generate = async () => {
        if (controller.current || cancelling || readingRef.current) return;
        setError("");
        const inputError = tryOnInputError(tool, products.length, referenceMode, references.length, description, poseMode, colorEdit);
        if (inputError) { setError(inputError); return; }
        if (tool.id === "shoes" && (shoeMode === "multi" ? products.length !== 3 : products.length !== 1)) { setError("请补齐双脚鞋图、单鞋外侧图、单鞋内侧图，各 1 张"); return; }
        if (!selectedModel) { setError("请先配置可用的图片模型"); return; }
        const needsAnchor = consistent && count > 1;
        const referenceCount = products.length + (referenceMode === "reference" ? 1 : 0) + (needsAnchor ? 1 : 0);
        if (!profile || referenceCount > profile.references.maxImages) { setError(`当前模型最多支持 ${profile?.references.maxImages || 0} 张参考图，请减少商品图或切换模型${needsAnchor ? "；保持一致会占用一张参考图" : ""}`); return; }
        if (profile.references.maxImageBytes && [...products, ...(referenceMode === "reference" ? references : [])].some((image) => (image.bytes || 0) > profile.references.maxImageBytes)) { setError("有图片超过当前模型的文件大小限制，请压缩图片或切换模型"); return; }
        const abort = new AbortController(); controller.current = abort;
        resultRevision.current++;
        setBusy(true); setMobilePanel("results"); setStatus("正在准备参考图片");
        if (!outputs.length) setResultMeta({ label: `${tool.title} · ${referenceMode === "reference" ? "参考模特" : "智能模特"} · ${settings.size || "自动比例"}`, time: new Date().toISOString() });
        document.querySelector(".try-on-result-scroll")?.scrollTo({ top: 0 });
        const batchId = crypto.randomUUID(); let completed = 0;
        setActiveBatchId(batchId);
        try {
            const prepared = await prepareBackendGenerationTask({ mode: "image", config: runtime, signal: abort.signal, prompt: "使用后端当前启用的镜彻换装模板。", referenceImages: [...products, ...(referenceMode === "reference" ? references : [])] });
            const preparedImages = (prepared.input!.referenceImages as ReferenceImage[]).map((image) => ({ ...image, dataUrl: image.url || image.dataUrl || "" }));
            const savedProducts = preparedImages.slice(0, products.length);
            const savedModels = preparedImages.slice(products.length);
            for (const reference of referenceMode === "reference" ? savedModels : [undefined]) {
                let anchor: ReferenceImage | undefined;
                for (let index = 0; index < count; index++) {
                    if (abort.signal.aborted) break;
                    taskId.current = "";
                    setStatus(`${completed + 1} / ${total} · 正在提交生成任务`);
                    const context: TryOnResultContext = { batchId, title: tool.id === "accessory" ? `${tool.title} · ${accessory.label}` : tool.title, time: new Date().toISOString(), mode: generationMode === "children" ? "内衣／童装" : "专业模式", ratio: runtime.size || "自动", resolution: runtime.imageResolution === "auto" ? "自动" : runtime.imageResolution || "模型默认", model: selectedModel, modelLabel, settings: { size: runtime.size, imageResolution: runtime.imageResolution, quality: runtime.quality, imageParameters: runtime.imageParameters }, products: savedProducts, references: reference ? [reference] : [] };
                    const safeReferences = (images: ReferenceImage[]) => images.filter((image) => resourceIdFromStorageKey(image.storageKey)).map(({ id, name, type, storageKey }) => ({ id, name, type, storageKey, dataUrl: "" }));
                    const result = await runBackendGenerationTask({
                        mode: "image", config: runtime, signal: abort.signal,
                        prompt: "使用后端当前启用的镜彻换装模板。",
                        referenceImages: tryOnReferences(savedProducts, reference, anchor),
                        metadata: { source: "ai-apps", aiApplicationId: "universal-try-on", aiApplicationName: "万物上身", tryOnTool: tool.id, tryOn: tryOnIntent(tool, products.length, Boolean(reference), description, generationMode === "children", Boolean(anchor), tool.id === "shoes" ? products.map((image) => image.shoeView!) : undefined, tool.id === "flat" ? products.map((image) => image.garmentSlot!) : undefined, tool.id === "accessory" ? accessoryType : undefined, poseMode, colorEdit), promptTemplateOperation: `try_on_${tool.id}`, batchId, batchIndex: completed, batchCount: total, productCount: products.length, description, generationMode, consistent, count, tryOnSnapshot: { ...context, products: safeReferences(context.products), references: safeReferences(context.references) } },
                        onTaskUpdate: (task) => { taskId.current = task.id; const label = taskLabels[task.status] || task.status; setStatus(`${completed + 1} / ${total} · ${label}${task.stage && task.stage !== label ? ` · ${task.stage}` : ""}`); },
                    });
                    const images = result.images || [];
                    if (!images.length) throw new Error("任务未返回图片，请在生成记录中检查任务结果");
                    setOutputs((items) => [...items, ...images.map((image) => ({ ...image, context }))]); completed++;
                    if (needsAnchor && !anchor) anchor = { id: crypto.randomUUID(), name: "同组首张成片", type: images[0].mimeType || "image/png", dataUrl: images[0].dataUrl, storageKey: images[0].storageKey };
                }
            }
            setStatus(abort.signal.aborted ? "已停止后续生成，已完成的图片保留" : `已完成 ${completed} / ${total} 张`);
        } catch (reason) {
            if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "生成失败");
            setStatus(abort.signal.aborted ? "已停止后续生成，已完成的图片保留" : `已完成 ${completed} 张，未完成的任务请查看生成记录`);
        } finally { setBusy(false); controller.current = null; taskId.current = ""; }
    };
    const cancel = async () => {
        const currentTask = taskId.current;
        controller.current?.abort();
        setCancelling(true);
        try { if (currentTask) await cancelGenerationTask(currentTask); }
        catch (reason) { setError(`已停止后续生成，当前任务取消尚未确认，请在生成记录中检查。${reason instanceof Error ? reason.message : "取消请求失败"}`); }
        finally { setCancelling(false); }
    };
    const expand = async () => {
        if (expandingRef.current || busy || cancelling || readingRef.current) return;
        if (!description.trim()) { void message.info("先写一句你的模特、场景或风格想法"); return; }
        const textModels = selectableModelsByCapability(config, "text");
        const textModel = textModels.includes(config.textModel) ? config.textModel : "";
        if (!textModel) { void message.error("请先配置文本模型"); return; }
        expandingRef.current = true; setExpanding(true);
        const revision = resultRevision.current;
        try {
            const result = await runBackendGenerationTask({ mode: "text", config: { ...config, model: textModel, textModel }, prompt: "使用当前启用的镜彻换装描述扩写模板。", metadata: { source: "ai-apps", aiApplicationId: "universal-try-on-prompt", promptTemplateOperation: "try_on_description", tryOnDescription: description, tryOnTool: tool.id } });
            if (!result.text?.trim()) throw new Error("未返回描述，请重试");
            const expanded = result.text.trim().slice(0, 2000);
            if (revision === resultRevision.current) setDescription((current) => current === description ? expanded : current);
        } catch (reason) { void message.error(reason instanceof Error ? reason.message : "扩写失败"); }
        finally { expandingRef.current = false; setExpanding(false); }
    };
    const restoreTask = async (task: GenerationTask) => {
        if (busy || cancelling || readingRef.current || expanding) return;
        const revision = ++resultRevision.current;
        try {
            const detail = await queryGenerationTask(task.id);
            if (revision !== resultRevision.current) return;
            const input = JSON.parse(detail.inputJson || "{}");
            const meta = input.metadata || {};
            if (!tryOnTools.some((item) => item.id === meta.tryOnTool)) throw new Error("历史任务缺少有效工具类型，不能恢复输入");
            const snapshot = meta.tryOnSnapshot as TryOnResultContext | undefined;
            setActiveBatchId(snapshot?.batchId || "restored");
            if (snapshot) setSettings(snapshot.settings ? { size: snapshot.settings.size, imageResolution: snapshot.settings.imageResolution, quality: snapshot.settings.quality, imageParameters: snapshot.settings.imageParameters, count: "1" } : { size: snapshot.ratio === "自动" ? "" : snapshot.ratio, imageResolution: ["自动", "模型默认"].includes(snapshot.resolution) ? "auto" : snapshot.resolution, count: "1" }, meta.tryOnTool);
            if (snapshot?.model && models.includes(snapshot.model)) setModel(snapshot.model, meta.tryOnTool);
            setError(snapshot?.model && !models.includes(snapshot.model) ? "历史模型当前不可用，请确认执行模型后再生成。" : "");
            setPreview(null);
            if (tryOnTools.some((item) => item.id === meta.tryOnTool)) setToolId(meta.tryOnTool);
            if (typeof meta.description === "string") { if (meta.tryOnTool === "face") setFaceDescription(meta.description, meta.tryOnTool); else if (meta.tryOnTool === "model") setModelDescription(meta.description, meta.tryOnTool); else if (meta.tryOnTool === "color") setColorDescription(meta.description, meta.tryOnTool); else if (meta.tryOnTool === "pose") setPoseDescription(meta.description, meta.tryOnTool); else setGeneralDescription(meta.description, meta.tryOnTool === "accessory" ? `accessory-${meta.tryOn?.accessoryType}` : meta.tryOnTool); }
            if (meta.tryOnTool === "pose") setPoseMode(poseModes.find((item) => item.id === meta.tryOn?.poseMode)?.id || "smart", meta.tryOnTool);
            if (meta.tryOnTool === "color") {
                if (meta.tryOn?.colorEdit) setColorEdit(meta.tryOn.colorEdit, meta.tryOnTool);
                else { setColorEdit(defaultColorEdit, meta.tryOnTool); setError("历史换色任务未记录选色参数，请重新确认颜色和换色对象。"); }
            }
            if ([1, 2, 4].includes(meta.count)) setCount(meta.count, meta.tryOnTool);
            if (["professional", "children"].includes(meta.generationMode)) setGenerationMode(meta.generationMode, meta.tryOnTool);
            if (typeof meta.consistent === "boolean") setConsistent(meta.consistent, meta.tryOnTool);
            const sourceImages = input.referenceImages || (meta.tryOnSnapshot ? [...meta.tryOnSnapshot.products, ...meta.tryOnSnapshot.references] : undefined);
            const historyIdentityTool = meta.tryOnTool === "model" || meta.tryOnTool === "face";
            const setHistoryProducts = meta.tryOnTool === "face" ? setFaceProducts : setModelProducts;
            const setHistoryReferences = meta.tryOnTool === "face" ? setFaceReferences : setModelReferences;
            if (historyIdentityTool && (!Array.isArray(sourceImages) || meta.productCount !== 1)) {
                setHistoryProducts([], meta.tryOnTool); setHistoryReferences([], meta.tryOnTool); setError("历史任务缺少有效的两图输入，请重新上传原模特图和目标人物参考图。");
            }
            if (Array.isArray(sourceImages) && Number.isInteger(meta.productCount) && meta.productCount > 0 && (!historyIdentityTool || meta.productCount === 1)) {
                const imported = sourceImages.map((image: ReferenceImage) => ({ ...image, dataUrl: image.dataUrl || image.url || "" }));
                if (meta.tryOnTool === "shoes") {
                    const views = meta.tryOn?.shoeViews as ShoeView[] | undefined;
                    if (views && views.length === meta.productCount && ["pair", "pair,outer,inner"].includes(views.join(","))) {
                        setShoeMode(views.length === 3 ? "multi" : "single", meta.tryOnTool);
                        setShoeProducts(imported.slice(0, meta.productCount).map((image: ReferenceImage, index: number) => ({ ...image, shoeView: views[index] })), meta.tryOnTool);
                    } else { setShoeProducts([], meta.tryOnTool); setError("历史鞋图未记录有效视角，请重新选择单视角或多视角并上传图片。"); }
                } else if (meta.tryOnTool === "accessory") {
                    const category = accessoryTypes.find((item) => item.id === meta.tryOn?.accessoryType);
                    if (category && meta.productCount === 1) {
                        setAccessoryType(category.id, meta.tryOnTool);
                        setAccessoryProducts({ [category.id]: imported[0] }, meta.tryOnTool);
                    } else {
                        setAccessoryProducts({}, meta.tryOnTool);
                        setError("历史试戴任务未记录商品类型，请选择品类并重新上传商品图后生成。");
                    }
                } else if (meta.tryOnTool === "flat") {
                    const slots = meta.tryOn?.garmentSlots as GarmentSlot[] | undefined;
                    if (slots && slots.length === meta.productCount) {
                        setFlatMode(slots.includes("full") ? "onepiece" : "separates", meta.tryOnTool);
                        setFlatProducts(imported.slice(0, meta.productCount).map((image: ReferenceImage, index: number) => ({ ...image, garmentSlot: slots[index] })), meta.tryOnTool);
                    } else {
                        setFlatProducts([], meta.tryOnTool);
                        setError("历史任务未记录服装位置，请重新选择上装、下装或连体装后生成。");
                    }
                } else if (historyIdentityTool) setHistoryProducts(imported.slice(0, meta.productCount), meta.tryOnTool);
                else setProducts(imported.slice(0, meta.productCount), meta.tryOnTool);
                const modelImage = meta.tryOn?.referenceMode === "smart" ? undefined : imported[meta.productCount];
                const restoredReferences = modelImage && modelImage.name !== "同组首张成片" ? [modelImage] : [];
                if (historyIdentityTool) { setHistoryReferences(restoredReferences, meta.tryOnTool); if (!restoredReferences.length) setError("历史任务没有目标人物参考图，请上传后再生成。"); }
                else if (meta.tryOnTool === "color") setColorReferences(restoredReferences, meta.tryOnTool); else setGeneralReferences(restoredReferences, meta.tryOnTool);
                if (!historyIdentityTool) setReferenceMode(modelImage && modelImage.name !== "同组首张成片" ? "reference" : "smart", meta.tryOnTool);
            }
            const result = JSON.parse(detail.resultJson || "{}");
            if (!Array.isArray(result.images) || !result.images.length) { setOutputs([]); setHistoryOpen(false); void message.info("已恢复可用输入，该任务暂时没有成片，详情可在任务中心查看"); return; }
            setOutputs(result.images.map((image: Output) => ({ ...image, context: meta.tryOnSnapshot }))); setResultMeta({ label: detail.model || "历史生成", time: detail.createdAt }); setMobilePanel("results"); setStatus("已打开历史结果"); setHistoryOpen(false);
        } catch (reason) { if (revision === resultRevision.current) void message.error(reason instanceof Error ? reason.message : "读取结果失败"); }
    };
    const reset = () => { if (busy || cancelling || expanding || readingRef.current) return; resultRevision.current++; setProducts([]); setModelProducts([]); setModelReferences([]); setModelDescription(""); setFaceProducts([]); setFaceReferences([]); setFaceDescription(""); setShoeProducts([]); setShoeMode("single"); setFlatProducts([]); setFlatMode("separates"); setAccessoryProducts({}); setGeneralReferences([]); setColorReferences([]); setColorEdit(defaultColorEdit); setColorDescription(""); setGeneralDescription(""); setPoseDescription(""); setPoseMode("smart"); setOutputs([]); setStatus(""); setError(""); setUploadErrors({ product: "", model: "" }); setResultMeta(undefined); setMobilePanel("controls"); };
    const download = (index: number) => {
        const image = outputs[index];
        void downloadBrowserMedia({ fileName: `镜彻-${image.context?.title || tool.title}-${index + 1}.${image.mimeType === "image/jpeg" ? "jpg" : image.mimeType === "image/webp" ? "webp" : "png"}`, storageKey: image.storageKey, url: urlFor(image) }).catch((reason) => message.error(reason.message));
    };

    const selectTool = (value: string) => {
        if (busy || cancelling || readingRef.current || expanding) return;
        resultRevision.current++;
        hoveredUpload.current = null;
        setToolId(value); setPicker(null); setDialog(null); setHistoryOpen(false); setPreview(null);
        setError(""); setUploadErrors({ product: "", model: "" }); setMobilePanel("controls");
        document.querySelector(".try-on-control-scroll")?.scrollTo({ top: 0 });
    };

    return <WorkspacePage className="try-on-page" fluid scroll={false}>
        <div className="try-on-shell" data-mobile-panel={mobilePanel}>
            <div className="try-on-mobile-tabs" role="group" aria-label="工作区"><button type="button" aria-pressed={mobilePanel === "controls"} onClick={() => setMobilePanel("controls")}>生成配置</button><button type="button" aria-pressed={mobilePanel === "results"} onClick={() => setMobilePanel("results")}>生成结果{outputs.length ? ` · ${outputs.length}` : ""}</button></div>
            <div className="try-on-layout">
                <nav className="try-on-tools" aria-label="穿戴工具"><div className="try-on-tool-items">{tryOnTools.map((item, index) => {
                    const Icon = toolIcons[index];
                    return <button type="button" disabled={busy || cancelling || Boolean(reading) || expanding} key={item.id} aria-pressed={toolId === item.id} onClick={() => selectTool(item.id)}><Icon aria-hidden /><span>{item.title}</span></button>;
                })}</div><div className="try-on-tool-footer"><button type="button" onClick={() => setHistoryOpen(true)}><History aria-hidden /><span>生成记录</span></button><button type="button" disabled={busy || Boolean(reading)} onClick={() => { shoeImportView.current = "pair"; setPicker("product"); }}><FolderOpen aria-hidden /><span>素材库</span></button><Link to="/projects"><ArrowLeft aria-hidden /><span>创意中心</span></Link></div></nav>
                <section className="try-on-controls" aria-label="生成配置">
                    <header className="try-on-header"><div className="try-on-header-title"><h1>{tool.title}<span>镜彻</span></h1><p>{tool.hint}</p></div><Button size="small" disabled={busy || cancelling || expanding || Boolean(reading)} icon={<Plus size={14} />} onClick={reset}>新建任务</Button></header>
                    <div className="try-on-control-scroll">
                    {isIdentityTool ? <ModelImageUpload kind={tool.id === "face" ? "face" : "model"} target="product" image={identityProducts[0]} disabled={busy || Boolean(reading)} reading={reading === "product"} imageUrl={urlFor} onFiles={(files) => void addFiles(files, "product")} onImport={() => setPicker("product")} onRemove={() => setIdentityProducts([])} onHover={(target) => { hoveredUpload.current = target; }} /> : tool.id === "accessory" ? <AccessoryUpload category={accessoryType} image={accessoryProducts[accessoryType]} disabled={busy || Boolean(reading)} reading={reading === "product"} imageUrl={urlFor} onCategoryChange={(value) => { setAccessoryType(value); hoveredUpload.current = null; setError(""); setUploadErrors((current) => ({ ...current, product: "" })); }} onFiles={(files) => void addFiles(files, "product")} onImport={() => setPicker("product")} onRemove={() => setAccessoryProducts((items) => ({ ...items, [accessoryType]: undefined }))} onHover={(target) => { hoveredUpload.current = target; }} /> : tool.id === "flat" ? <><div className="try-on-section-heading"><h2>服装平铺图／人台图</h2><small>{products.length} / {flatMode === "onepiece" ? 1 : 2}</small></div><FlatUpload images={flatProducts} mode={flatMode} disabled={busy || Boolean(reading)} readingSlot={flatReading} imageUrl={urlFor} onModeChange={(value) => { setFlatMode(value); hoveredUpload.current = null; setError(""); setUploadErrors((current) => ({ ...current, product: "" })); }} onFiles={(files, slot) => void addFiles(files, "product", slot)} onImport={(slot) => { flatImportSlot.current = slot; setPicker("product"); }} onRemove={(slot) => setFlatProducts((items) => items.filter((image) => image.garmentSlot !== slot))} onHover={(target) => { hoveredUpload.current = target; }} /></> : tool.id === "shoes" ? <><div className="try-on-section-heading"><h2>鞋靴商品图</h2><small>{products.length} / {shoeMode === "multi" ? 3 : 1}</small></div><ShoeUpload images={shoeProducts} mode={shoeMode} disabled={busy || Boolean(reading)} readingView={shoeReading} imageUrl={urlFor} onModeChange={(value) => { setShoeMode(value); hoveredUpload.current = null; setError(""); setUploadErrors((current) => ({ ...current, product: "" })); }} onFiles={(files, view) => void addFiles(files, "product", view)} onImport={(view) => { shoeImportView.current = view; setPicker("product"); }} onRemove={(view) => setShoeProducts((items) => items.filter((image) => image.shoeView !== view))} onHover={(target) => { hoveredUpload.current = target; }} /></> : <>
                    <div className="try-on-section-heading"><h2>{guide.productLabel}</h2><small>{products.length} / {guide.maxProducts}</small></div>
                    <div className="try-on-drop" data-upload-target="product" data-has-image={Boolean(products.length)} aria-busy={reading === "product"} aria-describedby="try-on-product-feedback" onPointerEnter={() => { hoveredUpload.current = "product"; }} onPointerLeave={() => { hoveredUpload.current = null; }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addFiles(Array.from(event.dataTransfer.files), "product"); }} tabIndex={0} aria-label="商品图上传区域，可拖入或粘贴图片">
                        <input ref={productInput} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple={guide.maxProducts > 1} disabled={busy || Boolean(reading)} onChange={(event) => { void addFiles(Array.from(event.target.files || []), "product"); event.target.value = ""; }} />
                        {products.length ? <div className="try-on-thumbnails" data-single={guide.maxProducts === 1}>{products.map((image, index) => <div key={image.id}><img src={urlFor(image)} alt={`商品图 ${index + 1}`} /><button type="button" disabled={busy} aria-label={`移除商品图 ${index + 1}`} onClick={() => setProducts(products.filter((_, i) => i !== index))}><X size={13} /></button><span>{index + 1}</span></div>)}</div> : null}
                        <button className="try-on-upload-trigger" type="button" disabled={busy || Boolean(reading) || guide.maxProducts > 1 && products.length >= guide.maxProducts} onClick={() => productInput.current?.click()}>{reading === "product" ? <Spin size="small" /> : <ImagePlus aria-hidden />}<strong>{reading === "product" ? "正在读取并校验图片…" : products.length && guide.maxProducts === 1 ? "更换图片" : `上传／拖入／粘贴${guide.productLabel}`}</strong></button>
                        <Button size="small" icon={<FolderOpen size={14} />} disabled={busy || Boolean(reading)} onClick={() => setPicker("product")}>从素材库导入</Button>
                    </div>
                    <p className="try-on-note">{guide.productHint}</p>
                    </>}
                    <p className="try-on-note">PNG / JPG / WEBP · ≤ 20MB · 300～4096px<br />支持拖入；聚焦上传区后可按 Ctrl+V 粘贴。</p>
                    <div id="try-on-product-feedback">{reading === "product" ? <p className="try-on-note" role="status">正在读取并校验图片，请稍候。</p> : uploadErrors.product ? <p className="try-on-upload-error" role="alert">{uploadErrors.product}</p> : null}</div>
                    {!isIdentityTool ? <div className="try-on-section-heading"><h2>{tool.id === "color" ? "颜色" : tool.id === "pose" ? "参考姿势" : guide.referenceLabel}</h2><Button type="text" size="small" onClick={() => setDialog("help")}>使用指南</Button></div> : null}
                    <fieldset disabled={busy || cancelling || Boolean(reading) || expanding} inert={busy || Boolean(reading) || expanding} aria-busy={busy || Boolean(reading) || expanding} className="try-on-fieldset">{isIdentityTool ? null : tool.id === "color" ? <ColorSettings value={colorEdit} onChange={(value) => { setColorEdit(value); setError(""); hoveredUpload.current = null; }} /> : tool.id === "pose" ? <PoseModeSelect value={poseMode} onChange={(value) => { setPoseMode(value); hoveredUpload.current = null; setError(""); }} /> : <div className="try-on-segment" role="group" aria-label="目标来源"><button type="button" aria-pressed={referenceMode === "smart"} onClick={() => setReferenceMode("smart")}>{guide.smartLabel}</button><button type="button" aria-pressed={referenceMode === "reference"} onClick={() => setReferenceMode("reference")}>{guide.referenceLabel}</button></div>}
                    {isIdentityTool ? <><ModelImageUpload kind={tool.id === "face" ? "face" : "model"} target="model" image={identityReferences[0]} disabled={busy || Boolean(reading)} reading={reading === "model"} imageUrl={urlFor} onFiles={(files) => void addFiles(files, "model")} onImport={() => setPicker("model")} onRemove={() => setIdentityReferences([])} onHover={(target) => { hoveredUpload.current = target; }} /><div id="try-on-model-feedback">{uploadErrors.model ? <p className="try-on-upload-error" role="alert">{uploadErrors.model}</p> : null}</div></> : referenceMode === "smart" ? tool.id === "pose" || tool.id === "color" ? null : <div className="try-on-smart"><UserRound aria-hidden /><div><strong>{guide.smartLabel}</strong><p>{guide.smartHint}</p></div><Check size={16} aria-hidden /></div> : <div className="try-on-reference-box" data-upload-target="model" aria-busy={reading === "model"} aria-describedby="try-on-model-feedback" tabIndex={0} onPointerEnter={() => { hoveredUpload.current = "model"; }} onPointerLeave={() => { hoveredUpload.current = null; }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addFiles(Array.from(event.dataTransfer.files), "model"); }}>
                        <input ref={modelInput} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple={tool.id !== "color"} onChange={(event) => { void addFiles(Array.from(event.target.files || []), "model"); event.target.value = ""; }} />
                        {tool.id === "color" && references[0] ? <><ColorReferenceSampler src={urlFor(references[0])} hex={colorEdit.hex} onSample={(hex) => setColorEdit((current) => ({ ...current, hex }))} /><Button size="small" onClick={() => { setColorReferences([]); setColorEdit((current) => ({ ...current, hex: "" })); }}>移除配色参考图</Button></> : <div className="try-on-thumbnails" data-single={tool.id === "pose" && references.length === 1}>{references.map((image, index) => <div key={image.id}><img src={urlFor(image)} alt={`${guide.referenceLabel} ${index + 1}`} /><button type="button" aria-label={`移除参考图 ${index + 1}`} onClick={() => setReferences(references.filter((_, i) => i !== index))}><X size={13} /></button></div>)}</div>}
                        <div className="try-on-inline-actions"><Button loading={reading === "model"} disabled={Boolean(reading)} onClick={() => modelInput.current?.click()}>{reading === "model" ? "正在读取图片" : `上传${guide.referenceLabel}`}</Button><Button disabled={Boolean(reading)} onClick={() => setPicker("model")}>从素材库选择</Button></div><p className="try-on-note">{tool.id === "color" ? "一张配色参考图。支持替换、拖入或粘贴；格式与尺寸要求同原图。" : <>{guide.smartHint}<br />最多 4 张，每张参考图分别生成一组结果。支持拖入或将鼠标移到此区域后按 Ctrl+V 粘贴。格式与尺寸要求同商品图。</>}</p>
                        <div id="try-on-model-feedback">{reading === "model" ? <p className="try-on-note" role="status">正在读取并校验图片，请稍候。</p> : uploadErrors.model ? <p className="try-on-upload-error" role="alert">{uploadErrors.model}</p> : null}</div>
                    </div>}
                    {tool.id !== "pose" || poseMode === "text" ? <><label className="try-on-field"><span>{tool.id === "pose" ? "目标动作" : "额外描述"} <small>{descriptionRequired ? "必填目标" : "可选"}</small></span><Input.TextArea value={description} onChange={(event) => setDescription(event.target.value)} required={descriptionRequired} maxLength={2000} rows={5} placeholder={tool.id === "color" ? "例如：只改变上衣底色，白色标志、拉链和其余衣物保持不变。" : guide.placeholder} /></label>
                    <div className="try-on-description-actions"><Button size="small" icon={<Sparkles size={14} />} disabled={expanding} loading={expanding} onClick={() => void expand()}>AI 扩写</Button><Button size="small" onClick={() => setDialog("words")}>描述词库</Button><small>{description.length} / 2000</small><Button type="text" size="small" aria-label="清空描述" onClick={() => setDescription("")}><RotateCcw size={14} /></Button></div>
                    </> : null}
                    <div className="try-on-switch"><label htmlFor="try-on-consistent">保持同组模特与场景一致</label><Switch id="try-on-consistent" checked={consistent} onChange={(value) => setConsistent(value)} /></div><p className="try-on-note">开启后，多张生成会引用同组首张成片辅助保持一致。</p>
                    <GenerationModeSelect value={generationMode} onChange={setGenerationMode} />
                    <div className="try-on-field try-on-execution-model" tabIndex={-1}><span>执行模型</span><ModelPicker config={runtime} capability="image" value={selectedModel} fullWidth showConfiguredModelName showOptionPrices showSelectedPrice={false} placeholder="选择图片模型" requirements={{ capability: "image", input: { textCount: 1, imageCount: referenceCount, referenceImageCount: referenceCount, videoCount: 0, audioCount: 0, characterCount: 0 } }} onChange={(value) => { setModel(value); setSettings({ ...defaultImageParamsForModel(runtime, value), count: "1" }); setError(""); }} />{modelLabel ? <p className="try-on-note" aria-live="polite">当前选择：{modelLabel}<br />本次单张任务需 {referenceCount} 张参考图，模型上限 {profile?.references.maxImages ?? 0} 张。</p> : <p className="try-on-note">{models.length ? "请选择支持当前输入的图片模型；历史或原选模型不可用时不会自动切换。" : "暂无可用图片模型，请先在模型设置中配置。"}</p>}</div>
                    {profile ? <div className="try-on-parameters"><ImageParameterFields profile={profile} config={runtime} showCount={false} showTransparent={false} onChange={(key, value) => setSettings((current) => ({ ...current, [key]: value }))} /></div> : null}
                    <label className="try-on-field"><span>每组生成数量</span><Select value={count} onChange={(value) => setCount(value)} options={[1, 2, 4].map((value) => ({ value, label: `${value} 张` }))} /></label></fieldset>
                    </div>
                    <div className="try-on-submit"><div className="try-on-model-summary"><span>执行模型</span><strong title={modelLabel}>{modelLabel || "尚未选择"}</strong><button type="button" disabled={busy} onClick={() => { const field = document.querySelector<HTMLElement>(".try-on-execution-model"); field?.scrollIntoView({ block: "center", behavior: "auto" }); field?.focus({ preventScroll: true }); }}>更换</button></div>{error ? <div className="try-on-error" role="alert">{error}</div> : null}<div><span>本次生成 <strong>{total} 张</strong></span><small>按所选模型实际计费</small></div><Button type="primary" block size="large" icon={<Sparkles size={16} />} loading={busy} disabled={expanding || cancelling || Boolean(reading) || !selectedModel} onClick={() => void generate()}>{busy ? status : "立即生成"}</Button>{busy ? <Button block disabled={!taskId.current} title={!taskId.current ? "任务提交完成后可取消" : undefined} loading={cancelling} onClick={() => void cancel()}>取消当前任务并停止后续生成</Button> : null}</div>
                </section>
                <section className="try-on-stage" aria-label="预览与生成结果">
                    <header className="try-on-stage-toolbar"><h2>生成结果{outputs.length ? <span>{outputs.length}</span> : null}</h2><div><Button type="text" size="small" aria-label="刷新历史结果" disabled={busy} loading={recentLoading} onClick={() => setRecentRefresh((value) => value + 1)}><RotateCcw size={15} /></Button><button type="button" aria-label="网格查看" aria-pressed={resultView === "grid"} onClick={() => setResultView("grid")}><LayoutGrid aria-hidden /></button><button type="button" aria-label="列表查看" aria-pressed={resultView === "list"} onClick={() => setResultView("list")}><List aria-hidden /></button></div></header>
                    <div className="try-on-result-scroll">
                        {recentError ? <div className="try-on-load-error" role="alert">{recentError}<Button size="small" onClick={() => setRecentRefresh((value) => value + 1)}>重试</Button></div> : null}
                        {busy ? <div className="try-on-generation-state" role="status" aria-live="polite"><Spin /><strong>{taskId.current ? status : "任务发起中…"}</strong></div> : null}
                        {outputs.length ? [...resultGroups.entries()].reverse().map(([key, group]) => <section key={key} className="try-on-result-batch" aria-label="本组生成结果">
                            <header><div><span className="try-on-result-dot" /><span>{group.label}</span><time>{group.time ? new Date(group.time).toLocaleString() : ""}</time></div><span role={key === activeBatchId && !busy ? "status" : undefined}>{key === activeBatchId && !busy ? status : `${group.items.length} 张`}</span></header>
                            <div className="try-on-result-grid" data-view={resultView}>{group.items.map(({ image, index }) => <article className="try-on-result-card" key={`${image.storageKey}-${index}`}>
                                <button className="try-on-result-open" type="button" aria-label={`放大查看结果 ${index + 1}`} onClick={() => setPreview(index)}><img src={urlFor(image)} alt={`${image.context?.title || tool.title}生成结果 ${index + 1}`} /></button>
                                <footer><span>{String(index + 1).padStart(2, "0")}{image.width && image.height ? ` · ${image.width} × ${image.height}` : ""}</span><Button type="text" size="small" icon={<Download size={14} />} onClick={() => download(index)}>下载原图</Button></footer>
                            </article>)}</div>
                        </section>) : !busy ? <div className="try-on-result-empty" aria-live="polite"><ImagePlus aria-hidden /><strong>{recentLoading ? "正在读取生成记录" : "暂无生成结果"}</strong><p>上传{guide.productLabel}，按当前工具配置参考图后开始生成。</p></div> : null}
                    </div>
                </section>
            </div>
        </div>
        <AssetLibraryPickerModal open={Boolean(picker)} title={`选择${picker === "product" ? guide.productLabel : guide.referenceLabel}`} remoteLibrary remoteKind="image" mediaKinds={["image"]} acceptRemoteItems items={[]} categoryLabels={{}} multiple={!isIdentityTool && !(picker === "product" && tool.id === "accessory") && !(picker === "model" && tool.id === "color")} onClose={() => setPicker(null)} onConfirm={importAssets} />
        <AppModal title={dialog === "help" ? "镜彻万物上身 · 使用指南" : "描述词库"} open={Boolean(dialog)} onCancel={() => setDialog(null)} footer={null}>{dialog === "help" ? <ol className="try-on-help"><li>上传商品或原模特图片；多件商品会作为同一套搭配。</li><li>按当前工具选择颜色、姿态或人物参考。换模特与换脸必须上传目标人物。</li><li>描述需保持或调整的细节，选择模型支持的参数与数量。</li><li>点击生成。可查看、放大和下载结果，历史任务在生成记录中保留。</li><li>AI 扩写使用文本模型，会按平台规则产生文本调用消耗。</li></ol> : <div className="try-on-word-list">{descriptionPresetsFor(tool.id, referenceMode === "reference").map((item) => <Button key={item.title} onClick={() => { setDescription((value) => [value, item.text].filter(Boolean).join("\n").slice(0, 2000)); setDialog(null); }}>{item.title}</Button>)}</div>}</AppModal>
        <AppDrawer title="生成记录 · 最近 30 天" open={historyOpen} onClose={() => setHistoryOpen(false)} width={380}><div className="try-on-history"><Button loading={historyLoading} onClick={() => void loadHistory()}>刷新记录</Button>{historyError ? <p role="alert">{historyError}</p> : !historyLoading && !history.length ? <p>最近 200 条任务中暂无万物上身记录</p> : null}{history.map((task) => <button type="button" disabled={busy || cancelling || Boolean(reading) || expanding} key={task.id} onClick={() => void restoreTask(task)}><strong>{taskLabels[task.status] || task.status}</strong><span>{new Date(task.createdAt).toLocaleString()}</span><p>{task.prompt.slice(-100)}</p>{task.error ? <small>{task.error}</small> : null}</button>)}<Link to="/tasks">前往完整任务中心 <ArrowRight size={14} /></Link></div></AppDrawer>
        {preview !== null && outputs[preview] ? <TryOnResultViewer images={outputs} index={preview} onIndexChange={setPreview} onClose={() => setPreview(null)} imageUrl={urlFor} onDownload={download} /> : null}
    </WorkspacePage>;
}
