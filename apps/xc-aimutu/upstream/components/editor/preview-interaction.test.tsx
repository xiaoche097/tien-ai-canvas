import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { act } from "react";
import { Simulate } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { WorkbenchPageFrame } from "./workbench-page-frame";
import { useEditorStore } from "@/hooks/use-editor-store";
import { ProjectOutputConfigCard } from "@/components/shared/project-output-config-card";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AnalysisWorkspace } from "@/components/analysis/analysis-workspace";
import { QuickStartWorkspace } from "@/components/projects/quick-start-workspace";

const { Window } = createRequire(new URL("../../../../../web/package.json", import.meta.url))("happy-dom");

test("device, zoom, gallery and expand preserve the real editor draft without network writes", async () => {
  const browser = new Window({ url: "http://localhost/" });
  const globals = { window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node, NodeFilter: browser.NodeFilter, HTMLInputElement: browser.HTMLInputElement, MutationObserver: browser.MutationObserver, CustomEvent: browser.CustomEvent, getComputedStyle: browser.getComputedStyle.bind(browser), IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class { constructor(private callback: any) {} observe() { this.callback([{ contentRect: { width: 800, height: 700 } }]); } disconnect() {} } };
  const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  // Radix captures DOM availability when imported; load the real workspace
  // after installing the browser environment so confirmation portals mount.
  const { EditorWorkspace } = await import("./editor-workspace");
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/reference-images") && !init?.method) return Response.json({ success: true, data: { tasks: [], assets: [] } });
    requests.push(String(url)); throw new Error("Unexpected request");
  };
  const container = browser.document.createElement("div"); browser.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const section = { id: "hero-a", type: "HERO", status: "GENERATED", title: "主图 A", goal: "目标", copy: "文案", visualPrompt: "原始 Prompt", editableData: { heroAspectRatio: "3:4" }, currentImageAssetId: "asset-a", imageUrl: "/version-a.png", versions: [{ id: "old-version", versionNumber: 1, isActive: false }] };
  const project = { id: "interaction-project", name: "商品", platform: "amazon", sections: [section, { ...section, id: "hero-b", title: "主图 B", imageUrl: "/version-b.png" }, { ...section, id: "detail-a", type: "DETAIL_CLOSEUP", title: "商品细节", imageUrl: "/detail-a.png" }, { ...section, id: "hero-empty", title: "待生成主图", imageUrl: null, currentImageAssetId: null }], assets: [], tasks: [], modelSnapshot: { previewConfig: { heroAspectRatio: "3:4" } } };
  useEditorStore.setState({ selectedSectionId: "hero-a", previewDevices: {} });
  const button = (label: string) => {
    const element = [...browser.document.querySelectorAll("button")].find((item: any) => item.textContent === label);
    assert.ok(element, label); return element;
  };
  try {
    await act(async () => { root.render(<WorkbenchPageFrame title={project.name} header={<button>批量生成入口</button>} configuration={<p>项目配置</p>}><EditorWorkspace project={project} /></WorkbenchPageFrame>); });
    const prompt = container.querySelectorAll("textarea")[1];
    await act(async () => { Simulate.change(prompt as unknown as Element, { target: { value: "尚未保存的 Prompt 草稿" } } as any); });
    assert.equal(container.querySelectorAll("textarea")[1].value, "尚未保存的 Prompt 草稿");
    const previewImage = container.querySelector("img");
    await act(async () => { button("专注预览").click(); });
    assert.equal(container.querySelector(".motu-workbench-page")?.getAttribute("data-focused"), "true");
    assert.equal(container.querySelectorAll("textarea")[1], prompt);
    assert.equal(container.querySelector("img"), previewImage);
    assert.equal(button("批量生成入口").parentElement?.hidden, true);
    await act(async () => { button("退出专注").click(); });
    assert.equal(container.querySelector(".motu-workbench-page")?.getAttribute("data-focused"), "false");
    assert.equal(button("批量生成入口").parentElement?.hidden, false);
    assert.equal(container.querySelectorAll("textarea")[1].value, "尚未保存的 Prompt 草稿");
    assert.equal(button("桌面端").getAttribute("aria-pressed"), "true");
    await act(async () => { button("移动端").click(); });
    await act(async () => { button("扩大预览").click(); });
    assert.equal(container.querySelectorAll("textarea")[1], prompt, "editor remains mounted");
    assert.equal(prompt.value, "尚未保存的 Prompt 草稿");
    await act(async () => { button("恢复三栏").click(); button("桌面端").click(); });
    const zoom = container.querySelector('[aria-label="预览缩放"]')!;
    await act(async () => { Simulate.change(zoom as unknown as Element, { target: { value: "100" } } as any); });
    const thumbnail = container.querySelector('[aria-label="预览主图：主图 B"]') as any;
    await act(async () => { thumbnail.click(); });
    assert.equal(container.querySelector('[aria-label="预览主图：主图 B"]')?.getAttribute("aria-pressed"), "true");
    assert.equal(useEditorStore.getState().selectedSectionId, "hero-a");
    assert.equal(container.querySelectorAll("textarea")[1].value, "尚未保存的 Prompt 草稿");
    assert.equal((container.querySelector("#hero-aspect-ratio") as unknown as HTMLSelectElement)?.value, "1:1");
    assert.equal((container.querySelector("#hero-aspect-ratio") as unknown as HTMLSelectElement)?.disabled, true);
    assert.equal(project.sections[0].editableData.heroAspectRatio, "3:4", "preview does not rewrite historical configuration");
    assert.deepEqual(requests, []);
    const titleInput = container.querySelector("#workbench-right-panel input")!;
    await act(async () => { Simulate.change(titleInput as any, { target: { value: "未保存的标题" } } as any); });
    const moduleButtons = container.querySelectorAll("#workbench-left-panel button");
    const desktop = container.querySelector('[data-preview-device="desktop"]')!;
    const mobile = container.querySelector('[data-preview-device="mobile"]')!;
    const desktopScroll = desktop.querySelector('[data-preview-scroll]') as any;
    const mobileScroll = mobile.querySelector('[data-preview-scroll]') as any;
    const rect = (top: number) => ({ top, bottom: top + 100, left: 0, right: 100, width: 100, height: 100, x: 0, y: top, toJSON() {} });
    desktopScroll.getBoundingClientRect = () => rect(20);
    mobileScroll.getBoundingClientRect = () => rect(10);
    let desktopDetailTop = 220;
    (desktop.querySelector('[data-preview-section="detail-a"]') as any).getBoundingClientRect = () => rect(desktopDetailTop - desktopScroll.scrollTop);
    (mobile.querySelector('[data-preview-section="detail-a"]') as any).getBoundingClientRect = () => rect(110 - mobileScroll.scrollTop);
    await act(async () => { (moduleButtons[2] as any).click(); });
    assert.equal(desktopScroll.scrollTop, 200, "detail selection scrolls only the desktop preview to its image");
    assert.ok(container.textContent?.includes("当前模块：商品细节"));
    assert.equal(desktop.querySelector('[data-preview-section="detail-a"] img')?.getAttribute("src"), "/detail-a.png");
    const detailImage = desktop.querySelector('[data-preview-section="detail-a"] img')!;
    desktopDetailTop += 80;
    await act(async () => { detailImage.dispatchEvent(new browser.Event("load")); });
    assert.equal(desktopScroll.scrollTop, 280, "late image layout keeps the selected module aligned");
    desktopScroll.dispatchEvent(new browser.Event("wheel"));
    desktopDetailTop += 80;
    await act(async () => { detailImage.dispatchEvent(new browser.Event("load")); });
    assert.equal(desktopScroll.scrollTop, 280, "manual browsing stops automatic realignment");
    await act(async () => { button("移动端").click(); });
    assert.equal(mobileScroll.scrollTop, 100, "device switching keeps the selected detail visible");
    mobileScroll.scrollTop = 0;
    await act(async () => { (moduleButtons[2] as any).click(); });
    assert.equal(mobileScroll.scrollTop, 100, "clicking the same module locates it again");
    await act(async () => { button("桌面端").click(); (moduleButtons[3] as any).click(); });
    assert.ok(container.textContent?.includes("当前模块：待生成主图 · 尚未生成图像"));
    assert.equal(desktop.querySelector('[data-preview-hero] [aria-label^="查看原图"]'), null, "an ungenerated hero cannot display another module's image");
    await act(async () => { (moduleButtons[1] as any).click(); });
    assert.equal(useEditorStore.getState().selectedSectionId, "hero-b");
    assert.equal(desktop.querySelector('[data-preview-hero] [aria-label="查看原图：主图 B"] img')?.getAttribute("src"), "/version-b.png");
    assert.equal(desktop.querySelector('[aria-label="预览主图：主图 B"]')?.getAttribute("aria-pressed"), "true");
    await act(async () => { (moduleButtons[0] as any).click(); });
    assert.equal(desktop.querySelector('[data-preview-hero] [aria-label="查看原图：未保存的标题"] img')?.getAttribute("src"), "/version-a.png");
    assert.equal((container.querySelector("#workbench-right-panel input") as any).value, "未保存的标题");
    assert.equal(container.querySelectorAll("textarea")[1].value, "尚未保存的 Prompt 草稿");
    assert.deepEqual(requests, [], "module selection and draft edits do not submit generation");
    const versionRequests: string[] = [];
    globalThis.fetch = async (url, init) => {
      versionRequests.push(`${init?.method ?? "GET"} ${url}`);
      return Response.json({ success: true, data: project });
    };
    await act(async () => { button("设为当前").click(); });
    assert.deepEqual(versionRequests, ["PATCH /api/projects/interaction-project/sections/hero-a/versions/old-version/activate", "GET /api/projects/interaction-project"]);
    const originalEditorNode = container.querySelectorAll("textarea")[1];
    await act(async () => { button("PSD 精修").click(); });
    assert.ok(container.querySelector('[aria-label="商品 PSD 精修工作区"]'));
    const psdFrame = container.querySelector('iframe[title="Photopea 商品 PSD 编辑器"]');
    assert.equal(container.querySelector(".motu-psd-editor")?.getAttribute("data-focused"), "true");
    const requestsBeforeFocus = versionRequests.length;
    await act(async () => { button("退出专注精修").click(); });
    assert.equal(container.querySelector(".motu-psd-editor")?.getAttribute("data-focused"), "false");
    await act(async () => { button("专注精修").click(); });
    assert.equal(container.querySelector(".motu-psd-editor")?.getAttribute("data-focused"), "true");
    assert.equal(container.querySelector('iframe[title="Photopea 商品 PSD 编辑器"]'), psdFrame, "focus toggles preserve the live PSD iframe");
    assert.equal(versionRequests.length, requestsBeforeFocus, "focus does not reload business data or generate images");
    assert.equal(container.querySelectorAll("textarea")[1], originalEditorNode, "business editor stays mounted in PSD mode");
    const requestsBeforePsdShortcut = versionRequests.length;
    await act(async () => { browser.window.dispatchEvent(new browser.window.KeyboardEvent("keydown", { key: "s", ctrlKey: true, cancelable: true })); });
    assert.equal(versionRequests.length, requestsBeforePsdShortcut, "PSD mode must not save the hidden module form");
    await act(async () => { button("返回商品预览").click(); });
    await act(async () => { button("继续编辑").click(); });
    assert.ok(container.querySelector('[aria-label="商品 PSD 精修工作区"]'), "canceling exit retains PSD editor");
    await act(async () => { button("返回商品预览").click(); });
    await act(async () => { button("继续操作").click(); });
    assert.equal(container.querySelector('[aria-label="商品 PSD 精修工作区"]'), null);
    assert.equal(container.querySelectorAll("textarea")[1], originalEditorNode);
    const recoveryRequests: string[] = [];
    globalThis.fetch = async (url, init) => {
      if (init?.method === "POST" && String(url).endsWith("/psd")) {
        const body = JSON.parse(String(init.body)); recoveryRequests.push(body.recoveryMode ?? "offer");
        if (body.recoveryMode) return Response.json({ success: false, error: { message: "模块图片已变化，请重新进入" } }, { status: 409 });
        return Response.json({ success: true, data: { recovery: { session: { id: "saved-session" }, versions: [{ id: "saved-version", versionNumber: 3 }], versionId: "saved-version", expectedAssetId: "asset-a" } } });
      }
      return Response.json({ success: true, data: project });
    };
    await act(async () => { button("PSD 精修").click(); });
    const recoveryFrame = container.querySelector('iframe[title="Photopea 商品 PSD 编辑器"]') as any;
    await act(async () => { browser.dispatchEvent(new browser.MessageEvent("message", { data: "done", origin: "https://www.photopea.com", source: recoveryFrame.contentWindow })); });
    assert.ok(browser.document.querySelector('[role="alertdialog"]')?.textContent?.includes("此来源已有保存的精修版本"));
    assert.equal(recoveryRequests.length, 1, "offering recovery does not load or create another document");
    await act(async () => { button("继续编辑已有 PSD").click(); });
    assert.ok(browser.document.querySelector('[role="alertdialog"]')?.textContent?.includes("模块图片已变化"));
    await act(async () => { button("基于当前图新建").click(); });
    assert.deepEqual(recoveryRequests, ["offer", "resume", "new"]);
    assert.equal(container.querySelector('iframe[title="Photopea 商品 PSD 编辑器"]'), recoveryFrame);
    const recoveryCancel = [...browser.document.querySelector('[role="alertdialog"]').querySelectorAll("button")].find((item: any) => item.textContent === "返回商品预览");
    await act(async () => { recoveryCancel.click(); });
    assert.equal(container.querySelector('[aria-label="商品 PSD 精修工作区"]'), null);
    assert.equal(container.querySelectorAll("textarea")[1], originalEditorNode);
    const { PhotopeaBridge } = await import("@/lib/psd/photopea-bridge");
    const savedBridge = { open: PhotopeaBridge.prototype.open, fitView: PhotopeaBridge.prototype.fitView, assembleLayers: PhotopeaBridge.prototype.assembleLayers, export: PhotopeaBridge.prototype.export };
    let assembled = 0;
    PhotopeaBridge.prototype.open = async () => ({ name: "source", width: 32, height: 40, layers: 1, text: [] });
    PhotopeaBridge.prototype.fitView = async () => {};
    PhotopeaBridge.prototype.assembleLayers = async () => { assembled++; };
    PhotopeaBridge.prototype.export = async () => new ArrayBuffer(33);
    try {
      globalThis.fetch = async (url, init) => init?.method === "POST"
        ? Response.json({ success: true, data: { session: { id: "inline-session" }, versions: [], versionId: null, expectedAssetId: "asset-a" } })
        : String(url).endsWith("/source") ? new Response(new ArrayBuffer(33)) : Response.json({ success: true, data: project });
      await act(async () => { button("PSD 精修").click(); });
      const inlineEditor = container.querySelector('iframe[title="Photopea 商品 PSD 编辑器"]') as any;
      await act(async () => { browser.dispatchEvent(new browser.MessageEvent("message", { data: "done", origin: "https://www.photopea.com", source: inlineEditor.contentWindow })); });
      await act(async () => { button("AI 自动分层").click(); });
      const panel = container.querySelector('[aria-label="AI 自动分层面板"]');
      assert.ok(panel, "AI entry opens an inline panel");
      assert.equal(browser.document.querySelector('[role="alertdialog"]'), null, "opening configuration needs no leave-document confirmation");
      assert.equal(container.querySelector('iframe[title="Photopea 商品 PSD 编辑器"]'), inlineEditor);
      const layerFrame = panel.querySelector("iframe") as any;
      const nonce = new URL(layerFrame.src).searchParams.get("nonce");
      const messages: any[] = [];
      layerFrame.contentWindow.postMessage = (message: any) => { messages.push(message); };
      await act(async () => { browser.dispatchEvent(new browser.MessageEvent("message", { origin: "http://localhost", source: layerFrame.contentWindow, data: { type: "xc-psd-layers-ready", nonce } })); });
      assert.deepEqual(messages.find((message) => message.type === "xc-psd-layers-source")?.binding, { projectId: project.id, sectionId: "hero-a", sessionId: "inline-session", versionId: null }, "the current editor source travels with its snapshot");
      const buffer = new ArrayBuffer(33), header = new Uint8Array(buffer), view = new DataView(buffer);
      header.set([137,80,78,71,13,10,26,10]); view.setUint32(12, 0x49484452); view.setUint32(16, 32); view.setUint32(20, 40);
      const bundle = { version: 1, width: 32, height: 40, rasters: [{ name: "背景", buffer }, { name: "商品", buffer }], texts: [] };
      const receive = (type: string) => browser.dispatchEvent(new browser.MessageEvent("message", { origin: "http://localhost", source: layerFrame.contentWindow, data: { type, nonce, bundle } }));
      await act(async () => { receive("xc-psd-layers-result"); });
      assert.equal(assembled, 0, "receiving layers never replaces the document before confirmation");
      await act(async () => { button("暂不应用").click(); });
      assert.equal(assembled, 0);
      assert.equal(container.querySelector('[aria-label="AI 自动分层面板"]'), panel, "cancel preserves layer results");
      await act(async () => { receive("xc-psd-layers-result"); });
      await act(async () => { button("应用分层").click(); });
      assert.equal(assembled, 1);
      await act(async () => { receive("xc-psd-layers-close"); });
      assert.equal(container.querySelector('[aria-label="AI 自动分层面板"]'), null);
      assert.equal(container.querySelector('iframe[title="Photopea 商品 PSD 编辑器"]'), inlineEditor, "closing layers keeps the live editor");
      assert.equal(inlineEditor.hasAttribute("inert"), false);
      await act(async () => { button("返回商品预览").click(); });
      await act(async () => { button("继续操作").click(); });
    } finally { Object.assign(PhotopeaBridge.prototype, savedBridge); }
    let written: any;
    let refreshed = false;
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), `/api/projects/${project.id}`);
      assert.equal(init?.method, "PATCH");
      written = JSON.parse(String(init?.body));
      return Response.json({ success: true });
    };
    await act(async () => { root.render(<AppRouterContext.Provider value={{ refresh() { refreshed = true; } } as any}><ProjectOutputConfigCard editable project={project} /></AppRouterContext.Provider>); });
    const platform = container.querySelector("#output-platform")!;
    await act(async () => { Simulate.change(platform as unknown as Element, { target: { value: "taobao_tmall" } } as any); });
    await act(async () => { button("保存输出配置").click(); });
    assert.equal(written.platform, "taobao_tmall");
    assert.deepEqual(written.modelSnapshot.previewConfig, { heroImageCount: 4, heroAspectRatio: "3:4", detailSectionCount: 6, imageAspectRatio: "9:16", contentLanguage: "zh-CN" });
    assert.equal("previewDevice" in written.modelSnapshot.previewConfig, false);
    assert.equal(refreshed, true);
    for (const ratio of ["16:9", "21:9"]) {
      await act(async () => { Simulate.change(container.querySelector("#output-detail-aspect-ratio") as any, { target: { value: ratio } } as any); });
      await act(async () => { button("保存输出配置").click(); });
      assert.equal(written.modelSnapshot.previewConfig.imageAspectRatio, ratio);
      assert.equal(written.modelSnapshot.previewConfig.heroAspectRatio, "3:4");
    }
    const templateProject = { ...project, modelSnapshot: { ...project.modelSnapshot, templateApplication: { name: "女性表带模板", styleProfile: { overallStyle: "简约粉色" } } } };
    await act(async () => { root.render(<AnalysisWorkspace project={{ ...templateProject, platform: "amazon", style: "generic_clean" }} />); });
    assert.equal((container.querySelector("#project-style") as any).value, "女性表带模板");
    assert.equal((container.querySelector("#project-style") as any).readOnly, true);
    assert.equal(container.querySelector("select#project-style"), null, "a generic style picker cannot misrepresent the bound template");
    await act(async () => { root.render(<AnalysisWorkspace project={{ ...project, platform: "taobao_tmall", style: "generic_clean" }} />); });
    assert.equal((container.querySelector("#project-current-platform") as any).value, "淘宝 / 天猫");
    globalThis.fetch = async (_url, init) => {
      if (init?.method === "PATCH") written = JSON.parse(String(init.body));
      return Response.json({ success: true, data: { ...project, platform: "taobao_tmall", style: "generic_clean" } });
    };
    await act(async () => { button("保存项目信息").click(); });
    assert.equal("platform" in written, false, "metadata draft cannot overwrite platform saved in output configuration");
    let navigated = "";
    const quickRequests: string[] = [];
    globalThis.fetch = async (url, init) => {
      quickRequests.push(String(url));
      if (String(url) === "/api/projects") { written = JSON.parse(String(init?.body)); return Response.json({ success: true, data: { id: "quick-project" } }); }
      return Response.json({ success: true });
    };
    await act(async () => { root.render(<AppRouterContext.Provider value={{ push(path: string) { navigated = path; } } as any}><QuickStartWorkspace /></AppRouterContext.Provider>); });
    await act(async () => { Simulate.change(container.querySelector("#quick-start-platform") as any, { target: { value: "amazon" } } as any); });
    assert.equal(container.querySelector("#quick-start-language").value, "en-US");
    await act(async () => { Simulate.change(container.querySelector("textarea") as any, { target: { value: "中文填写的真实商品资料" } } as any); });
    await act(async () => { button("开始生成详情页方案").click(); });
    assert.equal(written.platform, "amazon");
    assert.equal(written.contentLanguage, "en-US");
    assert.deepEqual(quickRequests, ["/api/projects", "/api/projects/quick-project/analyze"]);
    assert.equal(navigated, "/projects/quick-project/analysis");
  } finally {
    await act(async () => { root.unmount(); });
    globalThis.fetch = originalFetch;
    useEditorStore.setState({ selectedSectionId: null, previewDevices: {} });
    for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    await browser.happyDOM.close();
  }
});
