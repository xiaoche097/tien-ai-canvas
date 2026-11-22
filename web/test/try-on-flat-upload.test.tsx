import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, useState } from "react";
import { flatModeProducts, replaceGarmentSlot, type FlatMode, type GarmentSlot, type TryOnProduct } from "../src/pages/ai-apps/try-on/workflow";

test("平铺上传区切换保留图片、按槽位导入，并只显示两个生成模式", async () => {
    const browser = new Window({ url: "http://localhost/", width: 375, height: 900 });
    const globals = {
        window: browser, document: browser.document, navigator: browser.navigator,
        HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node,
        SVGElement: browser.SVGElement, ShadowRoot: browser.ShadowRoot,
        MutationObserver: browser.MutationObserver, CustomEvent: browser.CustomEvent,
        getComputedStyle: browser.getComputedStyle.bind(browser), ResizeObserver: browser.ResizeObserver,
        IS_REACT_ACT_ENVIRONMENT: true,
    };
    const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const { createRoot } = await import("react-dom/client");
    const { FlatUpload } = await import("../src/pages/ai-apps/try-on/flat-upload");
    const { GenerationModeSelect } = await import("../src/pages/ai-apps/try-on/generation-mode-select");
    let submitted: TryOnProduct[] = [];
    let imported: GarmentSlot | undefined;
    function Harness() {
        const [images, setImages] = useState<TryOnProduct[]>([]);
        const [mode, setMode] = useState<FlatMode>("separates");
        const [generation, setGeneration] = useState("professional");
        submitted = flatModeProducts(images, mode);
        return <><FlatUpload images={images} mode={mode} disabled={false} readingSlot={null} imageUrl={(image) => image.dataUrl} onModeChange={setMode} onFiles={(files, slot) => setImages((items) => replaceGarmentSlot(items, { id: files[0].name, name: files[0].name, type: "image/png", dataUrl: "data:image/png;base64," }, slot))} onImport={(slot) => { imported = slot; }} onRemove={(slot) => setImages((items) => items.filter((image) => image.garmentSlot !== slot))} onHover={() => {}} /><GenerationModeSelect value={generation} onChange={setGeneration} /></>;
    }
    const host = browser.document.createElement("div"); browser.document.body.append(host);
    const root = createRoot(host as unknown as HTMLElement);
    const button = (text: string) => [...host.querySelectorAll("button")].find((item) => item.textContent.includes(text))!;
    const drop = async (slot: GarmentSlot, name: string) => {
        const event = new browser.Event("drop", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "dataTransfer", { value: { files: [new browser.File(["fixture"], name, { type: "image/png" })] } });
        await act(async () => { host.querySelector(`[data-upload-target="flat-${slot}"]`)!.dispatchEvent(event); });
    };
    try {
        await act(async () => root.render(<Harness />));
        expect(host.querySelectorAll("[data-upload-target]")).toHaveLength(2);
        await drop("lower", "裤子.png"); await drop("upper", "上装.png");
        expect(submitted.map((image) => image.id)).toEqual(["上装.png", "裤子.png"]);
        await act(async () => { host.querySelector('[data-upload-target="flat-lower"] .ant-btn')!.dispatchEvent(new browser.MouseEvent("click", { bubbles: true })); });
        expect(imported).toBe("lower");
        await act(async () => button("换连体装").click());
        expect(host.querySelectorAll("[data-upload-target]")).toHaveLength(1);
        expect(submitted).toHaveLength(0);
        await drop("full", "连衣裙.png");
        expect(submitted.map((image) => image.id)).toEqual(["连衣裙.png"]);
        await act(async () => button("换上下装").click());
        expect(submitted.map((image) => image.id)).toEqual(["上装.png", "裤子.png"]);
        await act(async () => host.querySelector('[aria-label="移除下装"]')!.dispatchEvent(new browser.MouseEvent("click", { bubbles: true })));
        expect(submitted.map((image) => image.id)).toEqual(["上装.png"]);
        expect(host.querySelectorAll(".try-on-mode-options button")).toHaveLength(2);
        await act(async () => button("内衣／童装").click());
        expect(button("内衣／童装").getAttribute("aria-pressed")).toBe("true");
        expect(host.textContent).toContain("成年模特");
        expect(host.textContent).not.toContain("标准模式");
        expect(host.textContent).not.toContain("会员");
    } finally {
        await act(async () => root.unmount());
        for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
        await browser.happyDOM.close();
    }
}, 60_000);
