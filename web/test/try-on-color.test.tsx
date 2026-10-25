import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { colorPalette, defaultColorEdit, filterPalette, validColorHex } from "../src/pages/ai-apps/try-on/color-palette";
import { tryOnInputError, tryOnIntent, tryOnTools } from "../src/pages/ai-apps/try-on/workflow";

describe("AI 换色色库与结构化参数", () => {
    test("完整覆盖公开色库 221 色与 16 组，色值有效且无重复条目", () => {
        const colors = colorPalette.flatMap((group) => group.colors);
        expect(colorPalette).toHaveLength(16);
        expect(colors).toHaveLength(221);
        expect(colors.every((color) => validColorHex(color.hex))).toBe(true);
        expect(new Set(colors.map((color) => `${color.name}:${color.hex}`)).size).toBe(221);
        expect(filterPalette("黄色", "法国香草")[0].colors).toEqual([{ name: "法国香草", hex: "#F0E1A5" }]);
        expect(filterPalette("", "#f0e1a5")[0].colors[0].name).toBe("法国香草");
        expect(filterPalette("蓝色", "法国香草")).toHaveLength(0);
    });
    test("选色无需重复填写描述，参考模式限定单图并校验取色值", () => {
        const tool = tryOnTools[7];
        expect(tryOnInputError(tool, 1, "smart", 0, "", undefined, defaultColorEdit)).toBe("");
        expect(tryOnInputError(tool, 1, "smart", 0, "", undefined, { ...defaultColorEdit, hex: "#xyz" })).toContain("HEX");
        expect(tryOnInputError(tool, 1, "smart", 0, "", undefined, { ...defaultColorEdit, target: "" })).toContain("换色对象");
        const reference = { ...defaultColorEdit, mode: "reference" as const, hex: "", fidelity: true };
        expect(tryOnInputError(tool, 1, "reference", 2, "", undefined, reference)).toContain("1 张");
        expect(tryOnInputError(tool, 1, "reference", 1, "", undefined, reference)).toBe("");
        expect(tryOnIntent(tool, 1, true, "", false, false, undefined, undefined, undefined, undefined, reference).colorEdit).toEqual(reference);
        expect(tryOnIntent(tryOnTools[0], 1, false, "", false, false, undefined, undefined, undefined, undefined, reference).colorEdit).toBeUndefined();
    });
});

test("参考图取色映射真实像素，透明区不提交，读取失败明确提示", async () => {
    const browser = new Window({ url: "http://localhost/" });
    const globals = { window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node, SVGElement: browser.SVGElement, ShadowRoot: browser.ShadowRoot, MutationObserver: browser.MutationObserver, CustomEvent: browser.CustomEvent, getComputedStyle: browser.getComputedStyle.bind(browser), ResizeObserver: browser.ResizeObserver, IS_REACT_ACT_ENVIRONMENT: true };
    const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const { createRoot } = await import("react-dom/client");
    const { ColorReferenceSampler } = await import("../src/pages/ai-apps/try-on/color-settings");
    const host = browser.document.createElement("div"); browser.document.body.append(host);
    const root = createRoot(host as unknown as HTMLElement);
    let selected = "";
    let sampled: number[] = [];
    let alpha = 255;
    const canvasPrototype = browser.HTMLCanvasElement.prototype;
    const originalContext = canvasPrototype.getContext;
    Object.defineProperty(canvasPrototype, "getContext", { configurable: true, value: () => ({ drawImage() {}, getImageData(x: number, y: number) { sampled = [x, y]; return { data: [240, 225, 165, alpha] }; } }) });
    try {
        await act(async () => root.render(<ColorReferenceSampler src="/fixture.png" hex="" onSample={(hex) => { selected = hex; }} />));
        const image = host.querySelector("img")!;
        Object.defineProperties(image, { naturalWidth: { value: 100 }, naturalHeight: { value: 200 }, getBoundingClientRect: { value: () => ({ left: 10, top: 20, width: 200, height: 400 }) } });
        const button = host.querySelector("button")!;
        await act(async () => button.dispatchEvent(new browser.MouseEvent("click", { bubbles: true, detail: 1, clientX: 110, clientY: 120 })));
        expect(sampled).toEqual([50, 50]);
        expect(selected).toBe("#F0E1A5");
        alpha = 0; selected = "";
        await act(async () => button.click());
        expect(selected).toBe("");
        expect(host.textContent).toContain("不透明");
        Object.defineProperty(canvasPrototype, "getContext", { configurable: true, value: () => null });
        await act(async () => button.click());
        expect(host.textContent).toContain("无法读取像素");
    } finally {
        await act(async () => root.unmount());
        Object.defineProperty(canvasPrototype, "getContext", { configurable: true, value: originalContext });
        for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
        await browser.happyDOM.close();
    }
});
