import { Button, Input, Select } from "antd";
import {
    ArrowLeft,
    ArrowRight,
    Box,
    Boxes,
    Check,
    Copy,
    Crop,
    Image as ImageIcon,
    LoaderCircle,
    Search,
    Shirt,
    Sparkles,
    Upload,
    Video,
    WandSparkles,
    X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";

import { PageHeader, WorkspacePage } from "@/components/layout/workspace-page";
import { cn } from "@/lib/utils";
import { resourceFileUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import { runBackendGenerationTask, type BackendGenerationResult, type BackendGenerationMode } from "@/services/api/generation-task";
import { modelOptionLabel, selectableModelsByCapability, useConfigStore, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import { AI_APPLICATIONS, AI_APP_CATEGORIES, getAiApplication, type AiAppCategory, type AiApplication } from "./catalog";
import "./ai-apps.css";

const categoryIcons: Record<AiAppCategory, typeof Sparkles> = {
    "广告与创意": WandSparkles,
    电商: Box,
    "时尚与模特": Shirt,
    实用工具: Crop,
};

const ratios = ["1:1", "4:5", "3:4", "16:9", "9:16"];
const ratioGuide = [
    ["电商主图", "1:1", "2000 × 2000"],
    ["小红书竖图", "3:4", "1242 × 1660"],
    ["Instagram 帖子", "4:5", "1080 × 1350"],
    ["短视频封面", "9:16", "1080 × 1920"],
    ["横版广告 / YouTube", "16:9", "1920 × 1080"],
    ["商品详情页横幅", "3:1", "1920 × 640"],
];

function appIcon(app: AiApplication) {
    if (app.mode === "video") return Video;
    if (app.category === "时尚与模特") return Shirt;
    if (app.category === "实用工具") return Crop;
    return app.category === "电商" ? Box : ImageIcon;
}

function AiAppCard({ app }: { app: AiApplication }) {
    const Icon = appIcon(app);
    return (
        <Link to={`/ai-apps/${app.id}`} className="ai-app-card" aria-label={`打开${app.name}`}>
            <div className="ai-app-card-visual" aria-hidden>
                <span className="ai-app-card-grid" />
                <span className="ai-app-card-orbit" />
                <span className="ai-app-card-icon"><Icon /></span>
                <span className="ai-app-card-index">{String(AI_APPLICATIONS.indexOf(app) + 1).padStart(2, "0")}</span>
            </div>
            <div className="ai-app-card-body">
                <div className="ai-app-card-heading"><h3>{app.name}</h3><ArrowRight aria-hidden /></div>
                <p>{app.summary}</p>
                <div className="ai-app-card-tags">{app.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
            </div>
        </Link>
    );
}

function CatalogPage() {
    const [category, setCategory] = useState<(typeof AI_APP_CATEGORIES)[number]>("全部");
    const [query, setQuery] = useState("");
    const visible = useMemo(() => {
        const key = query.trim().toLowerCase();
        return AI_APPLICATIONS.filter((app) => (category === "全部" || app.category === category) && (!key || `${app.name}${app.summary}${app.tags.join("")}`.toLowerCase().includes(key)));
    }, [category, query]);

    const grouped = useMemo(() => AI_APP_CATEGORIES.slice(1).map((name) => ({
        name: name as AiAppCategory,
        apps: visible.filter((app) => app.category === name),
    })).filter((group) => group.apps.length), [visible]);

    return (
        <WorkspacePage className="ai-apps-page studio-collection-page">
            <PageHeader title="AI 应用" description="从成熟工作流开始创作；素材、模型、任务、积分和结果统一由境彻后端管理。" meta={<span className="ai-app-count">{AI_APPLICATIONS.length} 个应用</span>} />
            <div className="ai-apps-toolbar" role="search">
                <div className="ai-apps-categories" aria-label="应用分类">
                    {AI_APP_CATEGORIES.map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
                </div>
                <Input allowClear prefix={<Search className="size-4" />} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索应用或能力" aria-label="搜索 AI 应用" />
            </div>
            {grouped.map((group) => {
                const Icon = categoryIcons[group.name];
                return (
                    <section key={group.name} className="ai-apps-section" aria-labelledby={`category-${group.name}`}>
                        <div className="ai-apps-section-heading"><span><Icon aria-hidden /></span><div><h2 id={`category-${group.name}`}>{group.name}</h2><p>{group.apps.length} 个生产级工作流</p></div></div>
                        <div className="ai-apps-grid">{group.apps.map((app) => <AiAppCard key={app.id} app={app} />)}</div>
                    </section>
                );
            })}
            {!visible.length ? <div className="ai-apps-empty"><Search /><strong>没有匹配的应用</strong><span>换一个关键词或分类试试。</span></div> : null}
        </WorkspacePage>
    );
}

function fileToReference(file: File): Promise<ReferenceImage> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error(`无法读取 ${file.name}`));
        reader.onload = () => resolve({ id: crypto.randomUUID(), name: file.name, type: file.type || "image/png", dataUrl: String(reader.result || ""), bytes: file.size });
        reader.readAsDataURL(file);
    });
}

function resultUrl(item?: { dataUrl?: string; storageKey?: string }) {
    if (item?.dataUrl) return item.dataUrl;
    const id = resourceIdFromStorageKey(item?.storageKey);
    return id ? resourceFileUrl(id) : "";
}

function modelKey(mode: BackendGenerationMode): "textModel" | "imageModel" | "videoModel" | "audioModel" {
    return mode === "text" ? "textModel" : mode === "video" ? "videoModel" : mode === "audio" ? "audioModel" : "imageModel";
}

function RatioGuide() {
    const [copied, setCopied] = useState("");
    const copy = async (size: string) => {
        await navigator.clipboard.writeText(size);
        setCopied(size);
        window.setTimeout(() => setCopied(""), 1600);
    };
    return <div className="ai-app-ratio-list">{ratioGuide.map(([platform, ratio, size]) => <button type="button" key={platform} onClick={() => void copy(size)}><span><strong>{platform}</strong><small>{ratio}</small></span><span>{size}{copied === size ? <Check /> : <Copy />}</span></button>)}</div>;
}

function ApplicationWorkbench({ app }: { app: AiApplication }) {
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const [prompt, setPrompt] = useState("");
    const [ratio, setRatio] = useState(config.size || "1:1");
    const [references, setReferences] = useState<Array<ReferenceImage | undefined>>(() => app.referenceLabels.map(() => undefined));
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [result, setResult] = useState<BackendGenerationResult>();
    const abortRef = useRef<AbortController | undefined>(undefined);
    const mode = app.mode === "utility" ? undefined : app.mode;
    const key = mode ? modelKey(mode) : undefined;
    const models = useMemo(() => mode ? selectableModelsByCapability(config, mode) : [], [config, mode]);
    const selectedModel = key ? config[key] || models[0] || "" : "";

    useEffect(() => () => abortRef.current?.abort(), []);

    const setReference = async (index: number, file?: File) => {
        setError("");
        if (!file) return;
        try {
            const next = await fileToReference(file);
            setReferences((current) => current.map((item, itemIndex) => itemIndex === index ? next : item));
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "图片读取失败");
        }
    };

    const generate = async () => {
        if (!mode || !key) return;
        if (!selectedModel) { setError(`当前没有可用的${mode === "video" ? "视频" : "图像"}模型，请先让管理员在模型目录中配置。`); return; }
        const required = app.referenceLabels.filter((label) => !label.includes("可选")).length;
        if (references.filter(Boolean).length < required) { setError(`请先上传${app.referenceLabels.slice(0, required).join("和")}。`); return; }
        const controller = new AbortController();
        abortRef.current = controller;
        setBusy(true); setError(""); setResult(undefined); setStatus("正在提交到任务队列");
        const runtimeConfig: AiConfig = { ...config, model: selectedModel, [key]: selectedModel, size: ratio };
        try {
            const output = await runBackendGenerationTask({
                mode,
                prompt: `${app.promptPrefix}${prompt.trim() ? `\n用户补充要求：${prompt.trim()}` : ""}`,
                config: runtimeConfig,
                referenceImages: references.filter((item, index): item is ReferenceImage => Boolean(item) && index !== app.maskIndex),
                mask: app.maskIndex === undefined ? undefined : references[app.maskIndex],
                signal: controller.signal,
                metadata: { source: "ai-apps", aiApplicationId: app.id, aiApplicationName: app.name, workflowVersion: 1 },
                onTaskUpdate: (task) => setStatus(task.status === "running" ? "后端正在生成" : task.status === "queued" ? "任务排队中" : `任务状态：${task.status}`),
            });
            setResult(output); setStatus("生成完成");
        } catch (reason) {
            if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "生成失败，请稍后重试");
            setStatus(controller.signal.aborted ? "已取消" : "");
        } finally {
            setBusy(false); abortRef.current = undefined;
        }
    };

    return (
        <div className="ai-app-workbench">
            <section className="ai-app-panel ai-app-input-panel">
                <div className="ai-app-panel-heading"><div><span>工作流输入</span><h2>{app.name}</h2></div><span className="ai-app-native-badge">后端原生任务</span></div>
                {app.mode === "utility" ? <RatioGuide /> : <>
                    {app.referenceLabels.length ? <div className="ai-app-reference-grid">{app.referenceLabels.map((label, index) => {
                        const item = references[index];
                        return <label className={cn("ai-app-upload", item && "has-file")} key={label}>
                            {item ? <><img src={item.dataUrl} alt="" /><span className="ai-app-upload-name">{item.name}</span><button type="button" aria-label={`移除${label}`} onClick={(event) => { event.preventDefault(); setReferences((current) => current.map((value, itemIndex) => itemIndex === index ? undefined : value)); }}><X /></button></> : <><span className="ai-app-upload-icon"><Upload /></span><strong>{label}</strong><small>PNG、JPG、WEBP</small></>}
                            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void setReference(index, event.target.files?.[0])} />
                        </label>;
                    })}</div> : null}
                    <label className="ai-app-field"><span>创作要求</span><Input.TextArea value={prompt} onChange={(event) => setPrompt(event.target.value)} autoSize={{ minRows: 4, maxRows: 9 }} maxLength={3000} showCount placeholder={app.promptPlaceholder} /></label>
                    <div className="ai-app-settings">
                        <label><span>执行模型</span><Select showSearch value={selectedModel || undefined} placeholder="暂无可用模型" options={models.map((model) => ({ value: model, label: modelOptionLabel(config, model) }))} onChange={(value) => { updateConfig(key!, value); updateConfig("model", value); }} /></label>
                        <label><span>画面比例</span><Select value={ratio} options={ratios.map((value) => ({ value, label: value }))} onChange={setRatio} /></label>
                    </div>
                    {error ? <div className="ai-app-error" role="alert">{error}</div> : null}
                    <div className="ai-app-actions">
                        {busy ? <Button onClick={() => abortRef.current?.abort()}>取消任务</Button> : null}
                        <Button type="primary" disabled={!selectedModel || busy} loading={busy} icon={busy ? undefined : <Sparkles className="size-4" />} onClick={() => void generate()}>{busy ? status : "开始生成"}</Button>
                    </div>
                </>}
            </section>
            {app.mode !== "utility" ? <section className="ai-app-panel ai-app-result-panel" aria-live="polite">
                <div className="ai-app-panel-heading"><div><span>生成结果</span><h2>任务产物</h2></div>{result ? <Link to="/tasks">查看调用记录</Link> : null}</div>
                {!result && !busy ? <div className="ai-app-result-empty"><span><Boxes /></span><strong>结果将在这里出现</strong><p>提交后，素材会先进入资源库，再由后端任务队列执行并记录消耗。</p></div> : null}
                {busy ? <div className="ai-app-result-empty"><span><LoaderCircle className="ai-app-spin" /></span><strong>{status}</strong><p>可以离开页面；任务仍会保留在创作历史中。</p></div> : null}
                {result?.images?.length ? <div className="ai-app-result-grid">{result.images.map((image, index) => <img key={`${image.storageKey}-${index}`} src={resultUrl(image)} alt={`${app.name}结果 ${index + 1}`} />)}</div> : null}
                {result?.video ? <video className="ai-app-result-video" src={resultUrl(result.video)} controls playsInline /> : null}
                {result?.text ? <div className="ai-app-result-text">{result.text}</div> : null}
            </section> : <section className="ai-app-panel ai-app-result-panel"><div className="ai-app-result-empty"><span><Crop /></span><strong>尺寸即点即复制</strong><p>比例查询在浏览器本地完成，不创建任务，也不扣除积分。</p></div></section>}
        </div>
    );
}

function DetailPage({ app }: { app: AiApplication }) {
    return <WorkspacePage className="ai-apps-page ai-app-detail-page studio-collection-page">
        <Link className="ai-app-back" to="/ai-apps"><ArrowLeft />返回 AI 应用</Link>
        <PageHeader title={app.name} description={app.description} meta={<span className="ai-app-count">{app.category}</span>} />
        <ApplicationWorkbench app={app} />
    </WorkspacePage>;
}

export default function AiAppsPage() {
    const { appId } = useParams();
    const app = getAiApplication(appId);
    if (appId && !app) return <WorkspacePage className="ai-apps-page studio-collection-page"><div className="ai-apps-empty"><Boxes /><strong>应用不存在</strong><Link to="/ai-apps">返回应用中心</Link></div></WorkspacePage>;
    return app ? <DetailPage app={app} /> : <CatalogPage />;
}
