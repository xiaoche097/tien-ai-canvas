import { Check } from "lucide-react";
import { tryOnGenerationModes } from "./workflow";

export function GenerationModeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    return <div className="try-on-field">
        <span id="try-on-generation-mode-label">生成模式</span>
        <div className="try-on-mode-options" role="group" aria-labelledby="try-on-generation-mode-label">{tryOnGenerationModes.map((mode) => <button key={mode.id} type="button" aria-pressed={value === mode.id} onClick={() => onChange(mode.id)}>
            <span><strong>{mode.title}</strong><small>{mode.description}</small></span>
            <Check size={15} aria-hidden className="try-on-mode-check" />
        </button>)}</div>
        <p className="try-on-note" aria-live="polite">{tryOnGenerationModes.find((mode) => mode.id === value)?.hint}</p>
    </div>;
}
