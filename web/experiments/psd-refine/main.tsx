import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Alert, Button, ConfigProvider, Dropdown, Select, Tooltip } from "antd";
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpFromLine, Check, ChevronDown, FileImage, FileStack, FlaskConical, Maximize2, Moon, PanelLeftClose, PanelLeftOpen, RefreshCw, Scan, Sun, X } from "lucide-react";
import { getAntThemeConfig } from "../../src/lib/app-theme";
import { AppModal } from "../../src/components/ui/product/app-modal";
import { PhotopeaBridge, PHOTOPEA_ORIGIN, MAX_FILE_BYTES, validateFile, type DocumentInfo, type EditorState, type Format } from "./photopea-bridge";
import { createSample } from "./sample";
import { verifyRoundtrip, type VerificationStep } from "./roundtrip-verification";
import { ecommerceProjects, ecommerceModules, importEcommerceModule, importedModuleFile, persistPsdVersion, savedPsdSessions, savedPsdVersions, startPsdSession, type EcommerceProject, type EcommerceModule, type PsdSaveSnapshot, type PsdSession, type PsdVersion } from "./psd-api";
import { ApiError } from "../../src/services/api/request";
import { AccountOperationBoundary } from "./account-operation-boundary";
import { findSavedModuleVersion, savedVersionFile } from "./psd-api";
import "@fontsource-variable/inter";
import "../../src/styles/globals.css";
import "./style.css";

const stateLabels: Record<EditorState, string> = { initializing: "正在连接编辑器", ready: "编辑器已就绪", busy: "正在处理文档", exporting: "正在导出文件", error: "连接需要恢复", disposed: "会话已关闭" };
const mime: Record<Format, string> = { psd: "image/vnd.adobe.photoshop", png: "image/png", jpg: "image/jpeg" };
type Download = { name: string; url: string; bytes: number };

