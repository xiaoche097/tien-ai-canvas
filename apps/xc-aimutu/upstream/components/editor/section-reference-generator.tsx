"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getAuthHeaders } from "@/lib/utils/auth-client";
import { isModuleReference, referenceMetadata, referenceShotKey, reusableReference, type ReferenceDraft } from "@/lib/ai/module-reference";

type Asset = { id: string; type: string; isMain?: boolean; fileName: string; url: string; metadata?: unknown };
type Task = { id: string; status: string; errorMessage?: string; inputPayload: any; outputPayload: any };
type Props = { projectId: string; section: ReferenceDraft & { id: string; editableData?: any }; assets: Asset[]; disabled?: boolean; onAsset: (asset: Asset) => void; onAdopt: (sectionId: string, asset: Asset) => void; onBusy: (busy: boolean) => void };

export function SectionReferenceGenerator({ projectId, section, assets, disabled, onAsset, onAdopt, onBusy }: Props) {
  const id = React.useId();
  const sources = assets.filter(asset => ["MAIN", "ANGLE", "DETAIL", "REFERENCE"].includes(asset.type) && !isModuleReference(asset));
  const [sourceId, setSourceId] = React.useState(() => (sources.find(asset => asset.isMain || asset.type === "MAIN") ?? sources[0])?.id ?? "");
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [candidates, setCandidates] = React.useState<Asset[]>([]);
  const [busy, setBusy] = React.useState("");
  const [error, setError] = React.useState("");
  const [progress, setProgress] = React.useState("");
  const lock = React.useRef(false);
  const mounted = React.useRef(true);
  const assetCallback = React.useRef(onAsset); assetCallback.current = onAsset;
  const knownAssets = React.useRef(assets); knownAssets.current = assets;
  const draft: ReferenceDraft = { type: section.type, title: section.title, goal: section.goal, copy: section.copy, visualPrompt: section.visualPrompt };
  const plan = tasks.find(task => task.status === "SUCCESS" && task.inputPayload?.action === "plan" && task.inputPayload.sourceAssetId === sourceId && JSON.stringify(task.inputPayload.draft) === JSON.stringify(draft));
  const active = tasks.some(task => task.status === "RUNNING");
  const context = JSON.stringify({ sourceId, draft });
  const currentContext = React.useRef(context); currentContext.current = context;
  const uniqueShots = (plan?.outputPayload?.shots ?? []).map((shot: any, index: number) => ({ shot, index })).filter((item: any, index: number, list: any[]) => list.findIndex(other => referenceShotKey(sourceId, other.shot) === referenceShotKey(sourceId, item.shot)) === index);
  const missingShots = uniqueShots.filter((item: any) => !reusableReference(candidates, sourceId, item.shot));
  const endpoint = `/api/projects/${projectId}/sections/${section.id}/reference-images`;

  const load = React.useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.error?.message || "读取参考图记录失败");
    if (mounted.current) {
      setTasks(payload.data.tasks); setCandidates(payload.data.assets);
      for (const asset of payload.data.assets) {
        const known = knownAssets.current.find(item => item.id === asset.id);
        if (!known || JSON.stringify(known.metadata) !== JSON.stringify(asset.metadata)) assetCallback.current(asset);
      }
    }
  }, [endpoint]);
  React.useEffect(() => {
    mounted.current = true;
    void load().catch(err => { if (mounted.current) setError(err.message); });
    return () => { mounted.current = false; };
  }, [load]);
  React.useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => { void load().catch(() => undefined); }, 5000);
    return () => window.clearInterval(timer);
  }, [active, load]);

  async function run(action: "plan" | "generate" | "approve" | "batch", value?: number | string, force = false) {
    if (lock.current || disabled || active) return;
    lock.current = true; setBusy(action === "generate" ? `generate:${value}` : action); setError(""); setProgress(""); onBusy(true);
    try {
      const post = async (body: unknown) => {
        const response = await fetch(endpoint, { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(body) });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.error?.message || "参考图操作失败");
        if (payload.data.task?.status === "FAILED") throw new Error(payload.data.task.errorMessage || "任务失败，未自动重试");
        if (payload.data.pending || payload.data.task?.status === "RUNNING") throw new Error("相同视角正在生成，请等待完成后刷新；未重复提交图片模型");
        return payload.data;
      };
      if (action === "batch") {
        for (let index = 0; index < missingShots.length; index++) {
          if (!mounted.current || currentContext.current !== context) throw new Error("模块或 Prompt 已变化，已停止提交后续视角，已完成图片保留");
          setProgress(`正在补齐 ${index + 1}/${missingShots.length}：${missingShots[index].shot.title}`);
          await post({ action: "generate", requestId: crypto.randomUUID(), planId: plan!.id, shotIndex: missingShots[index].index });
          await load();
        }
        if (mounted.current) setProgress("所需视角已补齐，图片已进入全局参考图。");
        return;
      }
      const body = action === "plan" ? { action, requestId: crypto.randomUUID(), sourceAssetId: sourceId, draft }
        : action === "generate" ? { action, requestId: crypto.randomUUID(), planId: plan?.id, shotIndex: value, ...(force ? { force: true } : {}) }
        : { action, assetId: value };
      const result = await post(body);
      if (action === "approve") { onAsset(result.asset); onAdopt(section.id, result.asset); }
      await load();
    } catch (err) {
      if (mounted.current) {
        setError((err instanceof Error ? err.message : "操作失败") + "。已提交的任务及图片可通过“刷新记录”查看，请勿连续重复付费提交。");
        if (action === "batch") setProgress("批量已停止，已完成图片保留；可再次补齐缺少的视角。");
      }
      await load().catch(() => undefined);
    } finally {
      lock.current = false; onBusy(false);
      if (mounted.current) setBusy("");
    }
  }
  const source = sources.find(asset => asset.id === sourceId);
  React.useEffect(() => {
    if (!assets.some(asset => asset.id === sourceId && ["MAIN", "ANGLE", "DETAIL", "REFERENCE"].includes(asset.type) && !isModuleReference(asset))) {
      const originals = assets.filter(asset => ["MAIN", "ANGLE", "DETAIL", "REFERENCE"].includes(asset.type) && !isModuleReference(asset));
      setSourceId((originals.find(asset => asset.isMain || asset.type === "MAIN") ?? originals[0])?.id ?? "");
    }
  }, [assets, sourceId]);
  return <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3" aria-label="模块白底参考图生成">
    <h3 className="text-sm font-medium">为当前 Prompt 生成参考图</h3>
    <p className="text-xs text-muted-foreground">识别本模块需要的角度或特写，一键补齐白底参考图。生成结果进入当前商品的全局参考区，可跨模块复用，核对后勾选使用。</p>
    <Label htmlFor={`${id}-source`}>产品原图（同一款、同一颜色）</Label>
    <select id={`${id}-source`} className="h-10 w-full min-w-0 rounded-xl border border-input bg-background px-2 text-sm" value={sourceId} disabled={!!busy || active || disabled} onChange={event => setSourceId(event.target.value)}>
      {!sources.length && <option value="">请先上传产品图</option>}
      {sources.map(asset => <option key={asset.id} value={asset.id}>{asset.fileName}</option>)}
    </select>
    {source && <img src={source.url} alt="选定的产品原图" className="h-24 w-24 rounded-lg border border-border bg-white object-contain" />}
    <p className="text-xs text-muted-foreground">识别和新增图片按各自调用规则计费；已有同原图、同视角/部位的图片优先复用，不重复生图。批量逐张提交，失败即停止，成功结果保留；新角度仍需核对结构。</p>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={!!busy || active || disabled || !source || !draft.visualPrompt.trim()} onClick={() => void run("plan")}>{busy === "plan" ? "正在识别…" : plan ? "重新识别所需视角" : "识别 Prompt 所需视角"}</Button>
      <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void load().catch(err => setError(err.message))}>刷新记录</Button>
    </div>
    {plan && <div className="space-y-2">
      <Button size="sm" disabled={!!busy || active || disabled || !missingShots.length} onClick={() => void run("batch")}>{busy === "batch" ? "正在补齐视角…" : missingShots.length ? `一键生成缺少的角度（${missingShots.length} 张）` : "所需角度已有参考图"}</Button>
      <p className="text-xs text-muted-foreground">已复用 {uniqueShots.length - missingShots.length} 张，需新增 {missingShots.length} 张；仅新增图片调用编辑模型。切换模块或修改 Prompt 后停止提交后续图片。</p>
    </div>}
    {progress && <p role="status" className="text-xs text-muted-foreground">{progress}</p>}
    {active && <p role="status" className="text-xs text-muted-foreground">任务进行中，完成后会更新记录；切换模块不会取消已提交任务。</p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {uniqueShots.map(({ shot, index }: any) => {
      const reused = reusableReference(candidates, sourceId, shot);
      return <div key={`${plan!.id}:${index}`} className="space-y-2 rounded-lg border border-border p-2">
      <p className="text-sm font-medium">{shot.title}</p>
      <p className="text-xs text-muted-foreground">{shot.view} · {shot.target}</p>
      {reused ? <>
        <p className="text-xs text-muted-foreground">全局已有此视角，可直接复用，无需再次生成。</p>
        <Button size="sm" variant="outline" disabled={!!busy || active || disabled || section.editableData?.referenceAssetIds?.includes(reused.id)} onClick={() => void run("approve", reused.id)}>复用到此模块</Button>
        <Button size="sm" variant="ghost" disabled={!!busy || active || disabled} onClick={() => void run("generate", index, true)}>重新生成这张（计费）</Button>
      </> : <Button size="sm" variant="outline" disabled={!!busy || active || disabled} onClick={() => void run("generate", index)}>{busy === `generate:${index}` ? "正在生成…" : "生成这张白底参考图"}</Button>}
    </div>;
    })}
    {!plan && tasks.some(task => task.inputPayload?.action === "plan" && task.status === "SUCCESS") && <p className="text-xs text-muted-foreground">Prompt、模块内容或产品原图已变化，请重新识别，已有参考图仍保留。</p>}
    {tasks.filter(task => task.status === "FAILED").slice(0, 1).map(task => <p key={task.id} role="status" className="text-xs text-destructive">最近任务失败：{task.errorMessage || "未返回结果"}。未自动重试。</p>)}
    {candidates.length > 0 && <div className="space-y-3">
      <h4 className="text-sm font-medium">全局角度图 · 核对后采用</h4>
      {candidates.map(asset => {
        const meta = referenceMetadata(asset);
        const adopted = section.editableData?.referenceAssetIds?.includes(asset.id);
        return <div key={asset.id} className="space-y-2 rounded-lg border border-border p-2">
          <p className="text-xs">{(meta.referenceShot as any)?.title || "白底参考图"} · AI 生成{meta.referencePlanId !== plan?.id ? " · 之前的方案" : ""}</p>
          <a href={asset.url} target="_blank" rel="noreferrer" aria-label="查看生成参考图原图"><img src={asset.url} alt="生成的白底参考图" className="max-h-64 w-full rounded-lg bg-white object-contain" /></a>
          <Button size="sm" variant="outline" disabled={!!busy || active || disabled || adopted} onClick={() => void run("approve", asset.id)}>{adopted ? "已加入模块草稿" : "结构已核对，采用到此模块"}</Button>
        </div>;
      })}
      <p className="text-xs text-muted-foreground">结果已保存到当前商品的全局参考区；可直接勾选用于其他模块。这里“采用到模块”仍需保存模块草稿，不替换原图、详情图或历史版本。</p>
    </div>}
  </div>;
}
