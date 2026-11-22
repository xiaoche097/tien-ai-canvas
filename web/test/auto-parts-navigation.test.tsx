import { expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";

test("目录保留导航，进入工作台移除左侧栏，返回目录恢复", async () => {
    const browser = new Window({ url: "http://localhost/" });
    const globals = { window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node, SVGElement: browser.SVGElement, ShadowRoot: browser.ShadowRoot, MutationObserver: browser.MutationObserver, CustomEvent: browser.CustomEvent, getComputedStyle: browser.getComputedStyle.bind(browser), ResizeObserver: browser.ResizeObserver, IS_REACT_ACT_ENVIRONMENT: true };
    const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    mock.module("../src/services/api/auto-parts", () => ({ listAutoPartsVehicles: async () => ({ vehicles: [{ id: "ford-f150", make: "Ford", model: "F-150", body: "pickup", markets: ["US"], sourceUrl: "https://www.ford.com/trucks/f150/", previewCell: 0, configurations: [] }] }) }));
    mock.module("../src/pages/auto-parts-center/workbench", () => ({ AutoPartsWorkbench: ({ onBack }: { onBack: () => void }) => <button onClick={onBack}>返回车型目录</button> }));
    const { createRoot } = await import("react-dom/client");
    const { MemoryRouter } = await import("react-router");
    const { default: Page } = await import("../src/pages/auto-parts-center");
    const host = browser.document.createElement("div"); browser.document.body.append(host);
    const root = createRoot(host as unknown as HTMLElement);
    try {
        await act(async () => root.render(<MemoryRouter initialEntries={["/ai-apps/auto-parts-center"]}><Page /></MemoryRouter>));
        expect(host.querySelector('[aria-label="汽配中心导航"]')).not.toBeNull();
        await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="进入Ford F-150工作台"]')!.click());
        expect(host.querySelector(".auto-parts-sidebar")).toBeNull();
        expect(host.querySelector(".auto-parts-page.is-workbench")).not.toBeNull();
        await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "返回车型目录")!.click());
        expect(host.querySelector('[aria-label="汽配中心导航"]')).not.toBeNull();
        expect(host.querySelector(".auto-parts-page.is-workbench")).toBeNull();
    } finally {
        await act(async () => root.unmount());
        for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
        await browser.happyDOM.close();
    }
}, 60_000);