function Workspace() {
    const [dark, setDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
    const [state, setState] = useState<EditorState>("initializing");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [info, setInfo] = useState<DocumentInfo | null>(null);
    const [name, setName] = useState("");
    const [generation, setGeneration] = useState(0);
    const [closed, setClosed] = useState(false);
    const [sidebar, setSidebar] = useState(true);
    const [coverRightArea, setCoverRightArea] = useState(false);
    const [working, setWorking] = useState(false);
    const [confirmAction, setConfirmAction] = useState<"close" | "reconnect" | null>(null);
    const [downloads, setDownloads] = useState<Download[]>([]);
    const [checks, setChecks] = useState<VerificationStep[]>([]);
    const [savedSessions, setSavedSessions] = useState<PsdSession[]>([]);
    const [savedVersions, setSavedVersions] = useState<PsdVersion[]>([]);
    const [session, setSession] = useState<PsdSession | null>(null);
    const [browseSession, setBrowseSession] = useState<PsdSession | null>(null);
    const [savedParent, setSavedParent] = useState<string | null>(null);
    const [storageMessage, setStorageMessage] = useState("正在检查登录态…");
    const [saveStage, setSaveStage] = useState<string | null>(null);
    const [retrySave, setRetrySave] = useState(false);
    const [restoreTarget, setRestoreTarget] = useState<{ session: PsdSession; version: PsdVersion } | null>(null);
    const [resumeTarget, setResumeTarget] = useState<{ session: PsdSession; version: PsdVersion } | null>(null);
    const [sourceTarget, setSourceTarget] = useState<PsdSession | null>(null);
    const [projects, setProjects] = useState<EcommerceProject[]>([]);
    const [modules, setModules] = useState<EcommerceModule[]>([]);
    const [selectedProject, setSelectedProject] = useState<string | undefined>();
    const [selectedModule, setSelectedModule] = useState<string | undefined>();
    const [businessMessage, setBusinessMessage] = useState("读取现有商品并载入模块图像，精修结果仍只保存到隔离目录。");
    const [readingBusiness, setReadingBusiness] = useState(false);
    const [downloadingVersion, setDownloadingVersion] = useState<string | null>(null);
    const iframe = useRef<HTMLIFrameElement>(null);
    const input = useRef<HTMLInputElement>(null);
    const bridge = useRef<PhotopeaBridge | null>(null);
    const urls = useRef<string[]>([]);
    const operation = useRef(false);
    const source = useRef<{ buffer: ArrayBuffer; format: Format; fileName: string; requestId: string } | null>(null);
    const pendingSave = useRef<PsdSaveSnapshot | null>(null);
    const account = useRef(new AccountOperationBoundary());
    const documentMayExist = useRef(false);
    const available = state === "ready" && !working && !closed;
    const documentLabel = session?.origin ? `${session.origin.projectName} · ${session.origin.moduleName}` : name || info?.name;
    useEffect(() => {
        let active = true;
        let sequence = 0;
        const clearAccountView = () => {
            setClosed(true); setInfo(null); setName(""); setSession(null); setBrowseSession(null); setSavedParent(null); setSavedVersions([]);
            setConfirmAction(null); setRestoreTarget(null); setResumeTarget(null); setSourceTarget(null); setError(""); setNotice(""); setSaveStage(null);
            setProjects([]); setModules([]); setSelectedProject(undefined); setSelectedModule(undefined);
            source.current = null; pendingSave.current = null; setRetrySave(false);
            urls.current.forEach(URL.revokeObjectURL); urls.current = []; setDownloads([]); setChecks([]);
        };
        const refresh = async () => {
            const request = ++sequence;
            try {
                const result = await savedPsdSessions();
                if (!active || request !== sequence) return;
                if (account.current.adopt(result.userId)) clearAccountView();
                setSavedSessions(result.sessions); setStorageMessage("境彻登录态已校验 · 保存到隔离验收商品 · 额度 1 GB");
            } catch (cause) {
                if (!active || request !== sequence) return;
                setSavedSessions([]);
                if (cause instanceof ApiError && cause.status === 401 && account.current.adopt(null)) clearAccountView();
                setStorageMessage(cause instanceof Error ? cause.message : "无法读取隔离保存记录");
            }
        };
        void refresh(); window.addEventListener("focus", refresh);
        return () => { active = false; window.removeEventListener("focus", refresh); };
    }, []);
    // The embedded editor applies its theme only when a new connection is requested.
    const frameUrl = useMemo(() => `${PHOTOPEA_ORIGIN}/#${encodeURIComponent(JSON.stringify({ environment: { lang: "zh-CN", theme: dark ? 0 : 1, vmode: 0, intro: true, panels: [0, 2] } }))}`, [generation, closed]);

    useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
    useLayoutEffect(() => {
        if (closed || !iframe.current?.contentWindow) return;
        const adapter = new PhotopeaBridge(window, iframe.current.contentWindow, (next, message) => {
            setState(next);
            if (next === "ready") documentMayExist.current = true;
            if (message) setError(message);
        });
        bridge.current = adapter;
        // Layout effects install the listener before the remote frame can initialize.
        return () => { adapter.dispose(); bridge.current = null; };
        // Theme changes affect the host immediately; editor theme is applied on the next connection.
    }, [generation, closed]);
    useEffect(() => {
        const container = iframe.current?.parentElement;
        if (!container || !info || closed) return;
        const bounds = container.getBoundingClientRect();
        let width = Math.round(bounds.width), height = Math.round(bounds.height);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const observer = new ResizeObserver(([entry]) => {
            const nextWidth = Math.round(entry.contentRect.width), nextHeight = Math.round(entry.contentRect.height);
            if (nextWidth === width && nextHeight === height) return;
            width = nextWidth; height = nextHeight;
            clearTimeout(timer);
            timer = setTimeout(() => {
                const adapter = bridge.current;
                if (width > 0 && height > 0 && adapter?.state === "ready" && !operation.current) {
                    void adapter.fitView().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "画布视图调整失败。"));
                }
            }, 150);
        });
        observer.observe(container);
        return () => { observer.disconnect(); clearTimeout(timer); };
    }, [info, closed, generation]);
    useEffect(() => {
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if (documentMayExist.current) { event.preventDefault(); event.returnValue = ""; }
        };
        window.addEventListener("beforeunload", beforeUnload);
        return () => { window.removeEventListener("beforeunload", beforeUnload); urls.current.forEach(URL.revokeObjectURL); };
    }, []);

    async function run(action: (adapter: PhotopeaBridge, assertCurrent: () => void, signal: AbortSignal) => Promise<void>) {
        if (operation.current || !bridge.current) return;
        operation.current = true;
        const ticket = account.current.begin();
        setWorking(true); setError(""); setNotice("");
        try { await action(bridge.current, ticket.assertCurrent, ticket.signal); }
        catch (cause) { if (!ticket.signal.aborted) setError(cause instanceof Error ? cause.message : "操作失败，请重试。"); }
        finally { ticket.dispose(); operation.current = false; setWorking(false); }
    }
    function retain(buffer: ArrayBuffer, format: Format, fileName: string) {
        validateFile(buffer, format);
        const url = URL.createObjectURL(new Blob([buffer], { type: mime[format] }));
        urls.current.push(url);
        const entry = { name: fileName, url, bytes: buffer.byteLength };
        setDownloads((current) => [entry, ...current]);
        return entry;
    }
    function download(entry: Download) {
        const anchor = document.createElement("a"); anchor.href = entry.url; anchor.download = entry.name; anchor.click();
    }
    async function openFile(file: File) {
        await run(async (adapter, assertCurrent) => {
            if (file.size > MAX_FILE_BYTES) throw new Error("文件超过 50 MB，请使用更小的 PSD 或图片。");
            const buffer = await file.arrayBuffer();
            assertCurrent();
            const format = validateFile(buffer);
            const extension = file.name.split(".").pop()?.toLowerCase();
            if (!(extension === format || (format === "jpg" && extension === "jpeg"))) throw new Error("文件扩展名与实际内容不一致。");
            if (file.type && file.type !== mime[format] && !(format === "psd" && ["application/octet-stream", "image/psd", "application/photoshop", "application/x-photoshop"].includes(file.type))) throw new Error("文件 MIME 类型与实际内容不一致。");
            documentMayExist.current = true;
            const opened = await adapter.open(buffer);
            await adapter.fitView();
            assertCurrent();
            source.current = { buffer, format, fileName: file.name, requestId: crypto.randomUUID() }; pendingSave.current = null; setRetrySave(false);
            setSession(null); setBrowseSession(null); setSavedVersions([]); setSavedParent(null);
            setInfo(opened); setName(file.name); setNotice("文件已在编辑器中打开。原文件未被覆盖。");
        });
    }
    async function exportFile(format: Format) {
        await run(async (adapter, assertCurrent) => {
            const buffer = await adapter.export(format);
            assertCurrent();
            download(retain(buffer, format, `${(name || "精修文档").replace(/\.[^.]+$/, "")}-精修.${format}`));
            setNotice("已生成本地下载文件；未保存到商品项目。继续编辑后请重新下载。");
        });
    }
    async function loadExample() {
        try {
            const buffer = await createSample();
            await openFile(new File([buffer], "精修验收示例.png", { type: "image/png" }));
        } catch (cause) { setError(cause instanceof Error ? cause.message : "示例文件加载失败。"); }
    }
    async function downloadVersion(item: PsdSession, version: PsdVersion, format: "psd" | "png") {
        if (downloadingVersion) return;
        const ticket = account.current.begin();
        setDownloadingVersion(`${version.id}:${format}`); setError("");
        try {
            const buffer = await savedVersionFile(item.id, version.id, format, ticket.signal);
            ticket.assertCurrent();
            const entry = retain(buffer, format, `${item.fileName.replace(/\.[^.]+$/, "")}-精修-v${version.versionNumber}-${version.id.slice(-8)}.${format}`);
            download(entry);
            setNotice(`已生成隔离版本 v${version.versionNumber} 的 ${format.toUpperCase()} 下载文件，当前编辑内容未改变。`);
        } catch (cause) { if (!ticket.signal.aborted) setError(cause instanceof Error ? cause.message : "版本文件下载失败，请重试。"); }
        finally { ticket.dispose(); setDownloadingVersion(null); }
    }
    async function readProjects() {
        const ticket = account.current.begin(); setReadingBusiness(true);
        try {
            const result = await ecommerceProjects(ticket.signal); ticket.assertCurrent();
            setProjects(result.projects); setModules([]); setSelectedProject(undefined); setSelectedModule(undefined);
            setBusinessMessage(result.projects.length ? "选择商品与已出图模块，基于当前图片新建精修。" : "当前账号暂无可读取的电商商品。请先在电商设计室创建商品并生成图片。");
        } catch (cause) { if (!ticket.signal.aborted) setBusinessMessage(cause instanceof Error ? cause.message : "读取商品失败"); }
        finally { ticket.dispose(); setReadingBusiness(false); }
    }
    async function readModules(projectId: string) {
        const ticket = account.current.begin(); setReadingBusiness(true);
        setSelectedProject(projectId); setSelectedModule(undefined); setModules([]);
        try {
            const result = await ecommerceModules(projectId, ticket.signal); ticket.assertCurrent();
            setModules(result.modules);
            setBusinessMessage(result.modules.some((item) => item.assetId) ? "载入前会再次校验模块当前图片，未出图模块不可选。" : "此商品还没有已出图模块。");
        } catch (cause) { if (!ticket.signal.aborted) setBusinessMessage(cause instanceof Error ? cause.message : "读取模块失败"); }
        finally { ticket.dispose(); setReadingBusiness(false); }
    }
    async function loadBusinessModule(createNew = false) {
        const item = modules.find((item) => item.id === selectedModule);
        if (!selectedProject || !item?.assetId) return;
        await run(async (adapter, assertCurrent, signal) => {
            if (!createNew) {
                const existing = await findSavedModuleVersion(selectedProject, item.id, item.assetId!, signal);
                assertCurrent();
                if (existing) { setResumeTarget(existing); return; }
            }
            const { session: imported } = await importEcommerceModule(selectedProject, item.id, item.assetId!, crypto.randomUUID(), signal); assertCurrent();
            const buffer = await importedModuleFile(imported.id, signal); assertCurrent();
            validateFile(buffer);
            const opened = await adapter.open(buffer); await adapter.fitView(); assertCurrent();
            source.current = null; pendingSave.current = null; setRetrySave(false);
            setSession(imported); setBrowseSession(imported); setSavedParent(null); setSavedVersions([]);
            setInfo(opened); setName(imported.fileName); documentMayExist.current = true;
            setSavedSessions((items) => [imported, ...items.filter((item) => item.id !== imported.id)]);
            setNotice(`已载入「${imported.origin?.projectName} / ${imported.origin?.moduleName}」当前图像；后续保存不会修改正式商品。`);
        });
    }
    async function saveVersion() {
        let succeeded = false;
        await run(async (adapter, assertCurrent, signal) => {
            try {
                let current = session;
                if (!current) {
                    if (!source.current) throw new Error("请先通过本页导入文件或运行往返样本，建立可追踪的原始文件来源。");
                    setSaveStage("正在保存原始文件…");
                    current = (await startPsdSession(source.current.buffer, source.current.format, source.current.fileName, source.current.requestId, signal)).session;
                    assertCurrent();
                    setSession(current);
                }
                if (!pendingSave.current) {
                    setSaveStage("正在导出 PSD…"); const psd = await adapter.export("psd");
                    assertCurrent();
                    setSaveStage("正在导出预览图…"); const preview = await adapter.export("png");
                    assertCurrent();
                    pendingSave.current = { sessionId: current.id, requestId: crypto.randomUUID(), parentVersionId: savedParent, psd, preview };
                }
                setSaveStage("正在上传并持久化版本…");
                const { version } = await persistPsdVersion(pendingSave.current, signal);
                assertCurrent();
                pendingSave.current = null; setRetrySave(false); setSavedParent(version.id);
                setBrowseSession(current);
                setSavedVersions((current) => [version, ...current.filter((item) => item.sessionId === version.sessionId && item.id !== version.id)]);
                setSavedSessions((items) => [current!, ...items.filter((item) => item.id !== current!.id)]);
                setNotice(`隔离版本 v${version.versionNumber} 已保存。正式商品预览未回写；继续编辑后需要再次保存。`);
                succeeded = true;
            } catch (cause) { assertCurrent(); setRetrySave(!!pendingSave.current); throw cause; }
            finally { setSaveStage(null); }
        });
        return succeeded;
    }
    async function showVersions(item: PsdSession) {
        const ticket = account.current.begin();
        try {
            const result = await savedPsdVersions(item.id, ticket.signal);
            ticket.assertCurrent();
            setSavedVersions(result.versions);
            setBrowseSession(item);
        } catch (cause) { if (!ticket.signal.aborted) setError(cause instanceof Error ? cause.message : "版本读取失败"); }
        finally { ticket.dispose(); }
    }
    async function restoreVersion(item: PsdSession, version: PsdVersion) {
        setRestoreTarget(null);
        await run(async (adapter, assertCurrent, signal) => {
            const { versions } = await savedPsdVersions(item.id, signal);
            assertCurrent();
            const buffer = await savedVersionFile(item.id, version.id, "psd", signal);
            assertCurrent();
            validateFile(buffer, "psd");
            const restored = await adapter.open(buffer); await adapter.fitView();
            assertCurrent();
            setInfo(restored); setName(item.fileName); setSession(item); setBrowseSession(item); setSavedParent(version.id);
            setSavedVersions(versions);
            source.current = null; pendingSave.current = null; setRetrySave(false);
            documentMayExist.current = true;
            setNotice(`已打开隔离版本 v${version.versionNumber}，再次保存会新增版本。`);
        });
    }
    async function restoreSource(item: PsdSession) {
        setSourceTarget(null);
        await run(async (adapter, assertCurrent, signal) => {
            const { versions } = await savedPsdVersions(item.id, signal);
            assertCurrent();
            const buffer = await importedModuleFile(item.id, signal);
            assertCurrent();
            validateFile(buffer, item.sourceFormat as Format);
            const opened = await adapter.open(buffer); await adapter.fitView();
            assertCurrent();
            setInfo(opened); setName(item.fileName); setSession(item); setBrowseSession(item);
            setSavedVersions(versions); setSavedParent(null);
            source.current = null; pendingSave.current = null; setRetrySave(false);
            documentMayExist.current = true;
            setNotice("已打开导入时保留的原文件，已有精修版本未改变。再次保存会新增版本；正式商品预览未回写。");
        });
    }
    function requestAction(action: "close" | "reconnect") {
        if (documentMayExist.current) setConfirmAction(action);
        else performAction(action);
    }
    function performAction(action: "close" | "reconnect") {
        setConfirmAction(null); setInfo(null); setName(""); setError(""); documentMayExist.current = false;
        source.current = null; pendingSave.current = null; setRetrySave(false); setSession(null); setSavedParent(null);
        if (action === "close") setClosed(true);
        else { setClosed(false); setState("initializing"); setGeneration((value) => value + 1); }
    }
    async function roundtrip() {
        await run(async (adapter, assertCurrent) => {
            setChecks([]);
            const png = await createSample();
            assertCurrent();
            source.current = { buffer: png, format: "png", fileName: "phase0-source.png", requestId: crypto.randomUUID() };
            setSession(null); setBrowseSession(null); setSavedVersions([]); setSavedParent(null); pendingSave.current = null; setRetrySave(false);
            documentMayExist.current = true;
            const { report, document } = await verifyRoundtrip(adapter, png, (steps) => { assertCurrent(); setChecks(steps); }, (buffer, format, fileName) => { assertCurrent(); retain(buffer, format, fileName); });
            assertCurrent();
            if (document) { setInfo(document); setName(document.name); }
            const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob); urls.current.push(url);
            setDownloads((current) => [{ name: `phase0-verification-${report.status}-${Date.now()}.json`, url, bytes: blob.size }, ...current]);
            if (report.status === "failed") {
                const failed = report.steps.find((step) => step.status === "failed");
                throw new Error(`${failed?.label ?? "往返验收"}：${failed?.error ?? "未通过"}。可下载验收报告查看停在哪一步。`);
            }
            await adapter.fitView();
            setNotice("本次受控样本往返验收已通过，报告与文件可从下载记录获取。此结果不代表复杂 PSD 兼容性或项目保存已通过。");
        });
    }

    return <ConfigProvider theme={getAntThemeConfig(dark)}>
        <div className="psd-lab">
            <header className="lab-header">
                <div className="lab-brand"><Button aria-label={sidebar ? "收起文件面板" : "展开文件面板"} aria-pressed={sidebar} onClick={() => setSidebar(!sidebar)} icon={sidebar ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />} /><FileStack size={21} aria-hidden="true" /><strong>境彻</strong><span className="brand-divider" /><span>电商设计室</span><span className="lab-badge"><FlaskConical size={13} aria-hidden="true" />隔离实验</span><h1 className="sr-only">PSD 精修</h1></div>
                <div className="toolbar-actions" role="group" aria-label="PSD 编辑工具栏">
                    <Button disabled={!available} icon={<ArrowUpFromLine size={15} />} onClick={() => input.current?.click()}>导入文件</Button>
                    <Tooltip title="仅保存到本机后端的隔离验收商品，不回写正式项目"><Button disabled={!available || (!info && !retrySave)} onClick={() => void saveVersion()}>{retrySave ? "重试上次保存" : "保存隔离版本"}</Button></Tooltip>
                    <Dropdown disabled={!available} menu={{ items: [{ key: "psd", label: "下载 PSD · 保留图层" }, { key: "png", label: "下载 PNG · 透明背景" }, { key: "jpg", label: "下载 JPG" }], onClick: ({ key }) => void exportFile(key as Format) }}><Button type="primary" disabled={!available} icon={<ArrowDownToLine size={15} />}>导出文件<ChevronDown size={13} /></Button></Dropdown>
                    <Button aria-label="全屏编辑工作区" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => setError("浏览器无法退出全屏。")); else void document.documentElement.requestFullscreen().catch(() => setError("浏览器无法进入全屏。")); }} icon={<Maximize2 size={16} />} />
                    <Button aria-label="关闭编辑会话" disabled={working || closed} onClick={() => requestAction("close")} icon={<X size={16} />} />
                    <Tooltip title="外层主题即时切换；编辑器主题在重新连接后应用"><Button aria-label={dark ? "切换浅色主题" : "切换深色主题"} aria-pressed={dark} onClick={() => setDark(!dark)} icon={dark ? <Sun size={16} /> : <Moon size={16} />} /></Tooltip>
                </div>
            </header>
            <input ref={input} className="file-input" aria-label="选择 PSD、PNG 或 JPG 文件" type="file" accept=".psd,.png,.jpg,.jpeg" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void openFile(file); }} />
            <div className={`lab-body ${sidebar ? "" : "is-collapsed"}`}>
                {sidebar && <aside className="file-panel" aria-label="文件与验收记录">
                    <div className="panel-intro"><span className="panel-eyebrow" role="status">{closed ? "会话已关闭" : stateLabels[state]}</span><h2>从一张图，<br />继续你的设计。</h2><p>保留原始文件，在专业编辑器中调整图层、文字与排版。</p></div>
                    <Button block disabled={!available} icon={<ArrowUpFromLine size={16} />} onClick={() => input.current?.click()}>打开 PSD 或图片</Button><p className="file-hint">PSD / PNG / JPG · 单文件 ≤ 50 MB</p>
                    {session && <Button block disabled={!available} onClick={() => setSourceTarget(session)}>打开导入时原文件</Button>}
                    <details className="acceptance" open><summary>从商品模块载入</summary><p>{businessMessage}</p><Button block disabled={working || readingBusiness} loading={readingBusiness} onClick={() => void readProjects()}>读取电商商品</Button><label className="business-field"><span>商品</span><Select aria-label="选择电商商品" placeholder="先读取商品列表" value={selectedProject} disabled={working || readingBusiness || !projects.length} onChange={(value) => void readModules(value)} options={projects.map((item) => ({ value: item.id, label: item.name }))} /></label><label className="business-field"><span>模块</span><Select aria-label="选择商品模块" placeholder="选择已出图模块" value={selectedModule} disabled={working || readingBusiness || !modules.length} onChange={setSelectedModule} options={modules.map((item) => ({ value: item.id, label: `${item.title}${item.assetId ? "" : " · 未出图"}`, disabled: !item.assetId }))} /></label><Button block disabled={!available || readingBusiness || !selectedModule} onClick={() => void loadBusinessModule()}>基于当前模块图新建精修</Button></details>
                    <div className="panel-section"><h3>当前文档</h3>{info ? <><div className="document-card"><FileImage size={22} aria-hidden="true" /><div><strong title={documentLabel}>{documentLabel}</strong><span>{info.width} × {info.height} px</span></div></div>{session?.origin && <p>来源：{session.origin.projectName} / {session.origin.moduleName}<br />原文件：{name}<br />{session.origin.sourceVersionId ? "已关联源生成版本" : "源图暂无生成版本记录"}<br />{savedParent ? "已打开或保存隔离版本；后续修改需再次保存。" : "当前从导入原文件开始；编辑后需保存为新版本。"}</p>}<p>可能有未下载的修改。下载后继续编辑，也请重新导出。</p></> : <p>导入文件后，在此查看文档信息。也可以直接使用编辑器的「文件 → 打开」。</p>}<p>普通图片是合成位图；新增文字可以保留为真实图层。</p></div>
                    <details className="acceptance" open><summary>隔离保存与恢复</summary><p>{storageMessage}</p>
                        {!savedSessions.length && <div className="saved-empty"><p>还没有已保存的文件。先导入图片或载入示例，再点击顶部「保存隔离版本」。之前的往返验收只生成临时下载文件，不会自动保存到这里。</p><Button block disabled={!available} onClick={() => void loadExample()} icon={<FileImage size={15} />}>载入示例文件</Button></div>}
                        {retrySave && <><p>重试会提交上次导出的固定快照。若要保存最新编辑，请先取消本次重试。</p><Button size="small" disabled={working} onClick={() => { pendingSave.current = null; setRetrySave(false); }}>取消本次重试</Button></>}
                        <ul className="saved-session-list">{savedSessions.map((item) => <li key={item.id}><Button block size="small" disabled={working} title={item.origin ? `${item.origin.projectName} / ${item.origin.moduleName}` : item.fileName} onClick={() => void showVersions(item)}>{item.origin ? `${item.origin.projectName} · ${item.origin.moduleName}` : item.fileName}</Button></li>)}</ul>
                        {browseSession && <><p>浏览会话：{browseSession.fileName}</p><p>下方下载的是已保存版本，不包含尚未保存的编辑。JPG 可打开版本后，从顶部「导出文件」下载。</p><ul className="saved-session-list">{savedVersions.map((version) => <li key={version.id} className="saved-version"><Button block size="small" disabled={!available} onClick={() => setRestoreTarget({ session: browseSession, version })}>打开 v{version.versionNumber}{version.id === savedParent ? " · 当前来源" : ""}</Button><div className="saved-version-downloads" role="group" aria-label={`版本 v${version.versionNumber} 下载`}>{(["psd", "png"] as const).map((format) => <Button key={format} size="small" disabled={!!downloadingVersion} loading={downloadingVersion === `${version.id}:${format}`} aria-label={`下载版本 v${version.versionNumber} ${format.toUpperCase()}`} icon={<ArrowDownToLine size={13} />} onClick={() => void downloadVersion(browseSession, version, format)}>{format.toUpperCase()}</Button>)}</div></li>)}</ul>{!savedVersions.length && <p>此会话尚无已保存的精修版本。</p>}</>}
                    </details>
                    <div className="panel-section"><div className="section-title"><h3>本地下载记录</h3><span>{downloads.length}</span></div>{downloads.length ? <ul className="download-list">{downloads.map((entry) => <li key={entry.url}><a href={entry.url} download={entry.name}><ArrowDownToLine size={14} aria-hidden="true" /><span>{entry.name}<small>{(entry.bytes / 1024).toFixed(1)} KB</small></span></a></li>)}</ul> : <p>导出后可再次下载。刷新页面后记录清空，已下载的文件保留在电脑中。</p>}</div>
                    <details className="acceptance"><summary>Phase 0 往返验收</summary><p>使用本地生成的 900 × 1100 测试图片，验证文字修改写入 PSD、图片解码与再次打开。会新增测试文档，并生成文件及验收报告。</p><Button block disabled={!available} onClick={() => void roundtrip()} icon={<FlaskConical size={15} />}>运行往返验证</Button><ol aria-live="polite">{checks.map((check) => <li key={check.label}>{check.status === "passed" ? <Check size={13} aria-hidden="true" /> : <span>{check.status === "failed" ? "失败" : "进行中"}</span>}<span>{check.label}{check.error && <small>{check.error}</small>}</span></li>)}</ol></details>
                    <div className="panel-bottom"><FlaskConical size={15} aria-hidden="true" /><span>Phase 0 · 独立验证<br />现有业务入口保持原样</span></div>
                </aside>}
                <main className="editor-area" aria-label="Photopea 编辑区域">
                    {error && <div className="editor-message"><Alert type="error" showIcon title={error} action={<Button size="small" disabled={working} onClick={() => retrySave ? void saveVersion() : requestAction("reconnect")}>{retrySave ? "重试保存" : "重新连接"}</Button>} /></div>}
                    {notice && <div className="editor-message"><Alert type="info" showIcon title={notice} closable afterClose={() => setNotice("")} /></div>}
                    <div className="mobile-notice"><FileStack size={28} aria-hidden="true" /><h2>请在桌面端继续精修</h2><p>图层编辑需要更大的工作空间。已导出的文件仍可在左侧下载。</p></div>
                    {closed ? <div className="editor-empty"><FileStack size={40} aria-hidden="true" /><h2>编辑会话已关闭</h2><p>本地下载记录仍然可用。重新连接后可导入文件继续。</p><Button onClick={() => performAction("reconnect")} icon={<RefreshCw size={15} />}>重新打开编辑器</Button></div> : <div className="frame-container">
                        <iframe key={generation} ref={iframe} src={frameUrl} inert={working} title="Photopea PSD 精修编辑器" referrerPolicy="no-referrer" onLoad={() => { void bridge.current?.checkConnection().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "编辑器连接检测失败，请重新连接。")); }} />
                        {coverRightArea && <div className="right-area-cover" aria-hidden="true" />}
                        {working && <div className="operation-overlay" role="status">{saveStage ?? "正在处理文档，请稍候…"}</div>}
                        {state === "initializing" && <div className="connection-overlay"><div className="connection-placeholder" /><FileStack size={32} aria-hidden="true" /><h2>正在准备精修工作区</h2><p>连接 Photopea 官方编辑器，首次加载可能需要一些时间。</p><Button onClick={() => requestAction("reconnect")} icon={<RefreshCw size={14} />}>重新连接</Button></div>}
                    </div>}
                    <footer className="editor-footer"><div className="view-controls" aria-label="画布视图控制"><Button size="small" disabled={!available} onClick={() => void run(async (adapter) => adapter.fitView())} icon={<Scan size={14} />}>适合窗口</Button><Tooltip title="向上查看画布"><Button size="small" aria-label="向上查看画布" disabled={!available} onClick={() => void run(async (adapter) => adapter.panVertical(-1))} icon={<ArrowUp size={14} />} /></Tooltip><Tooltip title="向下查看画布"><Button size="small" aria-label="向下查看画布" disabled={!available} onClick={() => void run(async (adapter) => adapter.panVertical(1))} icon={<ArrowDown size={14} />} /></Tooltip><Button size="small" aria-pressed={coverRightArea} title="仅遮挡右侧约 300px；如挡住工具，可在此恢复显示。" onClick={() => setCoverRightArea((value) => !value)}>{coverRightArea ? "显示右侧区域" : "遮挡右侧区域"}</Button><span>画布内滚轮上下移动 · 按住空格拖动画布</span></div><span>隔离保存不回写正式商品 · 未保存修改请下载</span></footer>
                </main>
            </div>
            <AppModal open={!!confirmAction} title="当前编辑内容可能尚未保存" onCancel={() => setConfirmAction(null)} footer={<><Button onClick={() => setConfirmAction(null)}>继续编辑</Button><Button disabled={!available} onClick={async () => { await exportFile("psd"); setConfirmAction(null); }}>先下载 PSD</Button><Button disabled={!available || !info} onClick={async () => { if (await saveVersion() && confirmAction) performAction(confirmAction); }}>保存后{confirmAction === "close" ? "关闭" : "重连"}</Button><Button danger onClick={() => confirmAction && performAction(confirmAction)}>放弃当前会话并{confirmAction === "close" ? "关闭" : "重连"}</Button></>}><p>无法精确感知 Photopea 内的全部修改，页面会保守提醒。已保存的隔离版本可以恢复；尚未保存或下载的修改在关闭后无法恢复。</p></AppModal>
            <AppModal open={!!restoreTarget} title="打开已保存版本" onCancel={() => setRestoreTarget(null)} onOk={() => restoreTarget && void restoreVersion(restoreTarget.session, restoreTarget.version)} okText="打开此版本"><p>会打开新的 PSD 文档，不覆盖原文件。若当前编辑还没有保存，请先取消并保存或下载。再次保存会从所选版本新增分支版本。</p></AppModal>
            <AppModal open={!!resumeTarget} title="此来源已有保存的精修版本" onCancel={() => setResumeTarget(null)} footer={<><Button onClick={() => setResumeTarget(null)}>取消</Button><Button disabled={!available} onClick={() => { setResumeTarget(null); void loadBusinessModule(true); }}>基于当前模块图新建</Button><Button type="primary" disabled={!available} onClick={() => { const target = resumeTarget; setResumeTarget(null); if (target) void restoreVersion(target.session, target.version); }}>继续编辑已保存版本</Button></>}><p>{resumeTarget?.session.origin?.projectName} / {resumeTarget?.session.origin?.moduleName}</p><p>找到隔离版本 v{resumeTarget?.version.versionNumber}。继续编辑会打开此会话的已保存 PSD；新建会从模块当前图片开始，保留已有版本。当前未保存内容请先取消并保存或下载。</p></AppModal>
            <AppModal open={!!sourceTarget} title="打开导入时保留的原文件" onCancel={() => setSourceTarget(null)} onOk={() => sourceTarget && void restoreSource(sourceTarget)} okText="打开原文件"><p>{sourceTarget?.origin ? `${sourceTarget.origin.projectName} / ${sourceTarget.origin.moduleName}` : sourceTarget?.fileName}</p><p>将打开这次会话导入时保存的原文件，已有精修版本保留。它可能与正式模块现在的图片不同；本操作不修改正式商品预览。</p><p>当前未保存的修改请先取消并保存或下载。打开原文件后再次保存，会从原文件新增版本。</p></AppModal>
        </div>
    </ConfigProvider>;
}

const root = import.meta.hot?.data.root ?? createRoot(document.getElementById("root")!);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<Workspace />);
