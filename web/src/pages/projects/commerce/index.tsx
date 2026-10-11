import { useEffect, useRef, useState } from "react";
import { ImagePlus, X, Plus, History, Pencil } from "lucide-react";
import { Button, Switch } from "antd";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { ModelPicker } from "@/components/model-picker";
import { useUserStore } from "@/stores/use-user-store";
import { selectableModelsByCapability, useEffectiveConfig } from "@/stores/use-config-store";
import { modelCapabilityConfigFor } from "@/lib/model-capabilities";
import { commerceDraftStorage, emptyCommerceDraft, readProductReference, type CommerceDraft, type ProductReference } from "./draft";
import { Field, ProductPreview, ReferenceImage, WorkbenchHeader } from "./workbench-components";
import { PlatformPicker, PlatformRules } from "./platform-picker";
import { LanguagePicker } from "./language-picker";
import { checkPlatformSettings, compileCommerceBrief, platformRule, preferredPlatformSize, resolvePlatform, standardsCheckedAt } from "./platform-standards";
import "./commerce.css";
import { GenerationPanel } from "./generation-panel";
import { UploadSource } from "./upload-source";
import { AssetLibraryPickerModal, type AssetLibraryPickerItem } from "@/components/assets/asset-library-picker-modal";
import { useAssetStore } from "@/stores/use-asset-store";
import { getImageBlob } from "@/services/image-storage";
import { resolveResourceUrl } from "@/services/api/resources";
import { generatedImageMime } from "./generation-policy";
import { commerceHistory, commerceSessions, commerceSessionKey, commerceWorkspace, type CommerceEditingTask, type CommerceRecord } from "./history";
import type { GenerationTask } from "@/services/api/task-center";
import { AppModal } from "@/components/ui/product/app-modal";
import type { CommercePlanning } from "./design-plan";

