import { useEffect, useRef, useState } from "react";
import { Alert, Button, Spin } from "antd";
import { PsdTextLayerEditor } from "./psd-text-layer-editor";
import { CanvasNodeLayerDecompositionDialog, type CanvasImageLayerDecompositionPayload } from "@/components/canvas/canvas-node-layer-decomposition-dialog";
import { recoverPsdLayerWorkflow, runPsdLayerWorkflow, type PsdLayerResult } from "@/services/psd-layer-workflow";
import { psdRecoveryBatches, psdTaskImages, type PsdRecoveryBatch } from "@/lib/psd-layer-recovery";
import { listGenerationTasks } from "@/services/api/task-center";
import { resolveResourceUrl } from "@/services/api/resources";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import type { ReferenceImage } from "@/types/image";
import { isPsdLayerEvent, parsePsdLayerSource, validatePsdLayerBundle, type PsdLayerSource } from "@/lib/psd-layer-contract";

export default function PsdLayersPage() {
  const config = useEffectiveConfig(), userId = useUserStore((state) => state.user?.id);
  const owner = useRef(userId), controller = useRef<AbortController | null>(null), alive = useRef(true), initialized = useRef(false);
  const nonce = new URLSearchParams(location.search).get("nonce") || "";
  const [source, setSource] = useState<ReferenceImage | null>(null), [dialog, setDialog] = useState(true), [busy, setBusy] = useState(false);
  const [binding, setBinding] = useState<PsdLayerSource | null>(null);
  const [status, setStatus] = useState("等待精修编辑器发送当前图片…"), [error, setError] = useState("");
  const [result, setResult] = useState<PsdLayerResult | null>(null), [ack, setAck] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [partial, setPartial] = useState<Array<{ name: string; url: string }>>([]);
  const [recoveryBatches, setRecoveryBatches] = useState<PsdRecoveryBatch[] | null>(null), [recoveryId, setRecoveryId] = useState("");
  const urls = useRef<string[]>([]);
  const send = (type: string, extra = {}, transfer: Transferable[] = []) => window.parent.postMessage({ type, nonce, ...extra }, location.origin, transfer);
  const assertActive = () => { if (!alive.current || useUserStore.getState().user?.id !== owner.current) throw new Error("账号或页面已变化，请重新进入精修"); };
  useEffect(() => {
    alive.current = true;
    if (window.parent === window || !/^[0-9a-f-]{36}$/i.test(nonce)) { setError("请从商品 PSD 精修中的 AI 自动分层入口打开"); return; }
    const receive = async (event: MessageEvent) => {
      if (!isPsdLayerEvent(event, { origin: location.origin, source: window.parent, nonce })) return;
      const message = event.data;
      if (message.type === "xc-psd-layers-ack") { setAck(true); setBusy(false); setDelivering(false); setStatus("已应用到左侧精修。关闭面板后核对排版，保存并更新模块。"); return; }
      if (message.type === "xc-psd-layers-cancelled") { setBusy(false); setDelivering(false); setStatus("暂未应用，分层结果仍保留在此面板。"); return; }
      if (message.type === "xc-psd-layers-error") { setError(String(message.message || "PSD 组装失败")); setBusy(false); setDelivering(false); return; }
      if (message.type !== "xc-psd-layers-source" || initialized.current) return;
      try {
        assertActive();
        if (message.ownerId !== owner.current || !(message.buffer instanceof ArrayBuffer) || !message.buffer.byteLength || message.buffer.byteLength > 50 * 1024 * 1024) throw new Error("图片来源或大小无效");
        const sourceBinding = parsePsdLayerSource(message.binding);
        initialized.current = true;
        const blob = new Blob([message.buffer], { type: "image/png" }), url = URL.createObjectURL(blob); urls.current.push(url);
        const bitmap = await createImageBitmap(blob);
        try {
          if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 16_777_216) throw new Error("图片超过拆层像素上限");
          assertActive(); setSource({ id: nonce, name: "psd-current.png", dataUrl: url, type: "image/png", width: bitmap.width, height: bitmap.height }); setStatus("基于当前文档快照拆分；面板打开期间暂停画布编辑。");
          setBinding(sourceBinding);
        } finally { bitmap.close(); }
      } catch (cause) { setError((cause as Error).message); }
    };
    window.addEventListener("message", receive); send("xc-psd-layers-ready");
    return () => { alive.current = false; controller.current?.abort(); window.removeEventListener("message", receive); urls.current.forEach(URL.revokeObjectURL); urls.current = []; };
  }, [nonce]);
  useEffect(() => { if (userId !== owner.current) { controller.current?.abort(); setError("登录账号已变化，请返回精修后重新进入"); } }, [userId]);
  function showPartial(index: number, name: string, blob: Blob) {
    assertActive(); const url = URL.createObjectURL(blob); urls.current.push(url); setPartial((items) => { const updated = [...items]; updated[index] = { name, url }; return updated; });
  }
  function failed(cause: unknown) {
    if (!alive.current) return;
    setError((cause as Error).name === "AbortError" ? "已停止；已完成素材保留在下方和任务记录中。" : (cause as Error).message);
    setStatus("本次分层未完成；已生成素材保留，可读取已有任务恢复，无需重新生成。");
  }
  async function loadRecovery() {
    if (busy || !binding) return;
    setBusy(true); setError("");
    const abort = new AbortController(); controller.current = abort;
    try {
      const tasks = await listGenerationTasks(100, undefined, undefined, abort.signal); assertActive();
      const batches = psdRecoveryBatches(tasks, binding); setRecoveryBatches(batches); setRecoveryId(batches[0]?.id || "");
      setStatus(batches.length ? "请核对这批图片是否属于当前文档；恢复只读取已完成任务，不调用模型。" : "最近 100 个任务中没有可完整恢复的分层批次，请在任务记录中保留已有图片。");
    } catch (cause) { failed(cause); }
    finally { if (alive.current) setBusy(false); }
  }
  async function recover() {
    const batch = recoveryBatches?.find((item) => item.id === recoveryId);
    if (!source || !binding || !batch || busy) return;
    setBusy(true); setDialog(false); setError(""); setAck(false); setPartial([]); setResult(null);
    const abort = new AbortController(); controller.current = abort;
    setStatus("正在读取已生成图层并验证透明度，不调用模型…");
    try {
      const next = await recoverPsdLayerWorkflow(source, batch, abort.signal, assertActive, showPartial, binding);
      assertActive(); setResult(next); setRecoveryBatches(null); setStatus("已有图层恢复并校验完成，请核对文字后应用到精修。");
    } catch (cause) { failed(cause); }
    finally { if (alive.current) setBusy(false); }
  }
  async function start(payload: CanvasImageLayerDecompositionPayload) {
    if (!source || !binding || busy) return;
    setDialog(false); setBusy(true); setError(""); setResult(null); setPartial([]); setAck(false);
    const abort = new AbortController(); controller.current = abort;
    try {
      const next = await runPsdLayerWorkflow(source, payload, config, abort.signal, assertActive, setStatus, showPartial, binding);
      assertActive(); setResult(next); setStatus("图层已完成。请校对识别文字与图片，再送入 PSD；字体为近似重建，可在精修中继续调整。");
    } catch (cause) { abort.abort(); failed(cause); }
    finally { if (alive.current) setBusy(false); }
  }
  async function deliver() {
    if (!result || busy) return;
    setBusy(true); setDelivering(true); setError("");
    try {
      assertActive(); const rasters = await Promise.all(result.blobs.map(async (blob, i) => ({ name: result.bundle.rasters[i].name, buffer: await blob.arrayBuffer() })));
      validatePsdLayerBundle({ ...result.bundle, rasters });
      assertActive(); send("xc-psd-layers-result", { bundle: { ...result.bundle, rasters } }, rasters.map((layer) => layer.buffer)); setStatus("正在精修编辑器中组装并验证 PSD 图层与文字往返…");
    } catch (cause) { setError((cause as Error).message); setBusy(false); setDelivering(false); }
  }
  if (userId !== owner.current) return <Alert type="error" message="登录账号已变化，请重新进入" />;
  return <main className="min-h-screen bg-[var(--background)] p-3 text-[var(--foreground)]">
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2"><h1 className="mr-auto text-base font-semibold">AI 自动分层</h1><Button disabled={busy} onClick={() => send("xc-psd-layers-close")}>关闭面板</Button></div>
      <details className="text-xs opacity-75"><summary className="cursor-pointer">调用费用与结果说明</summary><p className="mt-2">按所选模型计费：2 次视觉识别，另按计划生成图片；不透明前景可能追加去背景。失败不自动重试。文字与字体需校对，应用后请手动保存。关闭面板会丢弃未应用的校对结果，已生成素材保留在任务记录中。</p></details>
      {error && <Alert type="error" message={error} />}
      <p role="status">{busy && !ack && <Spin size="small" />} {status}</p>
      <Button disabled={busy || !source} onClick={() => void loadRecovery()}>读取已有分层任务（不生图）</Button>
      {recoveryBatches && recoveryBatches.length > 0 && <section className="space-y-3 rounded-lg border border-[var(--border)] p-3" aria-label="恢复已生成图层">
        <label className="block text-sm">选择已生成批次<select aria-label="已生成分层批次" className="mt-2 w-full rounded border border-[var(--border)] bg-[var(--background)] p-2" disabled={busy} value={recoveryId} onChange={(event) => setRecoveryId(event.target.value)}>{recoveryBatches.map((batch) => <option key={batch.id} value={batch.id}>{new Date(batch.createdAt).toLocaleString()} · {batch.images.length} 个图片任务</option>)}</select></label>
        <div className="grid grid-cols-2 gap-2">{recoveryBatches.find((batch) => batch.id === recoveryId)?.images.flatMap((task) => psdTaskImages(task).map((image, i) => <img key={`${task.id}-${i}`} src={resolveResourceUrl(image.storageKey, image.dataUrl)} alt="已有分层图片，请核对来源" className="max-h-40 w-full object-contain" />))}</div>
        <p className="text-xs opacity-75">已记录来源的新批次仅显示当前商品模块与精修版本；旧任务仍需人工确认图片来源。尺寸、文字与透明度会重新校验，缺层或候选不唯一时停止，不会付费补图。</p>
        <Button disabled={busy} onClick={() => void recover()}>确认此批次，读取并校验</Button>
      </section>}
      {!dialog && !busy && !ack && <Button disabled={!source} onClick={() => setDialog(true)}>重新规划（重新计费）</Button>}
      {busy && !delivering && <Button onClick={() => controller.current?.abort()}>停止待执行请求</Button>}
      <CanvasNodeLayerDecompositionDialog inline open={dialog} dataUrl={source?.dataUrl || ""} sourceSize={source ? { width: source.width!, height: source.height! } : undefined} config={config} onClose={() => setDialog(false)} onConfirm={(payload) => void start(payload)} />
      <div className="grid min-w-0 gap-3">
        <div className="space-y-3"><div className="grid grid-cols-2 gap-3">{partial.map((layer, i) => layer && <div key={i} className="rounded-lg border border-[var(--border)] p-2"><p>{layer.name}</p><a href={layer.url} download={`layer-${i}.png`}><img src={layer.url} alt={layer.name} className="max-h-48 w-full object-contain" /></a></div>)}</div>
        {result && <><p>原生文字层 {result.bundle.texts.length} 个（校对后可编辑；商品实物上的印刷文字保持图片）</p><PsdTextLayerEditor lines={result.bundle.texts} width={result.bundle.width} height={result.bundle.height} disabled={busy || ack} onChange={(texts) => setResult((current) => current ? { ...current, bundle: { ...current.bundle, texts } } : current)} /><Button type="primary" disabled={busy || ack || result.bundle.texts.some((line) => !line.text.trim())} onClick={() => void deliver()}>应用到当前精修</Button></>}
        </div>
      </div>
    </div>
  </main>;
}
