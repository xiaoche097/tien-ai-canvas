import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
const { Window } = createRequire(new URL("../../../../../web/package.json", import.meta.url))("happy-dom");

test("one-click batch skips cached and repeated shots, stops on failure and resumes only missing views", async () => {
  const browser = new Window({ url: "http://localhost/motu" });
  const globals = { window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node, MutationObserver: browser.MutationObserver, CustomEvent: browser.CustomEvent, getComputedStyle: browser.getComputedStyle.bind(browser), IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const originalFetch = globalThis.fetch;
  const section = { id: "a", type: "DETAIL_CLOSEUP", title: "多视角", goal: "展示结构", copy: "仅售表带", visualPrompt: "正面、背面和织纹特写", editableData: { referenceAssetIds: [] } };
  const source = { id: "source", type: "MAIN", fileName: "source.png", url: "/source.png" };
  const shots = [{ kind: "angle", title: "正面", view: "Front", target: "Band" }, { kind: "angle", title: "背面", view: "Back", target: "Band" }, { kind: "detail", title: "织纹", view: "Macro", target: "Weave" }];
  const candidate = (index: number) => ({ id: `angle-${index}`, type: "GENERATED", fileName: `angle-${index}.png`, url: `/angle-${index}.png`, metadata: { purpose: "module_reference", referenceScope: "project", sourceAssetId: source.id, referenceShot: shots[index] } });
  const results = [candidate(0)];
  const tasks: any[] = [];
  const generated: number[] = [];
  let failWeave = true, adopted = 0;
  let assets: any[] = [source, ...results];
  globalThis.fetch = async (_url, init) => {
    if (!init?.method) return Response.json({ success: true, data: { tasks, assets: [...results] } });
    const input = JSON.parse(String(init.body));
    if (input.action === "plan") {
      tasks.unshift({ id: "plan", status: "SUCCESS", inputPayload: input, outputPayload: { shots: [...shots, { ...shots[1], title: "重复背面" }] } });
      return Response.json({ success: true, data: { task: tasks[0] } });
    }
    assert.equal(input.action, "generate"); generated.push(input.shotIndex);
    if (input.shotIndex === 2 && failWeave) return Response.json({ success: false, error: { message: "模拟特写失败" } }, { status: 500 });
    results.unshift(candidate(input.shotIndex));
    return Response.json({ success: true, data: { task: { status: "SUCCESS" } } });
  };
  const { SectionReferenceGenerator } = await import("./section-reference-generator");
  const container = browser.document.createElement("div"); browser.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const button = (label: string) => [...container.querySelectorAll("button")].find((item: any) => item.textContent.trim() === label)!;
  const render = () => root.render(<SectionReferenceGenerator projectId="p" section={section} assets={assets} onBusy={() => undefined} onAsset={asset => { assets = [...assets.filter(item => item.id !== asset.id), asset]; render(); }} onAdopt={() => adopted++} />);
  try {
    await act(async () => render());
    await act(async () => button("识别 Prompt 所需视角").click());
    assert.ok(button("一键生成缺少的角度（2 张）"));
    await act(async () => { button("一键生成缺少的角度（2 张）").click(); button("一键生成缺少的角度（2 张）").click(); });
    assert.deepEqual(generated, [1, 2], "cached front and duplicate back are never generated; a failure is not retried");
    assert.ok(assets.some(asset => asset.id === "angle-1"), "partial batch result is available globally");
    assert.equal(adopted, 0, "batch does not auto-approve product structure");
    assert.ok(button("一键生成缺少的角度（1 张）"));
    failWeave = false;
    await act(async () => button("一键生成缺少的角度（1 张）").click());
    assert.deepEqual(generated, [1, 2, 2], "resume submits only the missing view");
    assert.equal(button("所需角度已有参考图").disabled, true);
    assert.equal(results.length, 3);
  } finally {
    await act(async () => root.unmount()); globalThis.fetch = originalFetch;
    for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    await browser.happyDOM.close();
  }
});
