"use client";

import { useEffect, useRef, useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Button } from "@/components/ui/button";
import { motuApiUrl } from "@/lib/utils/public-url";
import { PhotopeaBridge, PHOTOPEA_ORIGIN, validateFile, MAX_FILE_BYTES, type EditorState, type Format } from "@/lib/psd/photopea-bridge";
import type { PsdSession, PsdVersion } from "@/lib/services/psd-refinement";
import { useAuthStore } from "@/hooks/use-auth-store";
import { isPsdLayerEvent, parsePsdLayerSource, validatePsdLayerBundle, type PsdLayerBundle } from "@/lib/psd/layer-contract";

type Context = { session: PsdSession; versions: PsdVersion[]; versionId: string | null; expectedAssetId: string };
type Opening = Context | { recovery: Context };
export function PsdEditorPanel({ projectId, sectionId, assetId, title, onSaved, onClose }: {
  projectId: string; sectionId: string; assetId: string; title: string; onSaved: () => Promise<void>; onClose: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null), bridge = useRef<PhotopeaBridge | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const layerFrame = useRef<HTMLIFrameElement>(null);
  const [layerNonce, setLayerNonce] = useState<string | null>(null);
  const pendingLayers = useRef<(() => Promise<void>) | null>(null);
  const cancelLayers = useRef<(() => void) | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const contextRef = useRef<Context | null>(null), pendingSave = useRef<FormData | null>(null);
  const [context, setContext] = useState<Context | null>(null);
  const [recovery, setRecovery] = useState<Context | null>(null);
  const [state, setState] = useState<EditorState>("initializing"), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<"close" | "reload" | "source" | "import" | "apply-layers" | PsdVersion | null>(null);
  const [generation, setGeneration] = useState(0), [cover, setCover] = useState(false);
  const [focused, setFocused] = useState(true);
  const [versionChoice, setVersionChoice] = useState("");
  const base = motuApiUrl(`projects/${encodeURIComponent(projectId)}/sections/${encodeURIComponent(sectionId)}/psd`);
  const sourceId = useRef(assetId);
  const userId = useAuthStore((state) => state.userId), owner = useRef(userId), alive = useRef(true);
  const startRequestId = useRef(crypto.randomUUID());
  const assertActive = () => { if (!alive.current || useAuthStore.getState().userId !== owner.current) throw new Error("登录账号或编辑页面已变化，请重新进入商品"); };
  const url = `${PHOTOPEA_ORIGIN}/#${encodeURIComponent(JSON.stringify({ environment: { lang: "zh-CN", theme: 0, vmode: 0, intro: false, panels: [0, 2] } }))}`;
  const apply = (next: Context) => { contextRef.current = next; setContext(next); setVersionChoice(next.versionId ?? ""); };
  async function json<T>(url: string, init?: RequestInit): Promise<T> {
    assertActive();
    const response = await fetch(url, { ...init, cache: "no-store" }); const result = await response.json();
    assertActive();
    if (!response.ok || !result.success) throw new Error(result.error?.message ?? "精修请求失败");
    return result.data;
  }
  async function bytes(url: string, signal?: AbortSignal) {
    assertActive();
    const response = await fetch(url, { cache: "no-store", signal });
    if (!response.ok) throw new Error("精修文件读取失败，请重新打开或重试");
    const buffer = await response.arrayBuffer(); assertActive(); return buffer;
  }
  const versionUrl = (session: string, version: string, format: "psd" | "png") => `${base}/${session}/versions/${version}/${format}`;
  async function openContext(value: Context, adapter: PhotopeaBridge, signal?: AbortSignal) {
    const file = await bytes(value.versionId ? versionUrl(value.session.id, value.versionId, "psd") : `${base}/${value.session.id}/source`, signal);
    if (signal?.aborted) return;
    await adapter.open(file); await adapter.fitView();
    if (!signal?.aborted) { assertActive(); apply(value); }
  }
  useEffect(() => {
    if (owner.current !== userId) return;
    alive.current = true;
    const controller = new AbortController(); let opening = false;
    contextRef.current = null; setContext(null); setRecovery(null); setError(""); setState("initializing"); pendingSave.current = null;
    const adapter = new PhotopeaBridge(window, frame.current!.contentWindow!, (next, message) => {
      if (controller.signal.aborted) return;
      setState(next); if (message) setError(message);
      if (next !== "ready" || opening) return;
      opening = true;
      void (async () => {
        setBusy(true);
        try {
          const value = await json<Opening>(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: startRequestId.current, expectedAssetId: sourceId.current }), signal: controller.signal });
          if ("recovery" in value) { if (!controller.signal.aborted) setRecovery(value.recovery); return; }
          await openContext(value, adapter, controller.signal);
        } catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message); }
        finally { if (!controller.signal.aborted) setBusy(false); }
      })();
    });
    bridge.current = adapter;
    return () => { alive.current = false; controller.abort(); adapter.dispose(); bridge.current = null; };
  }, [projectId, sectionId, generation, userId]);
  useEffect(() => { frame.current?.toggleAttribute("inert", busy || !!layerNonce); }, [busy, layerNonce]);
  useEffect(() => {
    if (!layerNonce) return;
    let exported = false, receiving = false, assembling = false;
    const send = (type: string, extra = {}, transfer: Transferable[] = []) => layerFrame.current?.contentWindow?.postMessage({ type, nonce: layerNonce, ...extra }, window.location.origin, transfer);
    const receive = async (event: MessageEvent) => {
      if (!isPsdLayerEvent(event, { origin: window.location.origin, source: layerFrame.current?.contentWindow ?? null, nonce: layerNonce })) return;
      try {
        assertActive();
        if (event.data.type === "xc-psd-layers-ready" && !exported) {
          exported = true; setBusy(true);
          const buffer = await bridge.current!.export("png"); assertActive();
          const current = contextRef.current!;
          const binding = parsePsdLayerSource({ projectId, sectionId, sessionId: current.session.id, versionId: current.versionId });
          send("xc-psd-layers-source", { buffer, ownerId: owner.current, binding }, [buffer]); setBusy(false);
        } else if (event.data.type === "xc-psd-layers-result" && !receiving) {
          receiving = true;
          const bundle = event.data.bundle as PsdLayerBundle; validatePsdLayerBundle(bundle);
          cancelLayers.current = () => { receiving = false; pendingLayers.current = null; send("xc-psd-layers-cancelled"); };
          pendingLayers.current = async () => {
            assembling = true;
            try {
              assertActive(); await bridge.current!.assembleLayers(bundle); assertActive(); pendingSave.current = null;
              setNotice(`已组装并验证 ${bundle.rasters.length} 个图片层、${bundle.texts.length} 个可编辑文字层。请核对排版后保存并更新模块。`);
              send("xc-psd-layers-ack");
            } catch (cause) { receiving = false; send("xc-psd-layers-error", { message: (cause as Error).message }); throw cause; }
            finally { assembling = false; pendingLayers.current = null; cancelLayers.current = null; }
          };
          setConfirm("apply-layers");
        } else if (event.data.type === "xc-psd-layers-close" && !assembling) setLayerNonce(null);
      } catch (cause) { receiving = false; assembling = false; setBusy(false); setError((cause as Error).message); send("xc-psd-layers-error", { message: (cause as Error).message }); }
    };
    window.addEventListener("message", receive);
    return () => { window.removeEventListener("message", receive); pendingLayers.current = null; cancelLayers.current = null; };
  }, [layerNonce]);
  useEffect(() => {
    const tick = window.requestAnimationFrame(() => {
      if (contextRef.current && bridge.current?.state === "ready") void bridge.current.fitView().catch((cause: Error) => setError(cause.message));
    });
    return () => window.cancelAnimationFrame(tick);
  }, [focused, layerNonce]);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, []);
  const ready = state === "ready" && !!context && !busy && !layerNonce;
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  async function download(format: Format) {
    const file = await bridge.current!.export(format); assertActive();
    const href = URL.createObjectURL(new Blob([file]));
    const anchor = document.createElement("a"); anchor.href = href; anchor.download = `refined.${format}`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 10000);
  }
  async function save() {
    const current = contextRef.current!;
    if (!pendingSave.current) {
      const psd = await bridge.current!.export("psd"), preview = await bridge.current!.export("png");
      const form = new FormData();
      form.set("requestId", crypto.randomUUID()); form.set("expectedAssetId", current.expectedAssetId);
      if (current.versionId) form.set("parentVersionId", current.versionId);
      form.set("psd", new Blob([psd]), "refined.psd"); form.set("preview", new Blob([preview]), "preview.png"); pendingSave.current = form;
    }
    const version = await json<PsdVersion>(`${base}/${current.session.id}/versions`, { method: "POST", body: pendingSave.current });
    pendingSave.current = null; sourceId.current = version.previewAssetId;
    apply({ ...current, versionId: version.id, expectedAssetId: version.previewAssetId, versions: [version, ...current.versions.filter((item) => item.id !== version.id)] });
    setNotice(`已保存精修 v${version.versionNumber}，模块预览已更新；继续编辑后请再次保存。`);
    await onSaved();
  }
  async function resolveRecovery(mode: "new" | "resume") {
    const value = await json<Opening>(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: startRequestId.current, expectedAssetId: sourceId.current, recoveryMode: mode, recoveryVersionId: recovery!.versionId }) });
    if ("recovery" in value) throw new Error("精修记录已变化，请重新进入模块确认");
    await openContext(value, bridge.current!); setRecovery(null);
    setNotice(mode === "resume" ? "已打开同一来源的已保存 PSD；再次保存会创建新版本。" : "已基于当前模块图片新建；已有精修版本保留。");
  }
  async function confirmAction() {
    const action = confirm; setConfirm(null);
    if (action === "close") { onClose(); return; }
    if (action === "reload") { setGeneration((value) => value + 1); return; }
    if (action === "apply-layers") { await pendingLayers.current?.(); return; }
    const current = contextRef.current!;
    if (action === "import") {
      const file = importFile!;
      const buffer = await file.arrayBuffer(); validateFile(buffer, "psd");
      const form = new FormData(); form.set("file", file); form.set("requestId", crypto.randomUUID()); form.set("expectedAssetId", current.expectedAssetId);
      const next = await json<Context>(base, { method: "POST", body: form });
      await bridge.current!.open(buffer); await bridge.current!.fitView();
      pendingSave.current = null; setImportFile(null); apply(next);
      setNotice("已导入 PSD；保存并更新模块后才会替换商品预览，原图与已有版本保留。");
      return;
    }
    await bridge.current!.open(await bytes(action === "source" ? `${base}/${current.session.id}/source` : versionUrl(current.session.id, (action as PsdVersion).id, "psd")));
    await bridge.current!.fitView(); pendingSave.current = null;
    apply({ ...current, versionId: action === "source" ? null : (action as PsdVersion).id });
    setNotice("已打开所选文件；保存会创建新版本，已有版本不会覆盖。");
  }
  if (owner.current !== userId) return <section role="alert" className="rounded-xl border border-border p-4">登录账号已变化，请重新进入商品工作台。</section>;
  return <section className="motu-psd-editor flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-border bg-card" data-focused={focused} aria-label="商品 PSD 精修工作区">
    <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
      <span className="mr-auto min-w-0 truncate text-sm font-medium" title={title}>PSD 精修 · {title}</span>
      <Button size="sm" variant="outline" aria-pressed={focused} onClick={() => setFocused((value) => !value)}>{focused ? "退出专注精修" : "专注精修"}</Button>
      <Button size="sm" disabled={!ready} onClick={() => void run(save)}>{pendingSave.current ? "重试上次保存" : "保存并更新模块"}</Button>
      {(["psd", "png", "jpg"] as const).map((format) => <Button key={format} size="sm" variant="outline" disabled={!ready} onClick={() => void run(() => download(format))}>{format.toUpperCase()}</Button>)}
      <Button size="sm" variant="outline" disabled={busy || !!layerNonce} onClick={() => setConfirm("reload")}>重新连接</Button>
      <Button size="sm" variant="outline" disabled={busy || !!layerNonce} onClick={() => setConfirm("close")}>返回商品预览</Button>
    </div>
    <div className="flex flex-wrap items-center gap-2 p-2 text-xs text-muted-foreground">
      <Button size="sm" variant="ghost" disabled={!ready} onClick={() => void run(() => bridge.current!.fitView())}>适合窗口</Button>
      <Button size="sm" variant="outline" disabled={!ready} onClick={() => importInput.current?.click()}>导入 PSD</Button>
      <Button size="sm" variant="outline" aria-pressed={!!layerNonce} disabled={!ready} onClick={() => setLayerNonce(crypto.randomUUID())}>AI 自动分层</Button>
      <input ref={importInput} type="file" accept=".psd" aria-label="选择 PSD 文件" className="hidden" disabled={!ready} onChange={(event) => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (!file) return;
        if (!file.size || file.size > MAX_FILE_BYTES) { setError("PSD 文件须大于 0 且不超过 50 MB。"); return; }
        setImportFile(file); setConfirm("import");
      }} />
      <Button size="sm" variant="ghost" disabled={!ready} onClick={() => setConfirm("source")}>打开原文件</Button>
      <select aria-label="精修历史版本" className="h-8 max-w-48 rounded-lg border border-input bg-card px-2" disabled={!ready} value={versionChoice} onChange={(event) => { const version = context?.versions.find((item) => item.id === event.target.value); if (version) setConfirm(version); }}><option value="">导入时原件</option>{context?.versions.map((version) => <option key={version.id} value={version.id}>精修 v{version.versionNumber}</option>)}</select>
      <Button size="sm" variant="ghost" aria-pressed={cover} onClick={() => setCover((value) => !value)}>{cover ? "显示右侧区域" : "遮挡右侧区域"}</Button>
      <span>普通图片为合成图层；新增文字可保留真实文字层。</span>
    </div>
    {error && <p role="alert" className="border-y border-border px-3 py-2 text-sm text-destructive">{error}{pendingSave.current ? "；重试会提交上次导出的内容。可先下载 PSD 保留后续编辑。" : ""}</p>}
    {notice && <p role="status" className="px-3 py-1 text-xs text-muted-foreground">{notice}</p>}
    <div className="flex min-h-0 flex-1 overflow-hidden">
    <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-muted">
      <iframe key={generation} ref={frame} src={url} title="Photopea 商品 PSD 编辑器" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full border-0" />
      {cover && <div aria-hidden="true" className="absolute inset-y-0 right-0 w-[min(300px,35%)] border-l border-border bg-card" />}
      {(busy || state === "initializing" || recovery) && <div role="status" className="absolute inset-0 grid place-items-center bg-card/80 text-sm">{recovery ? "请选择继续已有精修或新建" : state === "initializing" ? "正在连接编辑器…" : "正在处理文件，请稍候…"}</div>}
    </div>
    {layerNonce && <aside aria-label="AI 自动分层面板" className="h-full w-[min(420px,48%)] shrink-0 border-l border-border bg-card"><iframe ref={layerFrame} title="AI 自动分层设置与结果" src={`/tools/psd-layers?nonce=${layerNonce}`} className="h-full w-full border-0" /></aside>}
    </div>
    <AlertDialog.Root open={!!recovery}><AlertDialog.Portal>
      <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
      <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(95vw,520px)] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-2xl border border-border bg-card p-5 text-foreground shadow-lg">
        <AlertDialog.Title className="font-semibold">此来源已有保存的精修版本</AlertDialog.Title>
        <AlertDialog.Description className="text-sm text-muted-foreground">{title} 已有精修 v{recovery?.versions.find((item) => item.id === recovery.versionId)?.versionNumber}。继续编辑会打开已保存的 PSD；新建会从当前模块图片开始，保留已有版本。打开文件不会修改商品预览。</AlertDialog.Description>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2"><AlertDialog.Cancel asChild><Button variant="outline" disabled={busy} onClick={onClose}>返回商品预览</Button></AlertDialog.Cancel><Button variant="outline" disabled={busy} onClick={() => void run(() => resolveRecovery("new"))}>基于当前图新建</Button><Button disabled={busy} onClick={() => void run(() => resolveRecovery("resume"))}>继续编辑已有 PSD</Button></div>
      </AlertDialog.Content>
    </AlertDialog.Portal></AlertDialog.Root>
    <AlertDialog.Root open={confirm !== null} onOpenChange={(open) => { if (!open) { if (confirm === "apply-layers") { cancelLayers.current?.(); cancelLayers.current = null; } setConfirm(null); } }}><AlertDialog.Portal>
      <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
      <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(95vw,480px)] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-2xl border border-border bg-card p-5 text-foreground shadow-lg">
        <AlertDialog.Title className="font-semibold">先保留当前编辑内容</AlertDialog.Title>
        <AlertDialog.Description className="text-sm text-muted-foreground">{confirm === "apply-layers" ? "即将打开新的分层文档，当前文档和已保存版本保留。请先下载 PSD 保留当前修改；分层结果应用后仍需保存并更新模块。" : "编辑器无法完整感知所有未保存修改。继续会离开或替换当前文档，请先保存或下载 PSD；已保存版本和原文件不会删除。"}</AlertDialog.Description>
        <div className="flex flex-wrap justify-end gap-2"><AlertDialog.Cancel asChild><Button variant="outline">{confirm === "apply-layers" ? "暂不应用" : "继续编辑"}</Button></AlertDialog.Cancel><Button variant="outline" disabled={busy || state !== "ready"} onClick={() => void run(() => download("psd"))}>下载 PSD</Button><Button disabled={busy} onClick={() => void run(confirmAction)}>{confirm === "apply-layers" ? "应用分层" : "继续操作"}</Button></div>
      </AlertDialog.Content>
    </AlertDialog.Portal></AlertDialog.Root>
  </section>;
}
