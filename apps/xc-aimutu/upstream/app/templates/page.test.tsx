import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { act } from "react";
import { Simulate } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { platformOptions } from "@/types/domain";

const { Window } = createRequire(new URL("../../../../../web/package.json", import.meta.url))("happy-dom");

test("template apply saves new product and chosen output before entering real analysis", async () => {
  const browser = new Window({ url: "http://localhost/motu/templates" });
  const globals = { window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node, MutationObserver: browser.MutationObserver, CustomEvent: browser.CustomEvent, getComputedStyle: browser.getComputedStyle.bind(browser), IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  let saved: any;
  let destination = "";
  let analyzedImages: string[] = [];
  globalThis.fetch = async (url, init) => {
    requests.push(String(url));
    if (String(url) === "/api/templates" && !init?.method) return Response.json({ success: true, data: { templates: [{ id: "template", name: "表带模板", moduleCount: 9, styleProfile: {}, referenceImageUrl: "", description: "" }] } });
    if (String(url) === "/api/templates/analyze") {
      assert.ok(init?.body instanceof FormData);
      analyzedImages = (init.body as FormData).getAll("images").map(file => (file as File).name);
      return Response.json({ success: false, error: { message: "测试分析失败，保留素材" } });
    }
    assert.equal(String(url), "/api/templates/template/apply");
    assert.equal(init?.method, "POST");
    saved = JSON.parse(String(init?.body));
    return Response.json({ success: true, data: { projectId: "new-project" } });
  };
  const { default: TemplatesPage } = await import("./page");
  const container = browser.document.createElement("div"); browser.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const button = (name: string) => [...container.querySelectorAll("button")].find((b: any) => b.textContent.trim() === name)!;
  try {
    await act(async () => { root.render(<AppRouterContext.Provider value={{ push(path: string) { destination = path; } } as any}><TemplatesPage /></AppRouterContext.Provider>); });
    await act(async () => button("套用此模板").click());
    const select = container.querySelector("select")!;
    assert.deepEqual([...select.querySelectorAll("option")].map((o: any) => o.value), [...platformOptions]);
    await act(async () => {
      Simulate.change(select as unknown as Element, { target: { value: "amazon" } } as any);
      Simulate.change(container.querySelector('input[placeholder="例如：全麦山药茯苓馒头"]') as unknown as Element, { target: { value: "尼龙表带" } } as any);
      Simulate.change(container.querySelector('#apply-product-info') as unknown as Element, { target: { value: "仅售尼龙表带，磁吸扣，适合运动，不含手表" } } as any);
    });
    assert.ok(container.textContent.includes("Amazon 默认英语"));
    await act(async () => {
      Simulate.change(container.querySelector('#apply-hero-count') as unknown as Element, { target: { value: "5" } } as any);
      Simulate.change(container.querySelector('#apply-detail-count') as unknown as Element, { target: { value: "8" } } as any);
      Simulate.change(container.querySelector('#apply-hero-ratio') as unknown as Element, { target: { value: "3:4" } } as any);
      Simulate.change(container.querySelector('#apply-detail-ratio') as unknown as Element, { target: { value: "21:9" } } as any);
    });
    await act(async () => button("创建并分析商品").click());
    assert.equal(saved.platform, "amazon");
    assert.equal(saved.productName, "尼龙表带");
    assert.equal(saved.description, "仅售尼龙表带，磁吸扣，适合运动，不含手表");
    assert.deepEqual(saved.previewConfig, { heroImageCount: 5, detailSectionCount: 8, heroAspectRatio: "3:4", imageAspectRatio: "21:9", contentLanguage: "en-US" });
    assert.equal(destination, "/projects/new-project/analysis?source=template&autoRun=1");
    assert.equal(requests.length, 2);
    await act(async () => button("新建模板").click());
    const first = new File(["front"], "reference-front.png", { type: "image/png" });
    const second = new File(["detail"], "reference-detail.png", { type: "image/png" });
    const upload = container.querySelector("#template-image-upload")!.closest(".motu-upload-target")!;
    await act(async () => { Simulate.drop(upload as unknown as Element, { dataTransfer: { files: [first], types: ["Files"] } } as any); });
    await act(async () => { Simulate.change(container.querySelector("#template-image-upload") as unknown as Element, { target: { files: [second], value: "" } } as any); });
    assert.deepEqual([...container.querySelectorAll(".motu-upload-preview img")].map((img: any) => img.alt), [first.name, second.name]);
    assert.equal(requests.length, 2, "selecting images must not call the model");
    await act(async () => button("开始 AI 看图拆版").click());
    assert.deepEqual(analyzedImages, [first.name, second.name], "real template page submits dropped and chosen files in order");
    assert.equal(container.querySelectorAll(".motu-upload-preview").length, 2, "analysis failure preserves reference files for retry");
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    await browser.happyDOM.close();
  }
});
