import { useRef, useState } from "react";
import { Button } from "antd";
import { Check, ChevronDown, TypeOutline, X } from "lucide-react";
import { AppModal } from "@/components/ui/product/app-modal";
import "./platform-picker.css";

const languages = [
    ["无文字", "无文字（纯视觉）", ""],
    ["简体中文", "简体中文", "简"],
    ["繁体中文", "繁体中文", "繁"],
    ["英文", "英文", "EN"],
    ["日文", "日语", "あ"],
    ["韩文", "韩语", "한"],
    ["德语", "德语", "DE"],
    ["法语", "法语", "FR"],
    ["阿拉伯语", "阿拉伯语", "ع"],
    ["俄语", "俄语", "RU"],
    ["泰语", "泰语", "ก"],
    ["印尼语", "印尼语", "ID"],
    ["越南语", "越南语", "VI"],
    ["罗马尼亚语", "罗马尼亚语", "RO"],
    ["西班牙语", "西班牙语", "ES"],
    ["马来西亚语", "马来西亚语", "MS"],
    ["意大利语", "意大利语", "IT"],
    ["希伯来语", "希伯来语", "HE"],
    ["葡萄牙语", "葡萄牙语", "PT"],
    ["菲律宾语", "菲律宾语", "FIL"],
    ["印地语", "印地语", "HI"],
    ["波兰语", "波兰语", "PL"],
    ["土耳其语", "土耳其语", "TR"],
    ["荷兰语", "荷兰语", "NL"],
] as const;

export function LanguagePicker({ value, disabled, onConfirm }: { value: string; disabled: boolean; onConfirm: (value: string) => void }) {
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState(value || "简体中文");
    const trigger = useRef<HTMLButtonElement>(null);
    const label = languages.find((language) => language[0] === value)?.[1] || value || "简体中文";
    const close = () => setOpen(false);
    return (
        <>
            <div className="commerce-field">
                <span id="commerce-language-label">目标语言</span>
                <button
                    ref={trigger}
                    type="button"
                    className="commerce-platform-trigger"
                    aria-labelledby="commerce-language-label commerce-language-value"
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    disabled={disabled}
                    onClick={() => {
                        setPending(value || "简体中文");
                        setOpen(true);
                    }}
                >
                    <span id="commerce-language-value">{label}</span>
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
                title="选择目标语言"
                styles={{ header: { display: "none" } }}
            >
                <div className="commerce-platform-dialog">
                    <header>
                        <div>
                            <h2>选择目标语言</h2>
                            <p>用于商品图片中的文案；纯视觉模式不添加文字</p>
                        </div>
                        <button type="button" aria-label="关闭语言选择" onClick={close}>
                            <X size={18} aria-hidden />
                        </button>
                    </header>
                    <div className="commerce-platform-modal-body">
                        <div className="commerce-platform-grid" role="group" aria-label="目标语言选项">
                            {languages.map(([name, title, mark]) => (
                                <button key={name} type="button" className="commerce-platform-option" aria-pressed={pending === name} onClick={() => setPending(name)}>
                                    <span className="commerce-language-mark" aria-hidden>
                                        {mark || <TypeOutline size={28} />}
                                    </span>
                                    <strong>{title}</strong>
                                    {pending === name && <Check className="commerce-platform-check" size={16} aria-hidden />}
                                </button>
                            ))}
                        </div>
                    </div>
                    <footer>
                        <span>已选：{languages.find((language) => language[0] === pending)?.[1] || pending}</span>
                        <div>
                            <Button onClick={close}>取消</Button>
                            <Button
                                type="primary"
                                className="commerce-platform-confirm"
                                disabled={disabled}
                                onClick={() => {
                                    onConfirm(pending);
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
