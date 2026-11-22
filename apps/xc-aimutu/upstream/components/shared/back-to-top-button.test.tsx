import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

const { Window } = createRequire(new URL("../../../../../web/package.json", import.meta.url))("happy-dom");

test("back to top follows the content scroller and leaves the navigation and window in place", async () => {
  const browser = new Window({ url: "http://localhost/motu/projects/new" });
  const globals = { window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const { BackToTopButton } = await import("./back-to-top-button");
  try {
    await act(async () => root.render(<PathnameContext.Provider value="/projects/new"><div className="motu-shell"><aside>导航</aside><main className="motu-main">内容</main></div><BackToTopButton /></PathnameContext.Provider>));
    const main = container.querySelector("main")!;
    const aside = container.querySelector("aside")!;
    Object.defineProperties(main, { scrollHeight: { value: 1600 }, clientHeight: { value: 700 } });
    let mainScroll: any;
    let windowCalls = 0;
    main.scrollTo = (options: any) => { mainScroll = options; main.scrollTop = options.top; };
    browser.scrollTo = () => { windowCalls += 1; };
    const button = container.querySelector("button")!;
    assert.ok(button.className.includes("opacity-0"));
    main.scrollTop = 500;
    await act(async () => main.dispatchEvent(new browser.Event("scroll")));
    assert.ok(button.className.includes("opacity-100"));
    await act(async () => button.click());
    assert.equal(mainScroll.top, 0);
    assert.equal(windowCalls, 0);
    assert.equal(aside.scrollTop, 0);
    await act(async () => main.dispatchEvent(new browser.Event("scroll")));
    assert.ok(button.className.includes("opacity-0"));
  } finally {
    await act(async () => root.unmount());
    for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    await browser.happyDOM.close();
  }
});
