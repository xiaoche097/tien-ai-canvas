import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, useState } from "react";
import type { ReferenceImage } from "../src/types/image";

test("汽配产品与实车上传独立导入删除，错误图片保留原图，生成时禁止修改", async () => {
    const browser = new Window({ url: "http://localhost/" });
    const globals = { window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node, SVGElement: browser.SVGElement, ShadowRoot: browser.ShadowRoot, MutationObserver: browser.MutationObserver, CustomEvent: browser.CustomEvent, getComputedStyle: browser.getComputedStyle.bind(browser), ResizeObserver: browser.ResizeObserver, IS_REACT_ACT_ENVIRONMENT: true };
    const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const { createRoot } = await import("react-dom/client");
    const { AutoPartsImageUpload } = await import("../src/pages/auto-parts-center/image-upload");
    const image = (id: string): ReferenceImage => ({ id, name: id, type: "image/png", dataUrl: "data:image/png;base64,fixture" });
    let imported = "", changes = 0, reading = false;
    function Harness({ disabled = false }: { disabled?: boolean }) {
        const [products, setProducts] = useState([image("产品正面"), image("产品侧面")]), [interior, setInterior] = useState([image("实车")]);
        return <><AutoPartsImageUpload label="产品" hint="同款参考" images={products} limit={4} disabled={disabled} onReading={(value) => { reading = value; }} onChange={(images) => { changes++; setProducts(images); }} onImport={() => { imported = "products"; }} /><AutoPartsImageUpload label="内饰" hint="实车参考" images={interior} limit={1} disabled={disabled} onReading={(value) => { reading = value; }} onChange={(images) => { changes++; setInterior(images); }} onImport={() => { imported = "interior"; }} /></>;
    }
    const host = browser.document.createElement("div"); browser.document.body.append(host);
    const root = createRoot(host as unknown as HTMLElement);
    const click = async (selector: string) => act(async () => host.querySelector<HTMLButtonElement>(selector)!.click());
    try {
        await act(async () => root.render(<Harness />));
        const uploads = host.querySelectorAll<HTMLInputElement>('input[type="file"]');
        expect(uploads[0].multiple).toBe(true); expect(uploads[1].multiple).toBe(false);
        await click('[aria-label="内饰上传区"] .ant-btn'); expect(imported).toBe("interior");
        const event = new browser.Event("drop", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "dataTransfer", { value: { files: [new browser.File(["bad"], "bad.txt", { type: "text/plain" })] } });
        await act(async () => host.querySelector('[aria-label="内饰上传区"]')!.dispatchEvent(event));
        expect(host.querySelector('[role="alert"]')?.textContent).toContain("JPG");
        expect(host.querySelectorAll("img")).toHaveLength(3); expect(changes).toBe(0); expect(reading).toBe(false);
        await click('[aria-label="移除产品侧面"]'); expect(host.querySelectorAll("img")).toHaveLength(2);
        expect(host.querySelector('[aria-label="内饰上传区"] img')?.getAttribute("alt")).toBe("实车");
        await act(async () => root.render(<Harness disabled />));
        expect([...host.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);
        await click('[aria-label="移除实车"]'); expect(host.querySelectorAll("img")).toHaveLength(2);
        await act(async () => host.querySelector('[aria-label="内饰上传区"]')!.dispatchEvent(event));
        expect(changes).toBe(1);
    } finally {
        await act(async () => root.unmount());
        for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
        await browser.happyDOM.close();
    }
}, 60_000);
