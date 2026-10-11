import { useEffect, useId, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Check, HelpCircle, ImagePlus, Save, ShoppingBag } from "lucide-react";
import { Button } from "antd";
import { Select } from "@/components/ui/base/select";
import { Tooltip } from "@/components/ui/base/tooltip";
import type { ProductReference } from "./draft";

export function ReferenceImage({ reference }: { reference: ProductReference }) {
    const [url, setUrl] = useState("");
    useEffect(() => {
        const next = URL.createObjectURL(reference.blob);
        setUrl(next);
        return () => URL.revokeObjectURL(next);
    }, [reference.blob]);
    return url ? <img src={url} alt={reference.name} /> : null;
}

export function Field({ label, value, options, onChange, disabled = false }: { label: string; value: string; options: string[]; onChange: (value: string) => void; disabled?: boolean }) {
    const id = useId();
    return (
        <div className="commerce-field">
            <label htmlFor={id}>{label}</label>
            <Select
                id={id}
                ariaLabel={label}
                appearance="field"
                size="large"
                value={value || undefined}
                disabled={disabled}
                onChange={onChange}
                placeholder="自动"
                options={options.map((option) => ({ value: option, label: option }))}
                getPopupContainer={(trigger) => trigger.parentElement || document.body}
            />
        </div>
    );
}

export function WorkbenchHeader({ saved, saving, locked, dirty, onSave, stage = 0 }: { saved: boolean; saving: boolean; locked: boolean; dirty: boolean; onSave: () => void; stage?: number }) {
    return (
        <>
            <div className="commerce-topline">
                <Link className="commerce-back" to="/projects">
                    <ArrowLeft aria-hidden />
                    返回创意中心
                </Link>
                <div className="commerce-draft-actions">
                    <span className="commerce-draft-status" role="status">
                        {saved ? (
                            <>
                                <Check aria-hidden />
                                已保存到此浏览器
                            </>
                        ) : dirty ? (
                            "有未保存的更改"
                        ) : (
                            "草稿仅存当前浏览器"
                        )}
                    </span>
                    <Tooltip title="任务草稿会自动保留在当前浏览器；点击保存可立即保存产品图、需求与参数。刷新或下次进入可恢复，不会同步到其他设备，也不会开始生成。" placement="bottomRight">
                        <button type="button" className="commerce-draft-help" aria-label="草稿保存说明">
                            <HelpCircle aria-hidden />
                        </button>
                    </Tooltip>
                    <Button className="commerce-save" icon={<Save aria-hidden />} loading={saving} disabled={locked} onClick={onSave}>
                        保存草稿
                    </Button>
                </div>
            </div>
            <header className="commerce-heading">
                <span className="commerce-heading-icon">
                    <ShoppingBag aria-hidden />
                </span>
                <div>
                    <span className="commerce-eyebrow">电商设计室</span>
                    <h1>一键生成电商主图</h1>
                    <p>从真实产品素材出发，准备一组连贯的商品视觉</p>
                </div>
                <span className="commerce-phase">{["输入阶段", "分析中", "确认规划", "生成中", "完成"][stage]}</span>
            </header>
            <ol className="commerce-steps" aria-label="电商主图创作步骤">
                {["输入", "分析中", "确认规划", "生成中", "完成"].map((step, index) => (
                    <li key={step} aria-current={index === stage ? "step" : undefined}>
                        <span>{index + 1}</span>
                        <strong>{step}</strong>
                    </li>
                ))}
            </ol>
        </>
    );
}

export function ProductPreview({ references, locked, onAdd }: { references: ProductReference[]; locked: boolean; onAdd: () => void }) {
    return (
        <section id="commerce-preview" className="commerce-panel commerce-results" aria-label="素材预览">
            <div className="commerce-result-header">
                <div>
                    <h2>素材预览</h2>
                    <p>{references.length ? "核对商品外观与细节" : "添加产品图，开始准备主图"}</p>
                </div>
                <span className="commerce-preview-count">{references.length} 张素材</span>
            </div>
            {references.length ? (
                <div className="commerce-product-preview">
                    <div className="commerce-preview-cards">
                        {references.map((reference, index) => (
                            <figure key={reference.id}>
                                <div className="commerce-preview-stage" style={{ aspectRatio: `${reference.width} / ${reference.height}` }}>
                                    <ReferenceImage reference={reference} />
                                </div>
                                <figcaption className="commerce-preview-meta">
                                    <strong>
                                        {index + 1}
                                        {index === 0 ? " · 主参考图" : " · 参考图"}
                                    </strong>
                                    <span>
                                        {reference.width} × {reference.height}
                                    </span>
                                </figcaption>
                            </figure>
                        ))}
                    </div>
                    <p>当前展示上传的参考素材，生成结果将在此呈现。</p>
                </div>
            ) : (
                <div className="commerce-empty-result">
                    <div className="commerce-empty-illustration">
                        <span>
                            <ShoppingBag aria-hidden />
                        </span>
                        <ImagePlus className="commerce-illustration-corner" aria-hidden />
                    </div>
                    <h3>生成结果将在这里呈现</h3>
                    <p>上传产品图并填写要求，检查规范后开始生成</p>
                    <Button className="commerce-add-reference" icon={<ImagePlus aria-hidden />} disabled={locked} onClick={onAdd}>
                        添加产品图
                    </Button>
                </div>
            )}
            <footer className="commerce-preview-footer">
                <h3>素材准备建议</h3>
                <ol>
                    <li>主参考图：商品完整、主体清晰</li>
                    <li>补充角度：侧面、背面与细节</li>
                    <li>保持一致：使用同一商品的原图</li>
                </ol>
            </footer>
        </section>
    );
}
