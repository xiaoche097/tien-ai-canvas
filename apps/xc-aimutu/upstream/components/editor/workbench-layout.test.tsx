import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { act } from "react";
import { Simulate } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { WorkbenchLayout, readWorkbenchLayout, workbenchLayoutKey } from "./workbench-layout";

const { Window } = createRequire(new URL("../../../../../web/package.json", import.meta.url))("happy-dom");

test("layout preference rejects malformed data and clamps supported widths", () => {
  assert.equal(readWorkbenchLayout("broken").left, 240);
  assert.equal(readWorkbenchLayout('{"left":900,"right":12,"leftCollapsed":true}').left, 320);
  assert.equal(readWorkbenchLayout('{"right":12}').right, 300);
  assert.equal(readWorkbenchLayout('{"left":"300"}').left, 240);
});

test("resize, keyboard, responsive collapse and refresh keep existing panel nodes", async () => {
  const browser = new Window({ url: "http://localhost/" });
  const observers: any[] = [];
  const globals = { window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, localStorage: browser.localStorage, IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class { constructor(public callback: any) { observers.push(this); } observe() { this.callback([{ contentRect: { width: 1600 } }]); } disconnect() {} } };
  const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const container = browser.document.createElement("div"); browser.document.body.append(container);
  let root = createRoot(container as any);
  const render = (expanded = false) => <WorkbenchLayout expanded={expanded} left={<button>模块</button>} preview={<img src="/current-version.png" alt="当前版本" />} right={<textarea defaultValue="Prompt 草稿" />} />;
  const click = async (label: string) => { const button = [...container.querySelectorAll("button")].find((node: any) => node.textContent === label || node.getAttribute("aria-label") === label); assert.ok(button, label); await act(async () => { button.click(); }); };
  try {
    await act(async () => { root.render(render()); });
    const image = container.querySelector("img"), textarea = container.querySelector("textarea");
    const separator = container.querySelector('[aria-label="调整模块树宽度"]')!;
    await act(async () => { Simulate.keyDown(separator as any, { key: "ArrowRight" }); });
    assert.equal(separator.getAttribute("aria-valuenow"), "250");
    (separator as any).setPointerCapture = () => {};
    await act(async () => { Simulate.pointerDown(separator as any, { button: 0, pointerId: 1, clientX: 250 } as any); });
    await act(async () => { Simulate.pointerMove(separator as any, { clientX: 290 } as any); });
    await act(async () => { Simulate.pointerUp(separator as any); });
    assert.equal(JSON.parse(browser.localStorage.getItem(workbenchLayoutKey)).left, 290);
    assert.equal(container.querySelector("textarea"), textarea);
    await click("缩小编辑面板宽度");
    assert.equal(JSON.parse(browser.localStorage.getItem(workbenchLayoutKey)).right, 310);
    await click("模块树");
    assert.equal(container.querySelector("#workbench-left-panel")?.hasAttribute("hidden"), true);
    await act(async () => { root.render(render(true)); });
    await act(async () => { root.render(render(false)); });
    assert.equal(container.querySelector("img"), image);
    assert.equal(container.querySelector("textarea"), textarea);
    for (const width of [1280, 1440, 1728, 1920, 2560]) {
      // Route shell consumes 284px: navigation, padding and borders. The
      // observer receives the actual workspace size rather than viewport size.
      await act(async () => { observers[0].callback([{ contentRect: { width: width - 284 } }]); });
      assert.equal(container.querySelector("img"), image);
      assert.equal(container.querySelector("textarea"), textarea);
    }
    await click("恢复默认布局");
    await act(async () => { observers[0].callback([{ contentRect: { width: 700 } }]); });
    assert.equal(container.querySelector("#workbench-right-panel")?.hasAttribute("hidden"), true);
    await click("编辑面板");
    assert.equal(container.querySelector("#workbench-right-panel")?.hasAttribute("hidden"), false);
    await act(async () => { Simulate.keyDown(container.querySelector("textarea") as any, { key: "Escape" }); });
    assert.equal(container.querySelector("#workbench-right-panel")?.hasAttribute("hidden"), true);
    await act(async () => { observers[0].callback([{ contentRect: { width: 1600 } }]); });
    await click("增大模块树宽度");
    await act(async () => { root.unmount(); });
    root = createRoot(container as any);
    await act(async () => { root.render(render()); });
    assert.equal(container.querySelector('[aria-label="调整模块树宽度"]')?.getAttribute("aria-valuenow"), "250");
  } finally {
    await act(async () => { root.unmount(); });
    for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    await browser.happyDOM.close();
  }
});
