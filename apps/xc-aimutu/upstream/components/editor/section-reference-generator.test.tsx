import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
const { Window } = createRequire(new URL("../../../../../web/package.json", import.meta.url))("happy-dom");

test("reference UI generates per-shot previews and adopts explicitly without saving module drafts", async () => {
  const browser = new Window({ url: "http://localhost/motu" });
  const globals = { window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node, MutationObserver: browser.MutationObserver, CustomEvent: browser.CustomEvent, getComputedStyle: browser.getComputedStyle.bind(browser), IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const originalFetch = globalThis.fetch;
  const calls: any[] = [];
  const tasks: any[] = [], results: any[] = [];
  let adopted = 0, shared = 0;
  let section = { id: "a", type: "DETAIL_CLOSEUP", title: "扣具", goal: "扣具实物", copy: "保留文案", visualPrompt: "扣具特写，米白排版", editableData: { referenceAssetIds: [] as string[] } };
  const source = { id: "original", type: "MAIN", isMain: true, fileName: "same-sku.png", url: "/source.png" };
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).endsWith("/reference-images"), "no image generation or module save endpoint is called");
    if (!init?.method) return Response.json({ success: true, data: { tasks: [...tasks], assets: [...results] } });
    const input = JSON.parse(String(init.body)); calls.push(input);
    if (input.action === "plan") {
      const task = { id: `plan-${calls.length}`, status: "SUCCESS", inputPayload: input, outputPayload: { shots: [{ kind: "detail", title: "磁扣近拍", view: "正面特写", target: "磁扣" }] } };
      tasks.unshift(task); return Response.json({ success: true, data: { task } });
    }
    if (input.action === "generate") {
      results.unshift({ id: "candidate", type: "GENERATED", fileName: "candidate.png", url: "/candidate.png", metadata: { purpose: "module_reference", referenceApproved: false, sourceAssetId: source.id, referencePlanId: input.planId, referenceShot: { kind: "detail", title: "磁扣近拍", view: "正面特写", target: "磁扣" } } });
      return Response.json({ success: true, data: { task: { status: "SUCCESS" } } });
    }
    const asset = { ...results[0], metadata: { ...results[0].metadata, referenceApproved: true } };
    return Response.json({ success: true, data: { asset } });
  };
  const { SectionReferenceGenerator } = await import("./section-reference-generator");
  const container = browser.document.createElement("div"); browser.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const button = (name: string) => [...container.querySelectorAll("button")].find((b: any) => b.textContent.trim() === name)!;
  const render = () => root.render(<SectionReferenceGenerator projectId="p" section={section} assets={[source]} onBusy={() => undefined} onAsset={() => shared++} onAdopt={(id, asset) => { assert.equal(id, section.id); adopted++; section = { ...section, editableData: { referenceAssetIds: [asset.id] } }; render(); }} />);
  try {
    await act(async () => render());
    assert.equal(calls.length, 0, "opening the panel never calls a paid model");
    await act(async () => { button("识别 Prompt 所需视角").click(); button("识别 Prompt 所需视角").click(); });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].draft.visualPrompt, section.visualPrompt);
    assert.ok(button("生成这张白底参考图"));
    await act(async () => button("生成这张白底参考图").click());
    assert.equal(calls.length, 2);
    assert.equal(calls[1].shotIndex, 0);
    assert.equal(adopted, 0);
    assert.ok(shared >= 1, "generated results enter global references before module adoption");
    assert.ok(container.querySelector('img[src="/candidate.png"]'));
    section = { ...section, visualPrompt: "用户改成材质特写" };
    await act(async () => render());
    assert.equal(button("生成这张白底参考图"), undefined, "stale prompt plans cannot generate more images");
    const changedPrompt = section.visualPrompt;
    await act(async () => button("结构已核对，采用到此模块").click());
    assert.equal(adopted, 1);
    assert.ok(shared >= 2);
    assert.equal(section.visualPrompt, changedPrompt);
    assert.equal(calls.length, 3, "adoption does not generate another image or save the module");
    assert.equal(button("已加入模块草稿").disabled, true);
  } finally {
    await act(async () => root.unmount()); globalThis.fetch = originalFetch;
    for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    await browser.happyDOM.close();
  }
});
