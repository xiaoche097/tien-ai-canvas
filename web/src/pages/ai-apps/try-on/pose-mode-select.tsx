import { Check, Sparkles } from "lucide-react";
import { poseModes, type PoseMode } from "./workflow";

export function PoseModeSelect({ value, onChange }: { value: PoseMode; onChange: (value: PoseMode) => void }) {
    return <div className="try-on-pose-panel">
        <div className="try-on-segment" role="group" aria-label="换姿方式">{poseModes.map((mode) => <button key={mode.id} type="button" aria-pressed={value === mode.id} onClick={() => onChange(mode.id)}>{mode.label}</button>)}</div>
        {value === "smart" ? <div className="try-on-pose-smart"><Sparkles size={20} aria-hidden /><div><strong>根据服装，智能选姿</strong><p>识别版型、面料与结构细节，选择适合商品展示的自然动作。</p><ul><li><Check size={14} aria-hidden />展示领口、袖型、腰线与下摆</li><li><Check size={14} aria-hidden />减少手臂和配饰遮挡</li><li><Check size={14} aria-hidden />保留人物、穿搭与原场景</li></ul><small>无需填写动作或上传姿势图。每张输出一位模特，多张数量可在下方选择。</small></div></div> : <p className="try-on-note">{value === "text" ? "描述身体朝向、手臂位置和重心；保持原人物、服装与场景。" : "参考图仅提供动作姿态，不复制其中的人脸、服装或背景。"}</p>}
    </div>;
}
