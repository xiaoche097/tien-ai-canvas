import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { act } from "react";
import { Simulate } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

const { Window } = createRequire(new URL("../../../../../web/package.json", import.meta.url))("happy-dom");

test("advanced creation keeps dropped and chosen images in their original asset categories", async () => {
  const browser = new Window({ url: "http://localhost/motu/projects/new" });
  const globals = { window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node, FileReader: browser.FileReader, localStorage: browser.localStorage, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const originalFetch = globalThis.fetch;
  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = () => "blob:advanced-upload-test";
  const uploads: any[] = [];
  let destination = "";
  let createdName = "";
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(url) === "/api/projects") {
      createdName = body.name;
      return Response.json({ success: true, data: { id: "categorized-project" } });
    }
    assert.equal(String(url), "/api/projects/categorized-project/assets/upload");
    uploads.push(body);
    return Response.json({ success: true });
  };
  const { ProjectCreator } = await import("./project-creator");
  const container = browser.document.createElement("div"); browser.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const image = (name: string) => new browser.File([name], name, { type: "image/png" });
  const drop = (type: string, files: File[]) => act(async () => {
    Simulate.drop(container.querySelector(`#project-upload-${type}`)!.closest(".motu-upload-target") as unknown as Element, { dataTransfer: { files, types: ["Files"] } } as any);
  });
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={{ push(path: string) { destination = path; } } as any}><ProjectCreator /></AppRouterContext.Provider>));
    await act(async () => {
      const name = container.querySelector('input[name="name"]')!;
      name.value = "分类素材商品";
      Simulate.change(name as unknown as Element);
    });
    await drop("MAIN", [image("front.png"), image("ignored.png")]);
    await drop("ANGLE", [image("left.png")]);
    await act(async () => {
      Simulate.change(container.querySelector("#project-upload-ANGLE") as unknown as Element, { target: { files: [image("right.png")], value: "" } } as any);
    });
    await drop("INGREDIENT", [image("ingredients.png")]);
    assert.equal(uploads.length, 0);
    await act(async () => {
      [...container.querySelectorAll("button")].find((button: any) => button.textContent.includes("创建项目并上传素材"))!.click();
      await browser.happyDOM.waitUntilComplete();
    });
    assert.equal(createdName, "分类素材商品");
    assert.deepEqual(uploads.map(({ type, fileName }) => [type, fileName]), [["MAIN", "front.png"], ["ANGLE", "left.png"], ["ANGLE", "right.png"], ["INGREDIENT", "ingredients.png"]]);
    assert.equal(destination, "/projects/categorized-project/analysis");
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreate;
    for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    await browser.happyDOM.close();
  }
});
