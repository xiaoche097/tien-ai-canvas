import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, useState } from "react";
import { bagModeProducts, replaceBagSlot, bagTypes, tryOnInputError, tryOnIntent, tryOnReferences, tryOnTools, type BagMode, type BagOptions, type TryOnProduct } from "../src/pages/ai-apps/try-on/workflow";

test("产品上身紧随平铺工具，多角度是同款商品，目标模特只能一张", () => {
    const tool = tryOnTools.find((tool) => tool.id === "bag")!;
    expect(tryOnTools[tryOnTools.findIndex((tool) => tool.id === "flat") + 1]).toBe(tool);
    const bag: BagOptions = { type: "backpack", ageGroup: "adult", views: [{ source: "flat", angle: "front" }, { source: "mannequin", angle: "back" }] };
    const intent = tryOnIntent(tool, 2, true, "", false, false, undefined, undefined, undefined, undefined, undefined, bag);
    expect(intent.bag).toEqual(bag);
    expect(intent.generationMode).toBe("professional");
    expect(tryOnInputError(tool, 2, "reference", 1, "")).toBe("");
    for (const count of [0, 2]) expect(tryOnInputError(tool, 2, "reference", count, "")).toContain("1 张目标模特图");
    expect(bagTypes.map((item) => item.id)).toContain("waist");
    const image = (id: string) => ({ id, name: id, type: "image/png", dataUrl: "" });
    expect(tryOnReferences([image("平铺正面"), image("人台背面")], image("目标模特")).map((image) => image.id)).toEqual(["平铺正面", "人台背面", "目标模特"]);
});

test("单视角与多视角切换保留图片、按槽位替换导入，默认成人且支持儿童", async () => {
    const browser = new Window({ url: "http://localhost/", width: 375, height: 900 });
    const globals = { window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node, SVGElement: browser.SVGElement, ShadowRoot: browser.ShadowRoot, MutationObserver: browser.MutationObserver, CustomEvent: browser.CustomEvent, getComputedStyle: browser.getComputedStyle.bind(browser), ResizeObserver: browser.ResizeObserver, IS_REACT_ACT_ENVIRONMENT: true };
    const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const { createRoot } = await import("react-dom/client");
    const { BagSettings, BagUpload } = await import("../src/pages/ai-apps/try-on/bag-upload");
    let images: TryOnProduct[] = [], submitted: TryOnProduct[] = [], settings: Omit<BagOptions, "views">, imported = "";
    function Harness() {
        const [items, setItems] = useState<TryOnProduct[]>([]);
        const [mode, setMode] = useState<BagMode>("single");
        const [value, setValue] = useState<Omit<BagOptions, "views">>({ type: "auto", ageGroup: "adult" });
        images = items; settings = value; submitted = bagModeProducts(items, mode);
        return <><BagSettings value={value} onChange={setValue} /><BagUpload images={items} mode={mode} onModeChange={setMode} disabled={false} readingSlot={null} imageUrl={() => ""} onFiles={(files, slot, source) => setItems((current) => replaceBagSlot(current, { id: files[0].name, name: files[0].name, type: files[0].type, dataUrl: "" }, slot, source))} onImport={(slot, source) => { imported = `${slot}-${source}`; }} onRemove={(slot) => setItems((current) => current.filter((image) => image.bagSlot !== slot))} onSource={(slot, source) => setItems((current) => current.map((image) => image.bagSlot === slot ? { ...image, bagView: { ...image.bagView!, source } } : image))} onHover={() => {}} /></>;
    }
    const host = browser.document.createElement("div"); browser.document.body.append(host);
    const root = createRoot(host as unknown as HTMLElement);
    try {
        await act(async () => root.render(<Harness />));
        expect(settings!.ageGroup).toBe("adult");
        expect(host.textContent).not.toContain("内衣");
        expect(host.querySelectorAll("[data-bag-slot]")).toHaveLength(1);
        expect(host.textContent).toContain("上传／拖入／粘贴包图");
        const button = (label: string) => [...host.querySelectorAll("button")].find((button) => button.textContent === label)!;
        await act(async () => button("多视角图").click());
        expect(host.querySelectorAll("[data-bag-slot]")).toHaveLength(3);
        for (const slot of ["back", "front", "side"]) {
            const event = new browser.Event("drop", { bubbles: true, cancelable: true });
            Object.defineProperty(event, "dataTransfer", { value: { files: [new browser.File(["fixture"], `${slot}.png`, { type: "image/png" })] } });
            await act(async () => host.querySelector(`[data-bag-slot="${slot}"]`)!.dispatchEvent(event));
        }
        expect(submitted.map((image) => image.bagView?.angle)).toEqual(["front", "back", "right"]);
        await act(async () => host.querySelector('[data-bag-slot="side"] .ant-btn')!.dispatchEvent(new browser.MouseEvent("click", { bubbles: true })));
        expect(imported).toBe("side-flat");
        await act(async () => button("单视角图").click());
        expect(submitted.map((image) => image.id)).toEqual(["front.png"]);
        expect(images).toHaveLength(3);
        await act(async () => button("多视角图").click());
        expect(submitted).toHaveLength(3);
        await act(async () => button("儿童").click());
        expect(settings!.ageGroup).toBe("child");
        await act(async () => host.querySelector('[aria-label="移除包袋背面／包带图"]')!.dispatchEvent(new browser.MouseEvent("click", { bubbles: true })));
        expect(submitted.map((image) => image.id)).toEqual(["front.png", "side.png"]);
    } finally {
        await act(async () => root.unmount());
        for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
        await browser.happyDOM.close();
    }
}, 60_000);
