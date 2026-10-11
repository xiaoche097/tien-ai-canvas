import { useState } from "react";
import { ChevronDown, Pencil, X } from "lucide-react";
import type { CommerceDesignPlan } from "./design-plan";

export function DesignPlanning({ design, onChange }: { design: CommerceDesignPlan; onChange: (design: CommerceDesignPlan) => void }) {
    const [editing, setEditing] = useState("");
    return (
        <div className="commerce-design-planning">
            <p className="commerce-product-analysis">{design.productSummary}</p>
            <details className="commerce-design-card" open={editing === "system" || undefined}>
                <summary>
                    <strong>整体设计规范</strong>
                    <button
                        type="button"
                        aria-label="编辑整体设计规范"
                        onClick={(event) => {
                            event.preventDefault();
                            setEditing(editing === "system" ? "" : "system");
                        }}
                    >
                        <Pencil size={14} aria-hidden />
                    </button>
                    <ChevronDown className="commerce-design-chevron" size={16} aria-hidden />
                    <span>统一视觉与平台适配</span>
                </summary>
                {editing === "system" ? <textarea aria-label="整体设计规范" maxLength={12000} rows={6} value={design.designSystem} onChange={(event) => onChange({ ...design, designSystem: event.target.value })} /> : <p>{design.designSystem}</p>}
            </details>
            <h3>
                图片规划 <span>{design.images.length} 张图片 · 可编辑标题、描述与生成需求</span>
            </h3>
            {design.images.map((image, index) => (
                <details key={image.id} className="commerce-design-card" open={editing === image.id || undefined}>
                    <summary>
                        <span className="commerce-design-number">{index + 1}</span>
                        <strong>{image.title}</strong>
                        <button
                            type="button"
                            aria-label={`编辑图片规划 ${index + 1}`}
                            onClick={(event) => {
                                event.preventDefault();
                                setEditing(editing === image.id ? "" : image.id);
                            }}
                        >
                            <Pencil size={14} aria-hidden />
                        </button>
                        <button
                            type="button"
                            className="commerce-design-remove"
                            disabled={design.images.length <= 1}
                            aria-label={`删除图片规划 ${index + 1}`}
                            onClick={(event) => {
                                event.preventDefault();
                                onChange({ ...design, images: design.images.filter((item) => item.id !== image.id) });
                            }}
                        >
                            <X size={12} aria-hidden />
                        </button>
                        <ChevronDown className="commerce-design-chevron" size={16} aria-hidden />
                        <span>{image.description}</span>
                    </summary>
                    {editing === image.id ? (
                        <div className="commerce-design-fields">
                            <label>
                                图片标题
                                <input
                                    aria-label={`图片 ${index + 1} 标题`}
                                    maxLength={200}
                                    value={image.title}
                                    onChange={(event) => onChange({ ...design, images: design.images.map((item) => (item.id === image.id ? { ...item, title: event.target.value } : item)) })}
                                />
                            </label>
                            <label>
                                画面规划
                                <textarea
                                    aria-label={`图片 ${index + 1} 描述`}
                                    maxLength={12000}
                                    rows={3}
                                    value={image.description}
                                    onChange={(event) => onChange({ ...design, images: design.images.map((item) => (item.id === image.id ? { ...item, description: event.target.value } : item)) })}
                                />
                            </label>
                            <label>
                                生成需求
                                <textarea
                                    aria-label={`图片 ${index + 1} 生成需求`}
                                    maxLength={12000}
                                    rows={5}
                                    value={image.prompt}
                                    onChange={(event) => onChange({ ...design, images: design.images.map((item) => (item.id === image.id ? { ...item, prompt: event.target.value } : item)) })}
                                />
                            </label>
                        </div>
                    ) : (
                        <p>{image.prompt}</p>
                    )}
                </details>
            ))}
        </div>
    );
}
