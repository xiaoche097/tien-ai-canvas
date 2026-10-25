import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
const { Window } = createRequire(new URL("../../../../../web/package.json", import.meta.url))("happy-dom");

test("partial AI rewrite previews before adoption and refuses stale edits", async () => {
  const browser = new Window({ url: "http://localhost/motu" });
  const globals = { window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node, MutationObserver: browser.MutationObserver, CustomEvent: browser.CustomEvent, getComputedStyle: browser.getComputedStyle.bind(browser), IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const originalFetch = globalThis.fetch;
  const calls: any[] = [];
  let adoptCount = 0;
  let failSave = true;
  let section = { id: "a", title: "材质说明", goal: "突出真实织纹", copy: "仅售表带", visualPrompt: "原始背景，保留商品。English stays unchanged." };
  globalThis.fetch = async (_url, init) => {
    const input = JSON.parse(String(init?.body)); calls.push(input);
    if (String(_url).endsWith("/apply")) {
      if (failSave) return Response.json({ success: false, error: { message: "模拟保存失败" } }, { status: 500 });
      return Response.json({ success: true, data: input.updates });
    }
    const prompt = input.currentPrompt.slice(0, input.start) + "米白背景" + input.currentPrompt.slice(input.end);
    return Response.json({ success: true, data: { replacement: "米白背景", prompt, visualPrompt: prompt, copy: "柔软透气，保留原排版", expected: { ...section }, model: "planner" } });
  };
  const { SectionPromptEditor } = await import("./section-prompt-editor");
  const container = browser.document.createElement("div"); browser.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const button = (name: string) => [...container.querySelectorAll("button")].find((b: any) => b.textContent.trim() === name)!;
  const render = () => root.render(<SectionPromptEditor key={section.id} projectId="p" section={section} onChange={prompt => { section = { ...section, visualPrompt: prompt }; render(); }} onCopyChange={copy => { section = { ...section, copy }; render(); }} onSaved={saved => { adoptCount++; section = { ...section, ...saved }; render(); }} />);
  const selectSpan = async () => { const area = container.querySelectorAll("textarea")[1]!; area.setSelectionRange(0, 4); await act(async () => Simulate.select(area as unknown as Element)); };
  try {
    await act(async () => render());
    container.querySelector("details")!.open = true;
    await act(async () => Simulate.change(container.querySelectorAll("textarea")[2] as unknown as Element, { target: { value: "只把背景改成米白色" } } as any));
    await act(async () => Simulate.change(container.querySelectorAll("select")[1] as unknown as Element, { target: { value: "selection" } } as any));
    await act(async () => button("生成改写预览").click());
    assert.equal(calls.length, 0, "no selected range must not make a paid request");
    assert.ok(container.querySelector('[role="alert"]'));
    await selectSpan();
    await act(async () => button("生成改写预览").click());
    assert.equal(calls.length, 1);
    assert.equal(calls[0].mode, "selection");
    assert.deepEqual([calls[0].start, calls[0].end], [0, 4]);
    assert.equal(adoptCount, 0, "preview does not overwrite prompt or save data");
    const original = section.visualPrompt;
    section = { ...section, goal: "用户刚刚改过目标" };
    await act(async () => render());
    assert.equal(button("采用并保存").disabled, true);
    assert.equal(section.visualPrompt, original);
    await act(async () => button("放弃").click());
    await selectSpan();
    await act(async () => button("生成改写预览").click());
    await act(async () => button("采用并保存").click());
    assert.equal(adoptCount, 0, "failed persistence must not claim adoption or overwrite the draft");
    assert.equal(section.visualPrompt, original);
    assert.ok(container.querySelector('[aria-label="AI 改写预览"]'));
    failSave = false;
    await act(async () => button("采用并保存").click());
    assert.equal(adoptCount, 1);
    assert.equal(section.visualPrompt, "米白背景" + original.slice(4));
    assert.ok(section.visualPrompt.endsWith("English stays unchanged."));
    assert.equal(section.copy, "柔软透气，保留原排版");
    assert.equal(calls.filter(call => call.currentPrompt).length, 2, "saving does not call a paid model or image generation");
    assert.equal(calls.filter(call => call.updates).length, 2);
    section = { ...section, id: "b", visualPrompt: "另一个模块" };
    await act(async () => render());
    assert.equal(container.querySelector('[aria-label="AI 改写预览"]'), null);
    assert.equal(container.querySelectorAll("textarea")[2].value, "");
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    await browser.happyDOM.close();
  }
});
