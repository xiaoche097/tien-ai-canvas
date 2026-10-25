import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { act } from "react";
import { Simulate } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

const { Window } = createRequire(new URL("../../../../../web/package.json", import.meta.url))("happy-dom");

test("quick start keeps product settings, dropped image and analysis navigation", async () => {
  const browser = new Window({ url: "http://localhost/motu" });
  const globals = { window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node, FileReader: browser.FileReader, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const originalFetch = globalThis.fetch;
  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = () => "blob:quick-start-test";
  const requests: string[] = [];
  let created: any;
  let uploaded: any;
  let destination = "";
  let finishAnalysis!: () => void;
  globalThis.fetch = async (url, init) => {
    requests.push(String(url));
    assert.equal(init?.method, "POST");
    if (String(url) === "/api/projects") {
      created = JSON.parse(String(init?.body));
      return Response.json({ success: true, data: { id: "product-project" } });
    }
    if (String(url) === "/api/projects/product-project/assets/upload") {
      uploaded = JSON.parse(String(init?.body));
      return Response.json({ success: true });
    }
    assert.equal(String(url), "/api/projects/product-project/analyze");
    await new Promise<void>(resolve => { finishAnalysis = resolve; });
    return Response.json({ success: true });
  };
  const { QuickStartWorkspace } = await import("./quick-start-workspace");
  const container = browser.document.createElement("div"); browser.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const change = (selector: string, value: string) => Simulate.change(container.querySelector(selector) as unknown as Element, { target: { value } } as any);
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={{ push(path: string) { destination = path; } } as any}><QuickStartWorkspace /></AppRouterContext.Provider>));
    const start = container.querySelector(".motu-studio-primary") as any;
    assert.ok(start.disabled);
    await act(async () => {
      change("#quick-start-platform", "amazon");
      change("#quick-start-product-info", "尼龙表带，不含手表");
      change("#quick-start-category", "配饰");
      change("#quick-start-audience", "运动人群");
      change("#quick-start-selling-points", "轻便透气");
      Simulate.drop(container.querySelector(".motu-upload-target") as unknown as Element, { dataTransfer: { files: [new browser.File(["product"], "product.png", { type: "image/png" })], types: ["Files"] } } as any);
    });
    assert.equal(requests.length, 0, "editing and dropping files never starts paid work");
    await act(async () => { start.click(); await browser.happyDOM.waitUntilComplete(); });
    assert.equal(created.platform, "amazon");
    assert.equal(created.contentLanguage, "en-US");
    assert.equal(created.productInfo, "尼龙表带，不含手表");
    assert.equal(created.category, "配饰");
    assert.equal(created.targetAudience, "运动人群");
    assert.equal(created.sellingPoints, "轻便透气");
    assert.deepEqual(uploaded, { type: "MAIN", fileName: "product.png", mimeType: "image/png", base64Data: "cHJvZHVjdA==" });
    assert.ok(start.disabled);
    assert.ok((container.querySelector("fieldset") as any).disabled);
    assert.ok((container.querySelector(".motu-upload-trigger") as any).disabled);
    await act(async () => finishAnalysis());
    assert.equal(destination, "/projects/product-project/analysis");
    assert.deepEqual(requests, ["/api/projects", "/api/projects/product-project/assets/upload", "/api/projects/product-project/analyze"]);
  } finally {
    finishAnalysis?.();
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreate;
    for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    await browser.happyDOM.close();
  }
});
