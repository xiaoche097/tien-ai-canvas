import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { act } from "react";
import { Simulate } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { useEditorStore } from "@/hooks/use-editor-store";
const { Window } = createRequire(new URL("../../../../../web/package.json", import.meta.url))("happy-dom");

test("real workspace adopts and unlinks generated references without losing drafts or deleting source files", async () => {
  const browser = new Window({ url: "http://localhost/" });
  const globals = { window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node, NodeFilter: browser.NodeFilter, HTMLInputElement: browser.HTMLInputElement, MutationObserver: browser.MutationObserver, CustomEvent: browser.CustomEvent, getComputedStyle: browser.getComputedStyle.bind(browser), IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class { observe() {} disconnect() {} } };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const originalFetch = globalThis.fetch;
  const writes: any[] = [];
  const original = { id: "source", type: "MAIN", fileName: "original.png", isMain: true, url: "/source.png" };
  const candidate = { id: "candidate", type: "GENERATED", fileName: "candidate.png", url: "/candidate.png", metadata: { purpose: "module_reference", referenceScope: "project", sourceAssetId: "source", referenceApproved: false } };
  const section = { id: "section", type: "DETAIL_CLOSEUP", status: "IDLE", title: "扣具", goal: "结构", copy: "文案", visualPrompt: "原 Prompt", editableData: { referenceAssetIds: [] }, versions: [] };
  const project = { id: "project", name: "表带", platform: "amazon", sections: [section], assets: [original, candidate], tasks: [], modelSnapshot: {} };
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).endsWith("/reference-images"), "unlink never calls physical asset removal or project refresh");
    if (!init?.method) return Response.json({ success: true, data: { tasks: [], assets: [candidate] } });
    const body = JSON.parse(String(init.body)); writes.push(body);
    assert.equal(body.action, "approve");
    candidate.metadata.referenceApproved = true;
    return Response.json({ success: true, data: { asset: candidate } });
  };
  const { EditorWorkspace } = await import("./editor-workspace");
  const container = browser.document.createElement("div"); browser.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  useEditorStore.setState({ selectedSectionId: section.id, previewDevices: {} });
  try {
    await act(async () => root.render(<EditorWorkspace project={project} />));
    const prompt = container.querySelectorAll("textarea")[1];
    await act(async () => Simulate.change(prompt as unknown as Element, { target: { value: "未保存的新 Prompt" } } as any));
    assert.equal(container.querySelectorAll("textarea")[1].value, "未保存的新 Prompt");
    const globalReference = [...container.querySelectorAll("label")].find((label: any) => label.textContent.includes("AI 参考"))?.querySelector('input[type="checkbox"]');
    assert.ok(globalReference, "generated angles appear in the real global reference grid");
    await act(async () => Simulate.change(globalReference as unknown as Element, { target: { checked: true } } as any));
    assert.equal(writes.length, 1);
    assert.equal(globalReference.checked, true);
    assert.equal(container.querySelectorAll('[aria-label^="从当前模块移除参考图："]').length, 0, "global selection is not an unsolicited module draft save");
    const adopt = [...container.querySelectorAll("button")].find((button: any) => button.textContent === "结构已核对，采用到此模块");
    assert.ok(adopt);
    await act(async () => adopt.click());
    assert.equal(container.querySelectorAll("textarea")[1].value, "未保存的新 Prompt");
    assert.equal(container.querySelectorAll('[aria-label^="从当前模块移除参考图："]').length, 2, "source anchor and approved view enter only this draft");
    await act(async () => container.querySelector('[aria-label="从当前模块移除参考图：candidate.png"]')!.click());
    await act(async () => container.querySelector('[aria-label="从当前模块移除参考图：original.png"]')!.click());
    assert.equal(container.querySelectorAll('[aria-label^="从当前模块移除参考图："]').length, 0);
    assert.ok(container.querySelector('img[alt="选定的产品原图"]'));
    assert.ok(container.querySelector('img[alt="生成的白底参考图"]'));
    assert.equal(container.querySelectorAll("textarea")[1].value, "未保存的新 Prompt");
    assert.equal(writes.length, 2, "global confirmation and adoption make only free approval writes; no save, model generation or deletion");
  } finally {
    await act(async () => root.unmount()); globalThis.fetch = originalFetch;
    useEditorStore.setState({ selectedSectionId: null, previewDevices: {} });
    for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    await browser.happyDOM.close();
  }
});
