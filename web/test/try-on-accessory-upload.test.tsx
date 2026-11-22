import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, useState } from "react";
import { accessoryTypes, type AccessoryType, type TryOnProduct } from "../src/pages/ai-apps/try-on/workflow";

test("AI 试戴七类上传切换保留对应商品，导入、删除和禁用状态正确", async () => {
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
    const { AccessoryUpload } = await import("../src/pages/ai-apps/try-on/accessory-upload");
    let imported: AccessoryType | undefined;
    let uploads = 0;
    function Harness({ disabled = false }: { disabled?: boolean }) {
        const [category, setCategory] = useState<AccessoryType>("bag");
        const [images, setImages] = useState<Partial<Record<AccessoryType, TryOnProduct>>>({});
        return <AccessoryUpload category={category} image={images[category]} disabled={disabled} reading={false} imageUrl={(image) => image.dataUrl} onCategoryChange={setCategory} onFiles={(files) => {
            uploads++;
            setImages((items) => ({ ...items, [category]: { id: files[0].name, name: files[0].name, type: "image/png", dataUrl: `data:image/png;base64,${category}` } }));
        }} onImport={() => { imported = category; }} onRemove={() => setImages((items) => ({ ...items, [category]: undefined }))} onHover={() => {}} />;
    }
    const host = browser.document.createElement("div"); browser.document.body.append(host);
    const root = createRoot(host as unknown as HTMLElement);
    const buttons = () => [...host.querySelectorAll<HTMLButtonElement>(".try-on-accessory-types button")];
    const drop = async () => {
        const event = new browser.Event("drop", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "dataTransfer", { value: { files: [new browser.File(["fixture"], "商品.png", { type: "image/png" })] } });
        await act(async () => { host.querySelector('[data-upload-target="product"]')!.dispatchEvent(event); });
    };
    try {
        await act(async () => root.render(<Harness />));
        expect(buttons()).toHaveLength(7);
        for (const [index, category] of accessoryTypes.entries()) {
            await act(async () => buttons()[index].click());
            expect(buttons()[index].getAttribute("aria-pressed")).toBe("true");
            expect(host.querySelectorAll("h2")[1].textContent).toBe(`${category.label}商品图`);
            expect(host.querySelector("img")).toBeNull();
            await drop();
            expect(host.querySelector("img")!.getAttribute("src")).toBe(`data:image/png;base64,${category.id}`);
            await act(async () => { host.querySelector(".ant-btn")!.dispatchEvent(new browser.MouseEvent("click", { bubbles: true })); });
            expect(imported).toBe(category.id);
        }
        await act(async () => buttons()[0].click());
        expect(host.querySelector("img")!.getAttribute("src")).toBe("data:image/png;base64,bag");
        await act(async () => { host.querySelector('[aria-label="移除包包商品图"]')!.dispatchEvent(new browser.MouseEvent("click", { bubbles: true })); });
        expect(host.querySelector("img")).toBeNull();
        await act(async () => buttons()[1].click());
        expect(host.querySelector("img")!.getAttribute("src")).toBe("data:image/png;base64,belt");
        expect(host.textContent).not.toContain("会员");
        expect(host.querySelector('input[type="file"]')!.getAttribute("multiple")).toBeNull();
        await act(async () => root.render(<Harness disabled />));
        expect(buttons().every((button) => button.disabled)).toBe(true);
        await drop();
        expect(uploads).toBe(7);
    } finally {
        await act(async () => root.unmount());
        for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
        await browser.happyDOM.close();
    }
}, 60_000);
