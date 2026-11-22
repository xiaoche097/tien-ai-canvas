import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { ImageUpload } from "./image-upload";

const { Window } = createRequire(new URL("../../../../../web/package.json", import.meta.url))("happy-dom");

test("image upload shares selection/drop validation, preserves order and locks pending work", async () => {
  const browser = new Window({ url: "http://localhost/motu" });
  const globals = { window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const created: string[] = [];
  const revoked: string[] = [];
  URL.createObjectURL = file => { const url = `blob:test-${created.length}`; created.push(url); return url; };
  URL.revokeObjectURL = url => { revoked.push(url); };
  const first = new File(["first"], "front.png", { type: "image/png" });
  const second = new File(["second"], "back.jpg", { type: "image/jpeg" });
  const invalid = new File(["text"], "notes.txt", { type: "text/plain" });
  let selected: File[] = [];
  function Harness({ multiple, disabled }: { multiple: boolean; disabled: boolean }) {
    const [files, setFiles] = useState<File[]>([]);
    selected = files;
    return <ImageUpload id="test-upload" label="上传参考图" files={files} onChange={setFiles} multiple={multiple} disabled={disabled} />;
  }
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const render = (multiple: boolean, disabled = false, key = "multi") => act(async () => { root.render(<Harness key={key} multiple={multiple} disabled={disabled} />); });
  const target = () => container.querySelector(".motu-upload-target") as unknown as Element;
  const drop = async (files: File[]) => {
    let prevented = false;
    await act(async () => { Simulate.drop(target(), { dataTransfer: { files, types: ["Files"] }, preventDefault() { prevented = true; } } as any); });
    assert.ok(prevented, "drop must prevent browser file navigation");
  };
  const choose = (files: File[]) => act(async () => {
    Simulate.change(container.querySelector("input") as unknown as Element, { target: { files, value: "" } } as any);
  });
  try {
    await render(true);
    let opened = false;
    container.querySelector("input")!.click = () => { opened = true; };
    container.querySelector(".motu-upload-trigger")!.click();
    assert.ok(opened, "upload area opens the native picker");
    await act(async () => { Simulate.dragOver(target(), { dataTransfer: { types: ["Files"] } } as any); });
    assert.equal(container.querySelector(".motu-upload-target")!.getAttribute("data-dragging"), "true");
    await act(async () => { Simulate.dragLeave(target(), { relatedTarget: container.querySelector("svg") } as any); });
    assert.equal(container.querySelector(".motu-upload-target")!.getAttribute("data-dragging"), "true", "moving into a child keeps highlight");
    await drop([first, invalid, second]);
    assert.deepEqual(selected, [first, second]);
    assert.ok(container.querySelector('[role="alert"]')!.textContent.includes("仅支持图片"));
    assert.deepEqual([...container.querySelectorAll("img")].map((img: any) => img.alt), [first.name, second.name]);
    assert.equal(container.querySelector(".motu-upload-target")!.getAttribute("data-dragging"), "false");
    await act(async () => { container.querySelector(`button[aria-label="删除图片 ${first.name}"]`)!.click(); });
    assert.deepEqual(selected, [second]);
    await choose([first]);
    assert.deepEqual(selected, [second, first], "picker appends to dropped files");
    await drop([]);
    assert.deepEqual(selected, [second, first]);
    await render(true, true);
    await drop([first]);
    await choose([second]);
    assert.deepEqual(selected, [second, first], "disabled picker/drop cannot change a pending request");
    assert.ok([...container.querySelectorAll("button, input")].every((element: any) => element.disabled));
    await render(false, false, "single");
    await drop([first, second]);
    assert.deepEqual(selected, [first]);
    assert.ok(container.querySelector('[role="alert"]')!.textContent.includes("第一张"));
    await drop([invalid]);
    assert.deepEqual(selected, [first], "invalid drop keeps current image");
    await choose([second]);
    assert.deepEqual(selected, [second], "single picker replaces current image");
    await act(async () => { container.querySelector(`button[aria-label="删除图片 ${second.name}"]`)!.click(); });
    await choose([second]);
    assert.deepEqual(selected, [second], "removed image can be selected again");
  } finally {
    await act(async () => root.unmount());
    assert.deepEqual([...revoked].sort(), [...created].sort(), "preview URLs are released");
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    await browser.happyDOM.close();
  }
});
