import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, useState } from "react";
import type { NativeTextLayer } from "@/lib/psd-layer-contract";

test("text correction edits style/content locally, isolates other layers and locks after application", async () => {
    const browser = new Window({ url: "http://localhost/", width: 420, height: 900 });
    const globals = { window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node, SVGElement: browser.SVGElement, ShadowRoot: browser.ShadowRoot, MutationObserver: browser.MutationObserver, getComputedStyle: browser.getComputedStyle.bind(browser), ResizeObserver: browser.ResizeObserver, IS_REACT_ACT_ENVIRONMENT: true };
    const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const { createRoot } = await import("react-dom/client");
    const { PsdTextLayerEditor } = await import("../src/pages/tools/psd-text-layer-editor");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("Text correction must not call the network"); };
    const original: NativeTextLayer = { text: "商品标题", bbox: [100, 100, 700, 300], fontSize: 40, color: "#123456", bold: true, align: "left", rotation: 0 };
    let latest: NativeTextLayer[] = [];
    function Harness({ disabled = false }: { disabled?: boolean }) {
        const [lines, setLines] = useState([original, { ...original, text: "第二层" }]);
        latest = lines;
        return <PsdTextLayerEditor lines={lines} width={1000} height={2000} disabled={disabled} onChange={setLines} />;
    }
    const container = browser.document.createElement("div"); browser.document.body.append(container);
    const root = createRoot(container as unknown as HTMLElement);
    const field = (label: string) => container.querySelector(`[aria-label="${label}"]`) as unknown as HTMLInputElement;
    const change = (label: string, value: string) => {
        const element = field(label);
        const prototype = element.tagName === "TEXTAREA" ? browser.HTMLTextAreaElement.prototype : element.tagName === "SELECT" ? browser.HTMLSelectElement.prototype : browser.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
        element.dispatchEvent(new browser.Event("input", { bubbles: true }) as unknown as Event);
        element.dispatchEvent(new browser.Event("change", { bubbles: true }) as unknown as Event);
    };
    try {
        await act(async () => { root.render(<Harness />); });
        expect(Number(field("文字 1 字号").value)).toBe(80);
        await act(async () => { change("校对文字 1", "校对后的标题"); });
        await act(async () => { change("文字 1 字号", "64"); });
        await act(async () => { change("文字 1 颜色", "#abcdef"); });
        await act(async () => { change("文字 1 对齐", "right"); });
        expect(latest[0]).toMatchObject({ text: "校对后的标题", fontSize: 32, color: "#abcdef", align: "right" });
        expect(latest[1]).toEqual({ ...original, text: "第二层" });
        await act(async () => { change("校对文字 1", ""); });
        expect(field("校对文字 1").getAttribute("aria-invalid")).toBe("true");
        expect(container.querySelector('[role="alert"]')?.textContent).toContain("不能为空");
        await act(async () => { root.render(<Harness disabled />); });
        expect(field("文字 1 字号").disabled).toBe(true);
        expect(field("校对文字 1").disabled).toBe(true);
    } finally {
        await act(async () => { root.unmount(); }); globalThis.fetch = originalFetch;
        for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
        await browser.happyDOM.close();
    }
}, 60_000);
