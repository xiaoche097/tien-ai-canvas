"use client";

import React from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  projectId: string;
  section: { id: string; title: string; goal: string; copy: string; visualPrompt: string };
  onChange: (prompt: string) => void;
  onCopyChange: (copy: string) => void;
  onSaved: (section: { copy: string; visualPrompt: string }) => void;
  constraints?: string;
};
type Suggestion = { source: string; context: string; original: string; replacement: string; prompt: string; copy: string; visualPrompt: string; expected: unknown; model: string };

export function SectionPromptEditor({ projectId, section, onChange, onCopyChange, onSaved, constraints = "" }: Props) {
  const id = React.useId();
  const [mode, setMode] = React.useState<"selection" | "module">("module");
  const [target, setTarget] = React.useState<"both" | "copy" | "visualPrompt">("both");
  const [selection, setSelection] = React.useState({ start: 0, end: 0 });
  const [instruction, setInstruction] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [suggestion, setSuggestion] = React.useState<Suggestion | null>(null);
  const controller = React.useRef<AbortController | null>(null);
  const context = JSON.stringify({ projectId, id: section.id, title: section.title, goal: section.goal, copy: section.copy, visualPrompt: section.visualPrompt, target, constraints });
  const source = target === "copy" ? section.copy : section.visualPrompt;
  const stale = Boolean(suggestion && (suggestion.source !== source || suggestion.context !== context));
  const hasSelection = selection.end > selection.start && selection.end <= source.length;

  React.useEffect(() => () => controller.current?.abort(), []);

  async function rewrite() {
    if (controller.current) return;
    if (mode === "selection" && !hasSelection) { setError("请先在上方 Prompt 中选中要改写的文字，或明确选择当前模块整段改写。"); return; }
    if (instruction.trim().length < 2) { setError("请填写具体的修改要求。"); return; }
    const start = mode === "module" ? 0 : selection.start;
    const end = mode === "module" ? source.length : selection.end;
    const request = new AbortController(); controller.current = request;
    setBusy(true); setError(""); setSuggestion(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/sections/${section.id}/rewrite-prompt`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: request.signal,
        body: JSON.stringify({ instruction, target, currentPrompt: source, mode, start, end, draft: { title: section.title, goal: section.goal, copy: section.copy, visualPrompt: section.visualPrompt } }),
      });
      const payload = await response.json();
      if (request.signal.aborted) return;
      if (!response.ok || !payload.success) throw new Error(payload.error?.message || "改写失败，请稍后重试。");
      const result = payload.data;
      if (typeof result.replacement !== "string" || (!result.replacement.trim() && target !== "copy") || result.prompt !== source.slice(0, start) + result.replacement + source.slice(end)) throw new Error("改写结果无效，原 Prompt 未修改。");
      if (typeof result.copy !== "string" || typeof result.visualPrompt !== "string" || !result.expected) throw new Error("改写结果缺少模块文案或保存依据，原内容未修改。");
      if (result.copy === section.copy && result.visualPrompt === section.visualPrompt) throw new Error("AI 没有修改内容。请补充要求，并核对是否与商品事实或模块主题冲突。");
      setSuggestion({ source, context, original: source.slice(start, end), replacement: result.replacement, prompt: result.prompt, copy: result.copy, visualPrompt: result.visualPrompt, expected: result.expected, model: result.model });
    } catch (err) {
      if (!request.signal.aborted) setError(err instanceof Error ? err.message : "改写失败，原 Prompt 未修改。");
    } finally {
      if (controller.current === request) controller.current = null;
      if (!request.signal.aborted) setBusy(false);
    }
  }

  async function adopt() {
    if (!suggestion || stale || controller.current) return;
    const request = new AbortController(); controller.current = request;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/sections/${section.id}/rewrite-prompt/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, signal: request.signal, body: JSON.stringify({ expected: suggestion.expected, updates: { copy: suggestion.copy, visualPrompt: suggestion.visualPrompt } }) });
      const payload = await response.json();
      if (request.signal.aborted) return;
      if (!response.ok || !payload.success) throw new Error(payload.error?.message || "保存失败，改写预览仍保留，请核对后重试。");
      onSaved(payload.data); setSuggestion(null);
      toast.success("模块文案和 Prompt 已保存，刷新后仍会保留。");
    } catch (err) {
      if (!request.signal.aborted) setError(err instanceof Error ? err.message : "保存结果未确认，请刷新核对，原预览仍保留。");
    } finally {
      if (controller.current === request) controller.current = null;
      if (!request.signal.aborted) setSaving(false);
    }
  }
  function select(field: "copy" | "visualPrompt", event: React.SyntheticEvent<HTMLTextAreaElement>) {
    const { selectionStart: start, selectionEnd: end } = event.currentTarget;
    if (end <= start) return;
    setTarget(field === "copy" ? "copy" : target === "copy" ? "visualPrompt" : target);
    setSelection({ start, end }); setMode("selection"); setSuggestion(null);
  }

  return <div className="space-y-2">
    <Label htmlFor={`${id}-copy`}>模块文案</Label>
    <Textarea id={`${id}-copy`} value={section.copy} disabled={saving} onChange={event => onCopyChange(event.target.value)} onSelect={event => select("copy", event)} />
    <Label htmlFor={`${id}-prompt`}>双语视觉 Prompt</Label>
    <Textarea id={`${id}-prompt`} value={section.visualPrompt} disabled={saving} onChange={event => onChange(event.target.value)} onSelect={event => select("visualPrompt", event)} />
    <p className="text-xs text-muted-foreground">可联动调整文案与排版，也可选中一段局部改写。采用时直接保存这两个字段，不自动生图。</p>
    <details className="rounded-xl border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">AI 局部改写</summary>
      <div className="mt-3 space-y-3">
        <Label htmlFor={`${id}-target`}>改写对象</Label>
        <select id={`${id}-target`} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={target} disabled={busy || saving} onChange={event => { setTarget(event.target.value as typeof target); setMode("module"); setSelection({ start: 0, end: 0 }); setSuggestion(null); }}>
          <option value="both">模块文案 + 视觉 Prompt 联动</option>
          <option value="copy">仅模块文案</option>
          <option value="visualPrompt">仅视觉 Prompt</option>
        </select>
        <Label htmlFor={`${id}-scope`}>改写范围</Label>
        <select id={`${id}-scope`} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={mode} disabled={busy || saving} onChange={event => { setMode(event.target.value as typeof mode); setSuggestion(null); }}>
          <option value="selection">仅选中文字（{hasSelection ? selection.end - selection.start : 0} 字）</option>
          <option value="module">按要求调整当前模块，保留其余内容</option>
        </select>
        {mode === "selection" && hasSelection && <p className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted p-2 text-xs" aria-label="选中的待改写文字">{source.slice(selection.start, selection.end)}</p>}
        {target === "both" && <p className="text-xs text-muted-foreground">联动模式会同步调整模块文案；局部选区作用于视觉 Prompt，选区之外的 Prompt 原样保留。</p>}
        <Label htmlFor={`${id}-instruction`}>希望怎样修改？</Label>
        <Textarea id={`${id}-instruction`} placeholder="例如：卖点改成柔软透气，标题置顶、右侧保留两张材质特写；其他排版和产品结构不变。" value={instruction} maxLength={2000} disabled={busy || saving} onChange={event => { setInstruction(event.target.value); setSuggestion(null); }} />
        <p className="text-xs text-muted-foreground">使用 AI 配置中的文案规划模型，按现有文本调用规则计费。先预览再采用，不自动生图。</p>
        <Button type="button" size="sm" variant="outline" onClick={rewrite} disabled={busy || saving || (mode === "selection" && !source.trim())}>
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}{busy ? "正在改写…" : "生成改写预览"}
        </Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {suggestion && <div className="space-y-2 border-t border-border pt-3" aria-label="AI 改写预览">
          <Label htmlFor={`${id}-before`}>改写前</Label>
          <Textarea id={`${id}-before`} value={suggestion.original} readOnly rows={3} />
          <Label htmlFor={`${id}-after`}>改写后</Label>
          <Textarea id={`${id}-after`} value={suggestion.replacement} readOnly rows={4} />
          {target === "both" && <><Label htmlFor={`${id}-copy-after`}>联动后的模块文案</Label><Textarea id={`${id}-copy-after`} value={suggestion.copy} readOnly rows={4} /></>}
          {stale && <p role="alert" className="text-sm text-destructive">Prompt 或模块内容已变化，请重新生成预览，避免覆盖新的编辑。</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={stale || busy || saving} onClick={() => void adopt()}>{saving ? "正在保存…" : "采用并保存"}</Button>
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => setSuggestion(null)}>放弃</Button>
          </div>
          <p className="text-xs text-muted-foreground">采用会保存当前模块的文案和 Prompt，刷新后保留；其他模块、原图和历史版本不变。标题、目标及参考图等其他手动草稿仍需用模块保存按钮保存。</p>
        </div>}
      </div>
    </details>
  </div>;
}
