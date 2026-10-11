import { useEffect, useRef, useState } from "react";
import { ArrowUp, ImagePlus, Trash2 } from "lucide-react";
import { Button, Switch } from "antd";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { ModelPicker } from "@/components/model-picker";
import { useUserStore } from "@/stores/use-user-store";
import { selectableModelsByCapability, useEffectiveConfig } from "@/stores/use-config-store";
import { modelCapabilityConfigFor } from "@/lib/model-capabilities";
import { commerceDraftStorage, emptyCommerceDraft, readProductReference, type CommerceDraft, type ProductReference } from "./draft";
import { Field, ProductPreview, ReferenceImage, WorkbenchHeader } from "./workbench-components";
import { PlatformPicker, PlatformRules } from "./platform-picker";
import { checkPlatformSettings, compileCommerceBrief, platformRule, preferredPlatformSize, resolvePlatform, standardsCheckedAt } from "./platform-standards";
import "./commerce.css";
import { GenerationPanel } from "./generation-panel";

function CommerceWorkbench({ userId }: { userId: string }) {
    const config = useEffectiveConfig();
    const [draft, setDraft] = useState<CommerceDraft>(emptyCommerceDraft);
    const [ready, setReady] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [active, setActive] = useState("");
    const [mobileView, setMobileView] = useState("settings");
    const [copyStatus, setCopyStatus] = useState("");
    const [generating, setGenerating] = useState(false);
    const [stage, setStage] = useState(0);
    const fileInput = useRef<HTMLInputElement>(null);
    const alive = useRef(true);
    const ingesting = useRef(false);
    const editRevision = useRef(0);
    const models = selectableModelsByCapability(config, "image");
    const model = models.includes(draft.model) ? draft.model : models.includes(config.imageModel) ? config.imageModel : models[0] || "";
    const profile = model ? modelCapabilityConfigFor(config, model).image : undefined;
    const sizes = profile?.size.values.filter((value) => value !== "*") || [];
    const qualities = profile?.quality.supported ? profile.quality.values : [];
    const size = sizes.includes(draft.size) ? draft.size : profile?.size.default || sizes[0] || "";
    const quality = qualities.includes(draft.quality) ? draft.quality : profile?.quality.default || qualities[0] || "";
    const countOptions = Array.from({ length: Math.min(8, Math.max(1, profile?.maxOutputs || 1)) }, (_, index) => String(index + 1));
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
    useEffect(() => {
        alive.current = true;
        let cancelled = false;
        commerceDraftStorage
            .read(userId)
            .then((value) => {
                if (cancelled) return;
                if (value?.version === 1) {
                    setDraft(value);
                    setSaved(true);
                }
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
    function update<K extends keyof CommerceDraft>(key: K, value: CommerceDraft[K]) {
        if (!ready || saving || uploading || generating) return;
        editRevision.current += 1;
        setDraft((previous) => ({ ...previous, [key]: value }));
        setSaved(false);
        setCopyStatus("");
    }
    async function addFiles(files: File[]) {
        if (ingesting.current || !ready || saving || generating || !files.length) return;
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
            if (alive.current) setSaved(savedRevision === editRevision.current);
        } catch {
            if (alive.current) setError("草稿保存失败，请检查浏览器存储空间后重试。当前内容仍保留在页面中。");
        } finally {
            if (alive.current) setSaving(false);
        }
    }
    const locked = !ready || saving || uploading || generating;
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
                </div>
                {error && (
                    <p className="commerce-error" role="alert">
                        {error}
                    </p>
                )}
                <div className="commerce-columns" data-mobile-view={mobileView}>
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
                            <button
                                type="button"
                                className={`commerce-dropzone${dragging ? " is-dragging" : ""}`}
                                disabled={maxImages === 0 || uploading}
                                onClick={() => fileInput.current?.click()}
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
                                <strong>{uploading ? "正在读取图片…" : "点击或拖放产品图"}</strong>
                                <span>聚焦此区域后，可 Ctrl+V 粘贴图片</span>
                            </button>
                            {!!draft.references.length && (
                                <div className="commerce-thumbnails">
                                    {draft.references.map((reference, index) => (
                                        <div key={reference.id}>
                                            <button type="button" className="commerce-thumbnail" aria-label={`预览 ${reference.name}`} aria-pressed={current?.id === reference.id} onClick={() => setActive(reference.id)}>
                                                <ReferenceImage reference={reference} />
                                                {index === 0 && <span>主参考图</span>}
                                            </button>
                                            <div className="commerce-reference-actions">
                                                {index > 0 && (
                                                    <button type="button" aria-label={`将 ${reference.name} 设为主参考图`} onClick={() => update("references", [reference, ...draft.references.filter((item) => item.id !== reference.id)])}>
                                                        <ArrowUp size={13} />
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    aria-label={`删除 ${reference.name}`}
                                                    onClick={() =>
                                                        update(
                                                            "references",
                                                            draft.references.filter((item) => item.id !== reference.id),
                                                        )
                                                    }
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
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
                            <div className="commerce-platform-summary" aria-live="polite">
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
                            </div>
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
                                <Field label="目标语言" value={draft.language} options={["简体中文", "繁体中文", "英文", "日文", "韩文", "无文字"]} onChange={(value) => update("language", value)} />
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
                                <p>已核验且无警告的方案直接生成；待核验或有冲突时仍需确认</p>
                            </div>
                            <Switch aria-label="一键生图" checked={draft.automatic} onChange={(value) => update("automatic", value)} />
                        </section>
                        <div className="commerce-submit-area">
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
                            <p className="commerce-local-note">右侧检查规范并开始生成；手机可切换到生成与预览。</p>
                        </div>
                    </fieldset>
                    <div className="commerce-preview-column">
                        <GenerationPanel
                            userId={userId}
                            draft={draft}
                            config={{ ...config, model, imageModel: model, size, quality, count }}
                            sizes={sizes}
                            disabled={!ready || saving || uploading || draft.references.length > maxImages}
                            onBusy={setGenerating}
                            onStage={setStage}
                        />
                        <ProductPreview
                            current={current}
                            count={draft.references.length}
                            locked={locked || maxImages === 0 || draft.references.length >= maxImages}
                            onAdd={() => {
                                setMobileView("settings");
                                fileInput.current?.click();
                            }}
                        />
                    </div>
                </div>
            </div>
        </WorkspacePage>
    );
}
export default function CommerceStudioPage() {
    const userId = useUserStore((state) => state.user?.id);
    return userId ? <CommerceWorkbench key={userId} userId={userId} /> : null;
}
