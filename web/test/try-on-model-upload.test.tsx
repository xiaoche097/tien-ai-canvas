import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, useState } from "react";
import { tryOnInputError, tryOnReferences, tryOnTools } from "../src/pages/ai-apps/try-on/workflow";
import type { ReferenceImage } from "../src/types/image";

test.each([4, 6])("人物替换必须上传一个原图与一个目标参考，文字不能代替目标图（工具 %i）", (index) => {
    const tool = tryOnTools[index];
    const targetLabel = index === 4 ? "目标模特参考图" : "目标人脸参考图";
    expect(tryOnInputError(tool, 1, "smart", 0, "短发成年模特")).toContain(targetLabel);
    expect(tryOnInputError(tool, 1, "reference", 0, "")).toContain(targetLabel);
    expect(tryOnInputError(tool, 1, "reference", 2, "")).toContain("1 张");
    expect(tryOnInputError(tool, 1, "reference", 1, "")).toBe("");
    const image = (id: string): ReferenceImage => ({ id, name: id, type: "image/png", dataUrl: "" });
    expect(tryOnReferences([image("原图")], image("目标"), image("一致性")).map((item) => item.id)).toEqual(["原图", "目标", "一致性"]);
});

test.each(["model", "face"] as const)("原图与目标图上传区独立替换、导入、删除，并遵循禁用状态（%s）", async (kind) => {
    const browser = new Window({ url: "http://localhost/" });
    const globals = { window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node, SVGElement: browser.SVGElement, ShadowRoot: browser.ShadowRoot, MutationObserver: browser.MutationObserver, CustomEvent: browser.CustomEvent, getComputedStyle: browser.getComputedStyle.bind(browser), ResizeObserver: browser.ResizeObserver, IS_REACT_ACT_ENVIRONMENT: true };
    const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const { createRoot } = await import("react-dom/client");
    const { ModelImageUpload } = await import("../src/pages/ai-apps/try-on/model-image-upload");
    let imported = "";
    let uploads = 0;
    function Harness({ disabled = false }: { disabled?: boolean }) {
        const [images, setImages] = useState<Partial<Record<"product" | "model", ReferenceImage>>>({});
        return <>{(["product", "model"] as const).map((target) => <ModelImageUpload kind={kind} key={target} target={target} image={images[target]} disabled={disabled} reading={false} imageUrl={(image) => image.dataUrl} onFiles={(files) => { uploads++; setImages((current) => ({ ...current, [target]: { id: files[0].name, name: files[0].name, type: "image/png", dataUrl: `data:image/png;base64,${files[0].name}` } })); }} onImport={() => { imported = target; }} onRemove={() => setImages((current) => ({ ...current, [target]: undefined }))} onHover={() => {}} />)}</>;
    }
    const host = browser.document.createElement("div"); browser.document.body.append(host);
    const root = createRoot(host as unknown as HTMLElement);
    const drop = async (target: string, name: string) => {
        const event = new browser.Event("drop", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "dataTransfer", { value: { files: [new browser.File(["fixture"], name, { type: "image/png" })] } });
        await act(async () => { host.querySelector(`[data-upload-target="${target}"]`)!.dispatchEvent(event); });
    };
    try {
        await act(async () => root.render(<Harness />));
        expect(host.querySelectorAll('input[type="file"]')).toHaveLength(2);
        expect([...host.querySelectorAll("input")].every((input) => !input.hasAttribute("multiple"))).toBe(true);
        await drop("product", "original"); await drop("model", "target"); await drop("model", "replacement");
        expect(host.querySelectorAll("img")).toHaveLength(2);
        expect(host.querySelector('[data-upload-target="product"] img')!.getAttribute("src")).toContain("original");
        expect(host.querySelector('[data-upload-target="model"] img')!.getAttribute("src")).toContain("replacement");
        await act(async () => { host.querySelector('[data-upload-target="model"] .ant-btn')!.dispatchEvent(new browser.MouseEvent("click", { bubbles: true })); });
        expect(imported).toBe("model");
        await act(async () => { host.querySelector(`[aria-label="移除${kind === "face" ? "目标人脸参考图" : "目标模特参考图"}"]`)!.dispatchEvent(new browser.MouseEvent("click", { bubbles: true })); });
        expect(host.querySelectorAll("img")).toHaveLength(1);
        expect(host.textContent).not.toContain("自动匹配");
        if (kind === "face") { expect(host.textContent).toContain("肤色与光线跟随原图"); expect(host.textContent).not.toContain("清晰展示面部、发型与肤色"); }
        await act(async () => root.render(<Harness disabled />));
        expect([...host.querySelectorAll<HTMLButtonElement>("button")].every((button) => button.disabled)).toBe(true);
        await drop("model", "ignored"); expect(uploads).toBe(3);
    } finally {
        await act(async () => root.unmount());
        for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
        await browser.happyDOM.close();
    }
});
