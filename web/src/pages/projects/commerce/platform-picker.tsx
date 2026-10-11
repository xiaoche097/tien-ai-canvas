import { useRef, useState } from "react";
import { Button } from "antd";
import { Check, ChevronDown, ExternalLink, Sparkles, X } from "lucide-react";
import { AppModal } from "@/components/ui/product/app-modal";
import { commercePlatforms, platformRule, type CommercePlatform, type PlatformRule } from "./platform-standards";
import "./platform-picker.css";

function PlatformMark({ platform }: { platform: CommercePlatform }) {
    const [failed, setFailed] = useState(false);
    const icons: Record<string, string> = { taobao: "png", "1688": "ico", pdd: "png", jd: "ico", douyin: "ico", amazon: "ico", ebay: "ico", shein: "png", shopee: "png", lazada: "png" };
    return platform.id === "auto" ? (
        <Sparkles aria-hidden />
    ) : icons[platform.id] && !failed ? (
        <img src={`/commerce/platforms/${platform.id}.${icons[platform.id]}`} alt="" onError={() => setFailed(true)} />
    ) : (
        <span className="commerce-platform-wordmark" aria-hidden>
            {platform.name}
        </span>
    );
}
export function PlatformRules({ rule }: { rule?: PlatformRule }) {
    if (!rule) return <p className="commerce-platform-note">智能匹配会读取需求中明确的平台名称；多个平台或未指定时，请手动选择。不会猜测店铺站点。</p>;
    return (
        <div className="commerce-platform-rules">
            <div className="commerce-platform-rule-heading">
                <strong>{rule.label}</strong>
                <span>{rule.status === "verified" ? "已核验条款" : rule.status === "guidance" ? "官方优化建议" : rule.status === "partial" ? "部分条款已核验" : "规范待核验"}</span>
            </div>
            <p>{rule.scope}</p>
            <ul>
                {rule.rules.map((text) => (
                    <li key={text}>{text}</li>
                ))}
            </ul>
            <div className="commerce-platform-sources">
                <a href={rule.source} target="_blank" rel="noopener noreferrer">
                    {rule.status === "pending" ? "前往官方核验" : "查看官方依据"}
                    <ExternalLink size={13} aria-hidden />
                </a>
                {rule.contentSource && (
                    <a href={rule.contentSource} target="_blank" rel="noopener noreferrer">
                        内容规范
                        <ExternalLink size={13} aria-hidden />
                    </a>
                )}
            </div>
        </div>
    );
}
export function PlatformPicker({ value, disabled, onConfirm }: { value: string; disabled: boolean; onConfirm: (name: string) => void }) {
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState(value);
    const trigger = useRef<HTMLButtonElement>(null);
    const selected = commercePlatforms.find((item) => item.name === pending) || commercePlatforms[0];
    const close = () => setOpen(false);
    return (
        <>
            <div className="commerce-field">
                <span id="commerce-platform-label">目标平台</span>
                <button
                    className="commerce-platform-trigger"
                    ref={trigger}
                    type="button"
                    aria-labelledby="commerce-platform-label commerce-platform-value"
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    disabled={disabled}
                    onClick={() => {
                        setPending(value);
                        setOpen(true);
                    }}
                >
                    <span id="commerce-platform-value">{value}</span>
                    <ChevronDown size={16} aria-hidden />
                </button>
            </div>
            <AppModal
                open={open}
                flush
                centered
                width={1040}
                footer={null}
                closable={false}
                onCancel={close}
                afterClose={() => trigger.current?.focus({ preventScroll: true })}
                className="commerce-platform-modal"
                title="选择目标平台"
                styles={{ header: { display: "none" } }}
            >
                <div className="commerce-platform-dialog">
                    <header>
                        <div>
                            <h2 id="commerce-platform-modal-title">选择目标平台</h2>
                            <p>选择创作去向，应用对应用途的图片与内容规范</p>
                        </div>
                        <button type="button" aria-label="关闭平台选择" onClick={close}>
                            <X size={18} aria-hidden />
                        </button>
                    </header>
                    <div className="commerce-platform-modal-body">
                        <div className="commerce-platform-grid" role="group" aria-label="目标平台选项">
                            {commercePlatforms.map((platform) => (
                                <button key={platform.id} type="button" aria-pressed={pending === platform.name} onClick={() => setPending(platform.name)} className="commerce-platform-option">
                                    <span className="commerce-platform-mark">
                                        <PlatformMark platform={platform} />
                                    </span>
                                    <strong>{platform.name}</strong>
                                    <span className="commerce-platform-option-status">{platform.id === "auto" ? "按需求匹配" : platform.rules[0]?.status === "pending" ? "商家后台核验" : "官方依据"}</span>
                                    {pending === platform.name && <Check className="commerce-platform-check" size={16} aria-hidden />}
                                </button>
                            ))}
                        </div>
                        <PlatformRules rule={platformRule(selected)} />
                    </div>
                    <footer>
                        <span>已选：{selected.name}</span>
                        <div>
                            <Button onClick={close}>取消</Button>
                            <Button
                                type="primary"
                                className="commerce-platform-confirm"
                                disabled={disabled}
                                onClick={() => {
                                    onConfirm(selected.name);
                                    close();
                                }}
                            >
                                确认
                            </Button>
                        </div>
                    </footer>
                </div>
            </AppModal>
        </>
    );
}