function CommerceWorkbench({ userId }: { userId: string }) {
    const config = useEffectiveConfig();
    const [draft, setDraft] = useState<CommerceDraft>(emptyCommerceDraft);
    const [ready, setReady] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setErrorValue] = useState("");
    const [errorMessages, setErrorMessages] = useState<string[]>([]);
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [active, setActive] = useState("");
    const [submitSlot, setSubmitSlot] = useState<HTMLDivElement | null>(null);
    const [movingReference, setMovingReference] = useState("");
    const referenceDrag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
    const [mobileView, setMobileView] = useState("settings");
    const [copyStatus, setCopyStatus] = useState("");
    const [generating, setGenerating] = useState(false);
    const [stage, setStage] = useState(0);
    const [sourceOpen, setSourceOpen] = useState(false);
    const [assetsOpen, setAssetsOpen] = useState(false);
    const [records, setRecords] = useState<CommerceRecord[]>([]);
    const [selectedTask, setSelectedTask] = useState("");
    const [generationView, setGenerationView] = useState(0);
    const [switching, setSwitching] = useState(false);
    const [editingTasks, setEditingTasks] = useState<CommerceEditingTask[]>([]);
    const [editingId, setEditingId] = useState("");
    const [deleteTarget, setDeleteTarget] = useState<{ editingId?: string; taskId?: string }>();
    const editingRef = useRef<CommerceEditingTask[]>([]);
    const workspaceWrites = useRef(Promise.resolve());
    const historyRef = useRef<CommerceRecord[]>([]);
    const historyWrites = useRef(Promise.resolve());
    const assets = useAssetStore((state) => state.assets);
    const assetItems: AssetLibraryPickerItem[] = assets
        .filter((asset) => asset.kind === "image" && asset.status !== "archived")
        .map((asset) => ({ id: asset.id, title: asset.title, category: asset.category || "other", kindLabel: "图片", mediaKind: "image", asset }));
    const fileInput = useRef<HTMLInputElement>(null);
    const alive = useRef(true);
    const ingesting = useRef(false);
    const editRevision = useRef(0);
    const models = selectableModelsByCapability(config, "image");
    const analysisModels = selectableModelsByCapability(config, "text");
    const visionModels = analysisModels.filter((name) => (modelCapabilityConfigFor(config, name).text?.references.maxImages || 0) > 0);
    const analysisModel = analysisModels.includes(draft.analysisModel || "")
        ? draft.analysisModel!
        : visionModels.includes(config.textModel)
          ? config.textModel
          : visionModels[0] || (analysisModels.includes(config.textModel) ? config.textModel : analysisModels[0]) || "";
    const analysisImageLimit = analysisModel ? modelCapabilityConfigFor(config, analysisModel).text?.references.maxImages || 0 : 0;
    const model = models.includes(draft.model) ? draft.model : models.includes(config.imageModel) ? config.imageModel : models[0] || "";
    const profile = model ? modelCapabilityConfigFor(config, model).image : undefined;
    const sizes = profile?.size.values.filter((value) => value !== "*") || [];
    const qualities = profile?.quality.supported ? profile.quality.values : [];
    const size = sizes.includes(draft.size) ? draft.size : profile?.size.default || sizes[0] || "";
    const quality = qualities.includes(draft.quality) ? draft.quality : profile?.quality.default || qualities[0] || "";
    const countOptions = Array.from({ length: 8 }, (_, index) => String(index + 1));
    const count = countOptions.includes(draft.count) ? draft.count : countOptions[countOptions.length - 1];
    const maxImages = profile ? Math.min(8, Math.max(0, profile.references.maxImages)) : 8;
    const byteLimit = Math.min(5 * 1024 * 1024, profile?.references.maxImageBytes || 5 * 1024 * 1024);
    const current = draft.references.find((reference) => reference.id === active) || draft.references[0];
    const matching = resolvePlatform(draft.platform, draft.requirements);
    const rule = platformRule(matching.platform, draft.platformRule);
    const recommendedSize = preferredPlatformSize(rule, sizes);
    const issues = checkPlatformSettings(rule, size, [draft.requirements, draft.sellingPoints, draft.style].join("\n"));
    const merchantRules = draft.merchantPlatformRules?.[matching.platform.id] || "";
    const brief = compileCommerceBrief({ ...draft, platform: matching.platform, rule, size, count, merchantRules });
    function showFailure(message: string) {
        if (!message || !alive.current || useUserStore.getState().user?.id !== userId) return;
        setErrorMessages((previous) => [...new Set([...previous, ...message.split("；").filter(Boolean)])]);
    }
    function setError(message: string) {
        setErrorValue(message);
        showFailure(message);
    }
    useEffect(() => {
        alive.current = true;
        let cancelled = false;
        Promise.all([commerceDraftStorage.read(userId), commerceHistory.read(userId), commerceSessions.getItem<{ taskId: string }>(commerceSessionKey(userId)), commerceWorkspace.read(userId)])
            .then(async ([value, history, session, workspace]) => {
                if (cancelled) return;
                historyRef.current = history;
                setRecords(history);
                const restored = history.find((record) => record.taskId === session?.taskId)?.draft || value;
                const tasks = workspace?.tasks.length ? workspace.tasks : [{ id: crypto.randomUUID(), draft: restored || { ...emptyCommerceDraft }, session: history.find((record) => record.taskId === session?.taskId) }];
                const selected = tasks.find((item) => item.id === workspace?.activeId) || tasks[0];
                if (selected.session) await commerceSessions.setItem(commerceSessionKey(userId), selected.session);
                else if (workspace) await commerceSessions.removeItem(commerceSessionKey(userId));
                if (cancelled) return;
                editingRef.current = tasks;
                setEditingTasks(tasks);
                setEditingId(selected.id);
                setSelectedTask(selected.session?.taskId || (!workspace ? session?.taskId : "") || "");
                setDraft(selected.draft);
                setSaved(selected.draft === value);
            })
            .catch(() => {
                if (!cancelled) setError("无法恢复本地草稿，仍可填写；请检查浏览器存储权限。");
            })
            .finally(() => {
                if (!cancelled) setReady(true);
            });
        return () => {
            cancelled = true;
            alive.current = false;
        };
    }, [userId]);
    function saveWorkspace(next: CommerceEditingTask[], activeId: string) {
        editingRef.current = next;
        setEditingTasks(next);
        const write = workspaceWrites.current.then(() => commerceWorkspace.save(userId, next, activeId)).then(() => undefined);
        workspaceWrites.current = write.catch(() => undefined);
        return write;
    }
    useEffect(() => {
        if (!ready || !editingId || switching) return;
        const timer = window.setTimeout(() => {
            const next = editingRef.current.map((item) => (item.id === editingId ? { ...item, draft } : item));
            const revision = editRevision.current;
            void saveWorkspace(next, editingId)
                .then(() => {
                    if (alive.current && revision === editRevision.current) setSaved(true);
                })
                .catch(() => {
                    if (alive.current) setError("任务草稿未能保存到此浏览器，当前填写内容仍保留。");
                });
        }, 250);
        return () => window.clearTimeout(timer);
    }, [draft, editingId, ready, switching, userId]);
    function storeHistory(next: CommerceRecord[]) {
        historyRef.current = next;
        setRecords(next);
        const write = historyWrites.current.then(() => commerceHistory.save(userId, next)).then(() => undefined);
        historyWrites.current = write.catch(() => undefined);
        return write;
    }
    async function recordTask(record: CommerceRecord) {
        if (!alive.current || useUserStore.getState().user?.id !== userId) return;
        setSelectedTask(record.taskId);
        await storeHistory([record, ...historyRef.current.filter((item) => item.taskId !== record.taskId)]);
        if (editingId)
            await saveWorkspace(
                editingRef.current.map((item) => (item.id === editingId ? { ...item, draft: record.draft, session: record } : item)),
                editingId,
            );
    }
    async function recordPlanning(planning: CommercePlanning) {
        if (!alive.current || useUserStore.getState().user?.id !== userId) return;
        if (!planning.design) {
            await commerceSessions.removeItem(commerceSessionKey(userId));
            setSelectedTask("");
        }
        await saveWorkspace(
            editingRef.current.map((item) => (item.id === editingId ? { ...item, draft, planning, ...(!planning.design ? { session: undefined } : {}) } : item)),
            editingId,
        );
    }
    function updateTaskStatus(task: GenerationTask) {
        const record = historyRef.current.find((item) => item.taskId === task.id);
        if (!record || record.status === task.status) return;
        void storeHistory(historyRef.current.map((item) => (item.taskId === task.id ? { ...item, status: task.status } : item))).catch(() => {
            if (alive.current) setError("生成记录状态未能保存到此浏览器，可重新读取任务获取最新状态。");
        });
    }
    async function selectTask(record?: CommerceRecord, editing?: CommerceEditingTask) {
        if (locked) return;
        setSwitching(true);
        setError("");
        try {
            let tasks = editingRef.current.map((item) => (item.id === editingId ? { ...item, draft } : item));
            if (record && !editing) {
                const taskId = record.taskId;
                editing = tasks.find((item) => item.session?.taskId === taskId);
                if (!editing) {
                    editing = { id: crypto.randomUUID(), draft: record.draft, session: record };
                    tasks = [...tasks, editing];
                }
            }
            if (!record && !editing) {
                editing = { id: crypto.randomUUID(), draft: { ...emptyCommerceDraft, model } };
                tasks = [...tasks, editing];
            }
            await saveWorkspace(tasks, editing?.id || "");
            record = editing?.session || record;
            if (record) await commerceSessions.setItem(commerceSessionKey(userId), record);
            else await commerceSessions.removeItem(commerceSessionKey(userId));
            if (!alive.current || useUserStore.getState().user?.id !== userId) return;
            setSelectedTask(record?.taskId || "");
            setEditingId(editing?.id || "");
            setDraft(editing?.draft || record?.draft || { ...emptyCommerceDraft, model });
            setActive("");
            setSaved(false);
            editRevision.current += 1;
            setGenerationView((value) => value + 1);
            setMobileView(record ? "preview" : "settings");
        } catch {
            if (alive.current) setError("无法切换本地生成记录，请检查浏览器存储后重试。");
        } finally {
            if (alive.current) setSwitching(false);
        }
    }
    async function deleteTask() {
        if (!deleteTarget || locked) return;
        setSwitching(true);
        setError("");
        const targetTaskId = deleteTarget.taskId || editingRef.current.find((item) => item.id === deleteTarget.editingId)?.session?.taskId;
        const deletingActive = deleteTarget.editingId === editingId || (!!targetTaskId && targetTaskId === selectedTask);
        let next = editingRef.current.filter((item) => item.id !== deleteTarget.editingId && (!targetTaskId || item.session?.taskId !== targetTaskId)).map((item) => (item.id === editingId ? { ...item, draft } : item));
        if (!next.length) next = [{ id: crypto.randomUUID(), draft: { ...emptyCommerceDraft, model } }];
        const selected = next.find((item) => item.id === editingId) || next[0];
        try {
            await saveWorkspace(next, selected.id);
            await storeHistory(historyRef.current.filter((record) => record.taskId !== targetTaskId));
            if (deletingActive) {
                if (selected.session) await commerceSessions.setItem(commerceSessionKey(userId), selected.session);
                else await commerceSessions.removeItem(commerceSessionKey(userId));
                await commerceDraftStorage.save(userId, selected.draft);
            }
            if (!alive.current || useUserStore.getState().user?.id !== userId) return;
            if (deletingActive) {
                setEditingId(selected.id);
                setSelectedTask(selected.session?.taskId || "");
                setDraft(selected.draft);
                setActive("");
                setCopyStatus("");
                setSaved(true);
                editRevision.current += 1;
                setGenerationView((value) => value + 1);
                setMobileView(selected.session ? "preview" : "settings");
            }
            setDeleteTarget(undefined);
        } catch {
            if (alive.current) setError("任务记录未能完整删除，请检查浏览器存储后重试。");
        } finally {
            if (alive.current) setSwitching(false);
        }
    }
    function update<K extends keyof CommerceDraft>(key: K, value: CommerceDraft[K]) {
        if (!ready || saving || uploading || generating || switching) return;
        editRevision.current += 1;
        setDraft((previous) => ({ ...previous, [key]: value }));
        setSaved(false);
        setCopyStatus("");
    }
    function moveReference(id: string, targetId: string) {
        const index = draft.references.findIndex((item) => item.id === id);
        const target = draft.references.findIndex((item) => item.id === targetId);
        if (index < 0 || target < 0 || index === target) return;
        const references = [...draft.references];
        references.splice(target, 0, ...references.splice(index, 1));
        update("references", references);
    }
    async function addFiles(files: File[]) {
        if (ingesting.current || !ready || saving || generating || switching || !files.length) return;
        ingesting.current = true;
        setUploading(true);
        setError("");
        const available = Math.max(0, maxImages - draft.references.length);
        const errors: string[] = files.length > available ? [`最多可添加 ${maxImages} 张产品图，超出的图片未添加。`] : [];
        const additions: ProductReference[] = [];
        for (const file of files.slice(0, available)) {
            try {
                additions.push(await readProductReference(file, byteLimit));
            } catch (reason) {
                errors.push(reason instanceof Error ? reason.message : "无法读取图片");
            }
        }
        if (alive.current) {
            editRevision.current += 1;
            setDraft((previous) => ({ ...previous, references: [...previous.references, ...additions] }));
            setSaved(false);
            setError(errors.join("；"));
            setUploading(false);
        }
        ingesting.current = false;
    }
    async function save() {
        const savedRevision = editRevision.current;
        setSaving(true);
        setError("");
        try {
            await commerceDraftStorage.save(userId, { ...draft, model, size, quality, count, platformPlan: { platformId: matching.platform.id, ruleId: rule?.id, checkedAt: standardsCheckedAt, brief, issues } });
            await saveWorkspace(
                editingRef.current.map((item) => (item.id === editingId ? { ...item, draft } : item)),
                editingId,
            );
            if (alive.current) setSaved(savedRevision === editRevision.current);
        } catch {
            if (alive.current) setError("草稿保存失败，请检查浏览器存储空间后重试。当前内容仍保留在页面中。");
        } finally {
            if (alive.current) setSaving(false);
        }
    }
    async function selectAssets(ids: string[], availableItems: AssetLibraryPickerItem[] = []) {
        if (locked || ingesting.current) return;
        const selected = ids.map((id) => availableItems.find((item) => item.id === id));
        if (selected.some((item) => !item)) throw new Error("部分图片已不存在，请重新选择。");
        const items = selected.filter((item) => !draft.references.some((reference) => reference.id === `asset:${item?.id}`));
        if (items.length > maxImages - draft.references.length) throw new Error(`还可添加 ${Math.max(0, maxImages - draft.references.length)} 张图片，请减少选择。`);
        ingesting.current = true;
        setUploading(true);
        const additions: ProductReference[] = [];
        try {
            for (const item of items) {
                const asset = item?.asset;
                if (!asset || asset.kind !== "image" || asset.status === "archived") throw new Error("只能选择有效的图片资产。");
                if (draft.references.some((reference) => reference.id === `asset:${asset.id}`)) continue;
                let blob = asset.data.storageKey ? await getImageBlob(asset.data.storageKey) : null;
                if (!blob) {
                    const url = resolveResourceUrl(asset.data.storageKey, asset.data.dataUrl || asset.coverUrl);
                    if (!url) throw new Error(`${asset.title}：图片资源不存在`);
                    const response = await fetch(url, { credentials: "same-origin" });
                    if (!response.ok) throw new Error(`${asset.title}：读取失败（HTTP ${response.status}）`);
                    blob = await response.blob();
                }
                if (blob.size > byteLimit) throw new Error(`${asset.title}：图片超过当前大小限制`);
                const mime = generatedImageMime(new Uint8Array(await blob.slice(0, 12).arrayBuffer()));
                if (!mime) throw new Error(`${asset.title}：仅支持 JPG、PNG、WEBP`);
                const reference = await readProductReference(new File([blob], asset.title || "产品图", { type: mime }), byteLimit);
                additions.push({ ...reference, id: `asset:${asset.id}` });
            }
            if (!alive.current || useUserStore.getState().user?.id !== userId) return;
            editRevision.current += 1;
            setDraft((value) => ({ ...value, references: [...value.references, ...additions] }));
            setSaved(false);
            setAssetsOpen(false);
        } finally {
            ingesting.current = false;
            if (alive.current) setUploading(false);
        }
    }
    const locked = !ready || saving || uploading || generating || switching;
    return (
        <WorkspacePage className="commerce-page">
            <div className="commerce-workbench">
                <WorkbenchHeader saved={saved} saving={saving} locked={locked} dirty={editRevision.current > 0} onSave={save} stage={stage} />
                <div className="commerce-mobile-views" role="group" aria-label="工作台视图">
                    <button type="button" aria-pressed={mobileView === "settings"} aria-controls="commerce-form" onClick={() => setMobileView("settings")}>
                        创作设置
                    </button>
                    <button type="button" aria-pressed={mobileView === "preview"} aria-controls="commerce-preview" onClick={() => setMobileView("preview")}>
                        生成与预览{draft.references.length ? ` · ${draft.references.length}` : ""}
                    </button>
                    <button type="button" aria-pressed={mobileView === "history"} aria-controls="commerce-history" onClick={() => setMobileView("history")}>
                        生成记录
                    </button>
                </div>
                {error && (
                    <p className="commerce-error" role="alert">
                        {error}
                    </p>
                )}
                <div className="commerce-columns" data-mobile-view={mobileView}>
                    <aside id="commerce-history" className="commerce-history commerce-panel" aria-label="生成记录">
                        <div className="commerce-panel-title">
                            <h2>
                                <History size={18} aria-hidden />
                                生成记录
                            </h2>
                            <span>{editingTasks.length}</span>
                        </div>
                        <p>保留每个任务的图片、要求与生成结果</p>
                        <Button block icon={<Plus size={16} />} disabled={locked} onClick={() => void selectTask()}>
                            新建任务
                        </Button>
                        <div className="commerce-history-list">
                            {editingTasks.map((item, index) => {
                                const value = item.id === editingId ? draft : item.draft;
                                const status = records.find((record) => record.taskId === item.session?.taskId)?.status || item.session?.status;
                                return (
                                    <div className="commerce-task-card" key={item.id}>
                                        <button type="button" className="commerce-editing-task" aria-label={`切换任务 ${index + 1}`} aria-pressed={editingId === item.id} disabled={locked} onClick={() => void selectTask(undefined, item)}>
                                            <span className="commerce-history-task-cover">{value.references[0] ? <ReferenceImage reference={value.references[0]} /> : <Pencil size={24} aria-hidden />}</span>
                                            <strong>
                                                任务 {index + 1} ·{" "}
                                                {item.id === editingId && stage === 1
                                                    ? "分析中"
                                                    : item.id === editingId && stage === 2
                                                      ? "待确认"
                                                      : status
                                                        ? { queued: "排队中", running: "生成中", succeeded: "已完成", failed: "失败", cancelled: "已取消" }[status]
                                                        : item.planning?.design
                                                          ? "待确认"
                                                          : "编辑中"}
                                            </strong>
                                            <small>{value.product || value.requirements.slice(0, 30) || "填写商品信息"}</small>
                                        </button>
                                        <button type="button" className="commerce-task-remove" aria-label={`删除任务 ${index + 1}`} disabled={locked} onClick={() => setDeleteTarget({ editingId: item.id })}>
                                            <X size={12} aria-hidden />
                                        </button>
                                    </div>
                                );
                            })}
                            {records
                                .filter((record) => !editingTasks.some((item) => item.session?.taskId === record.taskId))
                                .map((record) => (
                                    <div className="commerce-task-card" key={record.taskId}>
                                        <button type="button" disabled={locked} aria-pressed={selectedTask === record.taskId} onClick={() => void selectTask(record)}>
                                            {record.draft.references[0] && <ReferenceImage reference={record.draft.references[0]} />}
                                            <strong>{record.draft.product || record.draft.requirements.slice(0, 30) || "商品主图"}</strong>
                                            <span>{{ queued: "排队中", running: "生成中", succeeded: "已完成", failed: "失败", cancelled: "已取消" }[record.status]}</span>
                                            <small>{new Date(record.createdAt).toLocaleString("zh-CN")}</small>
                                        </button>
                                        <button type="button" className="commerce-task-remove" aria-label={`删除生成记录 ${record.draft.product || record.taskId}`} disabled={locked} onClick={() => setDeleteTarget({ taskId: record.taskId })}>
                                            <X size={12} aria-hidden />
                                        </button>
                                    </div>
                                ))}
                        </div>
                    </aside>
                    <fieldset id="commerce-form" className="commerce-form" disabled={locked} inert={locked} aria-busy={locked} aria-label="商品创作设置">
                        <section className="commerce-panel">
                            <h2>创作设置</h2>
                            <p>普通模式快速填写，高级模式细化商品需求</p>
                            <div className="commerce-modes" role="group" aria-label="填写方式">
                                {(["normal", "advanced"] as const).map((mode) => (
                                    <button key={mode} type="button" aria-pressed={draft.mode === mode} onClick={() => update("mode", mode)}>
                                        {mode === "normal" ? "普通模式" : "高级模式"}
                                    </button>
                                ))}
                            </div>
                        </section>
                        <section className="commerce-panel">
                            <div className="commerce-panel-title">
                                <h2>产品素材</h2>
                                {!!draft.references.length && (
                                    <button type="button" className="commerce-clear" onClick={() => update("references", [])}>
                                        清空全部
                                    </button>
                                )}
                                <span>
                                    {draft.references.length}/{maxImages}
                                </span>
                            </div>
                            <p>添加同一商品的多角度图片，第一张为主参考图</p>
                            <input
                                ref={fileInput}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                multiple
                                hidden
                                onChange={(event) => {
                                    void addFiles(Array.from(event.target.files || []));
                                    event.target.value = "";
                                }}
                            />
                            <div className="commerce-upload-grid">
                                <button
                                    type="button"
                                    aria-label="添加产品图"
                                    className={`commerce-dropzone${draft.references.length ? " is-compact" : ""}${dragging ? " is-dragging" : ""}`}
                                    disabled={maxImages === 0 || uploading || draft.references.length >= maxImages}
                                    onClick={() => setSourceOpen(true)}
                                    onDragOver={(event) => {
                                        event.preventDefault();
                                        setDragging(true);
                                    }}
                                    onDragLeave={() => setDragging(false)}
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        setDragging(false);
                                        void addFiles(Array.from(event.dataTransfer.files));
                                    }}
                                    onPaste={(event) => {
                                        const files = Array.from(event.clipboardData.files);
                                        if (files.length) {
                                            event.preventDefault();
                                            void addFiles(files);
                                        }
                                    }}
                                >
                                    <ImagePlus size={24} aria-hidden />
                                    <strong>{uploading ? "正在读取图片…" : draft.references.length ? "添加图片" : "点击或拖放产品图"}</strong>
                                    <span>聚焦此区域后，可 Ctrl+V 粘贴图片</span>
                                </button>
                                {!!draft.references.length && (
                                    <div className="commerce-thumbnails">
                                        {draft.references.map((reference, index) => (
                                            <div key={reference.id}>
                                                <div className="commerce-reference-preview" data-reference-id={reference.id} data-moving={movingReference === reference.id || undefined}>
                                                    <button
                                                        type="button"
                                                        className="commerce-thumbnail"
                                                        aria-label={`预览 ${reference.name}`}
                                                        title="拖动调整顺序；键盘 Alt + 左右方向键排序"
                                                        aria-pressed={current?.id === reference.id}
                                                        onPointerDown={(event) => {
                                                            if (locked || event.button !== 0) return;
                                                            referenceDrag.current = { id: reference.id, x: event.clientX, y: event.clientY, moved: false };
                                                            event.currentTarget.setPointerCapture(event.pointerId);
                                                        }}
                                                        onPointerMove={(event) => {
                                                            const drag = referenceDrag.current;
                                                            if (!drag || drag.id !== reference.id) return;
                                                            if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 6) {
                                                                drag.moved = true;
                                                                setMovingReference(reference.id);
                                                            }
                                                        }}
                                                        onPointerUp={(event) => {
                                                            const drag = referenceDrag.current;
                                                            if (drag?.moved) {
                                                                const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-reference-id]");
                                                                if (target?.dataset.referenceId) moveReference(reference.id, target.dataset.referenceId);
                                                            }
                                                            setMovingReference("");
                                                        }}
                                                        onPointerCancel={() => {
                                                            referenceDrag.current = null;
                                                            setMovingReference("");
                                                        }}
                                                        onKeyDown={(event) => {
                                                            if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
                                                            event.preventDefault();
                                                            const target = draft.references[index + (event.key === "ArrowLeft" ? -1 : 1)];
                                                            if (target) moveReference(reference.id, target.id);
                                                        }}
                                                        onClick={() => {
                                                            if (!referenceDrag.current?.moved) setActive(reference.id);
                                                            referenceDrag.current = null;
                                                        }}
                                                    >
                                                        <ReferenceImage reference={reference} />
                                                        <span title={index === 0 ? "主参考图" : `参考图 ${index + 1}`}>{index + 1}</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="commerce-reference-remove"
                                                        aria-label={`删除 ${reference.name}`}
                                                        onClick={() =>
                                                            update(
                                                                "references",
                                                                draft.references.filter((item) => item.id !== reference.id),
                                                            )
                                                        }
                                                    >
                                                        <X size={12} aria-hidden />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="commerce-hint">
                                JPG、PNG、WEBP · 每张不超过 {(byteLimit / 1024 / 1024).toFixed(1)} MB{maxImages === 0 ? "；所选模型不支持产品参考图，请切换模型。" : "。清晰完整的商品图有助于保留细节。"}
                            </div>
                        </section>
                        <section className="commerce-panel commerce-settings">
                            <h2>主图要求</h2>
                            <PlatformPicker
                                value={draft.platform}
                                disabled={locked}
                                onConfirm={(value) => {
                                    update("platform", value);
                                    if (value !== draft.platform) update("platformRule", "");
                                }}
                            />
                            <label className="commerce-field">
                                <span>主图要求</span>
                                <textarea aria-label="主图要求" value={draft.requirements} maxLength={5000} onChange={(event) => update("requirements", event.target.value)} placeholder="描述商品、核心卖点、使用场景，以及希望呈现的画面风格" rows={5} />
                                <small>{draft.requirements.length}/5000</small>
                            </label>
                            <details className="commerce-platform-summary">
                                <summary>{matching.platform.id === "auto" ? "平台规范与商家要求" : `${matching.platform.name}规范与商家要求`}</summary>
                                <div className="commerce-platform-summary-title">
                                    <strong>{matching.platform.id === "auto" ? "等待匹配平台" : `${matching.platform.name}规范`}</strong>
                                    <span>{matching.reason}</span>
                                </div>
                                {matching.platform.rules.length > 1 && (
                                    <Field
                                        label={matching.platform.id === "amazon" ? "图片用途 / A+ 模块" : "图片用途"}
                                        value={rule?.label || ""}
                                        options={matching.platform.rules.map((item) => item.label)}
                                        onChange={(value) => update("platformRule", matching.platform.rules.find((item) => item.label === value)?.id || "")}
                                    />
                                )}
                                <details className="commerce-platform-details">
                                    <summary>查看图片与内容规范</summary>
                                    <PlatformRules rule={rule} />
                                </details>
                                {!!issues.length && (
                                    <ul className="commerce-platform-issues">
                                        {issues.map((issue) => (
                                            <li key={issue}>{issue}</li>
                                        ))}
                                    </ul>
                                )}
                                {recommendedSize && recommendedSize !== size && (
                                    <button type="button" className="commerce-platform-apply" onClick={() => update("size", recommendedSize)}>
                                        应用匹配尺寸 · {recommendedSize}
                                    </button>
                                )}
                                {rule?.ratio && !recommendedSize && <p className="commerce-platform-note">当前模型没有匹配该版式的尺寸选项；不会传入模型不支持的尺寸。请选择其他模型，或在导出时另行适配。</p>}
                                <details className="commerce-platform-details">
                                    <summary>补充当前站点 / 类目的商家规范</summary>
                                    <label className="commerce-field">
                                        <span>商家后台规范与官方链接</span>
                                        <textarea
                                            aria-label="商家后台规范与官方链接"
                                            rows={4}
                                            maxLength={3000}
                                            value={merchantRules}
                                            placeholder="填写站点、类目、用途、图片尺寸、格式与大小，以及官方规范链接。补充内容会进入创作需求，并标记为用户提供。"
                                            onChange={(event) => update("merchantPlatformRules", { ...draft.merchantPlatformRules, [matching.platform.id]: event.target.value })}
                                        />
                                    </label>
                                </details>
                            </details>
                            {draft.mode === "advanced" && (
                                <div className="commerce-advanced">
                                    {(
                                        [
                                            ["product", "商品名称"],
                                            ["sellingPoints", "核心卖点"],
                                            ["audience", "目标人群"],
                                            ["style", "品牌风格 / 必须保留"],
                                            ["avoid", "避免出现的内容"],
                                        ] as const
                                    ).map(([key, label]) => (
                                        <label className="commerce-field" key={key}>
                                            <span>{label}</span>
                                            <textarea aria-label={label} rows={2} maxLength={1000} value={draft[key]} onChange={(event) => update(key, event.target.value)} />
                                        </label>
                                    ))}
                                </div>
                            )}
                        </section>
                        <section className="commerce-panel commerce-settings">
                            <h2>生成设置</h2>
                            <div className="commerce-field">
                                <span id="commerce-analysis-model-label">分析模型</span>
                                <div role="group" aria-labelledby="commerce-analysis-model-label">
                                    <ModelPicker config={config} capability="text" value={analysisModel} onChange={(value) => update("analysisModel", value)} fullWidth showSelectedPrice={false} showOptionPrices={false} placeholder="选择看图分析模型" />
                                </div>
                                {!analysisModel ? (
                                    <p>暂无可用文本模型，请先配置文本模型。</p>
                                ) : analysisImageLimit > 0 ? (
                                    <p>支持看图分析，最多可输入 {analysisImageLimit} 张参考图。</p>
                                ) : (
                                    <p role="status">此文本模型尚未配置图片输入能力。若上游支持看图，请在模型管理中配置「参考图片」上限；否则请选择支持看图的文本模型。</p>
                                )}
                            </div>
                            <div className="commerce-field">
                                <span id="commerce-model-label">图片模型</span>
                                <div role="group" aria-labelledby="commerce-model-label">
                                    <ModelPicker
                                        config={config}
                                        value={model}
                                        capability="image"
                                        fullWidth
                                        showSelectedPrice={false}
                                        showOptionPrices={false}
                                        onChange={(value) => {
                                            update("model", value);
                                        }}
                                        placeholder="选择图片模型"
                                    />
                                </div>
                            </div>
                            <div className="commerce-settings-grid">
                                <LanguagePicker value={draft.language} disabled={locked} onConfirm={(value) => update("language", value)} />
                                <Field label="画面尺寸 / 比例" value={size} options={sizes} disabled={!sizes.length} onChange={(value) => update("size", value)} />
                                <Field label="质量 / 分辨率" value={quality} options={qualities} disabled={!qualities.length} onChange={(value) => update("quality", value)} />
                                <Field label="生成数量" value={count} options={countOptions} disabled={!model} onChange={(value) => update("count", value)} />
                            </div>
                            {!model && <p>暂无可用图片模型，请先在平台配置中添加。</p>}
                            {draft.references.length > maxImages && <p role="alert">当前模型最多支持 {maxImages} 张参考图，请减少图片或更换模型。</p>}
                        </section>
                        <section className="commerce-panel commerce-auto">
                            <div>
                                <h2>一键生图</h2>
                                <p>分析完成后，无规范提醒时自动按设计规划生图</p>
                            </div>
                            <Switch aria-label="一键生图" checked={draft.automatic} onChange={(value) => update("automatic", value)} />
                        </section>
                        <div className="commerce-submit-area">
                            <div ref={setSubmitSlot} className="commerce-submit-slot" />
                            <details className="commerce-platform-details commerce-brief">
                                <summary>查看完整创作需求</summary>
                                <textarea aria-label="完整创作需求" readOnly value={brief} rows={10} />
                                <button
                                    type="button"
                                    className="commerce-platform-apply"
                                    onClick={async () => {
                                        const revision = editRevision.current;
                                        try {
                                            await navigator.clipboard.writeText(brief);
                                            if (alive.current && editRevision.current === revision) setCopyStatus("已复制创作需求");
                                        } catch {
                                            if (alive.current && editRevision.current === revision) setCopyStatus("复制失败，可在上方选中文字复制");
                                        }
                                    }}
                                >
                                    复制创作需求
                                </button>
                                <p role="status">{copyStatus}</p>
                            </details>
                            <p className="commerce-local-note">先由电商设计专家看图分析，再确认逐张规划；分析与生图分别按所选模型计费。</p>
                        </div>
                    </fieldset>
                    <div className="commerce-preview-column">
                        {ready && (
                            <GenerationPanel
                                key={generationView}
                                userId={userId}
                                draft={draft}
                                config={{ ...config, model, imageModel: model, size, quality, count }}
                                sizes={sizes}
                                submitSlot={submitSlot}
                                analysisConfig={{ ...config, model: analysisModel, textModel: analysisModel }}
                                initialPlanning={editingTasks.find((item) => item.id === editingId)?.planning}
                                onPlanning={recordPlanning}
                                disabled={!ready || saving || uploading || draft.references.length > maxImages}
                                onBusy={setGenerating}
                                onError={showFailure}
                                onStage={(value) => {
                                    setStage(value);
                                    if (value >= 1) setMobileView("preview");
                                }}
                                onRecord={recordTask}
                                onTaskStatus={updateTaskStatus}
                            />
                        )}
                        {stage === 0 && (
                            <ProductPreview
                                references={draft.references}
                                locked={locked || maxImages === 0 || draft.references.length >= maxImages}
                                onAdd={() => {
                                    setMobileView("settings");
                                    setSourceOpen(true);
                                }}
                            />
                        )}
                    </div>
                </div>
            </div>
            <AppModal
                open={!!deleteTarget}
                title="删除这个任务？"
                centered
                width={440}
                onCancel={() => {
                    if (!switching) setDeleteTarget(undefined);
                }}
                closable={!switching}
                footer={
                    <>
                        <Button disabled={switching} onClick={() => setDeleteTarget(undefined)}>
                            取消
                        </Button>
                        <Button className="commerce-generate" loading={switching} onClick={() => void deleteTask()}>
                            确认删除
                        </Button>
                    </>
                }
            >
                <p>将删除这个任务的草稿与本地记录。已生成的云端素材会保留。</p>
            </AppModal>
            <AppModal open={errorMessages.length > 0} title="请检查以下问题" centered width={480} onCancel={() => setErrorMessages([])} footer={<Button onClick={() => setErrorMessages([])}>返回修改</Button>}>
                <ul className="commerce-error-dialog" role="alert">
                    {errorMessages.map((message) => (
                        <li key={message}>{message}</li>
                    ))}
                </ul>
            </AppModal>
            <UploadSource
                open={sourceOpen}
                onClose={() => setSourceOpen(false)}
                onLocal={() => {
                    setSourceOpen(false);
                    fileInput.current?.click();
                }}
                onAssets={() => {
                    setSourceOpen(false);
                    setAssetsOpen(true);
                }}
            />
            {assetsOpen && (
                <AssetLibraryPickerModal
                    open
                    remoteLibrary
                    remoteKind="image"
                    acceptRemoteItems
                    mediaKinds={["image"]}
                    items={assetItems}
                    categoryLabels={{ all: "全部素材", character: "角色", scene: "场景", prop: "道具", material: "素材", other: "其他" }}
                    eyebrow="产品参考图"
                    footerNote={`还可添加 ${Math.max(0, maxImages - draft.references.length)} 张 · JPG、PNG、WEBP`}
                    onClose={() => {
                        if (!uploading) setAssetsOpen(false);
                    }}
                    onConfirm={async (ids, items) => {
                        try {
                            await selectAssets(ids, items);
                        } catch (reason) {
                            showFailure(reason instanceof Error ? reason.message : "资产图片读取失败，请重新选择。");
                            throw reason;
                        }
                    }}
                />
            )}
        </WorkspacePage>
    );
}
export default function CommerceStudioPage() {
    const userId = useUserStore((state) => state.user?.id);
    return userId ? <CommerceWorkbench key={userId} userId={userId} /> : null;
}
