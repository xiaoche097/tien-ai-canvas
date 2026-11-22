import { expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import type { AutoPartsVehicleConfiguration } from "../src/services/api/auto-parts";
import catalog from "../../backend/internal/prompts/auto_parts/vehicle-configurations.json";

test("汽配工作台按商品后实车顺序提交一次，取消确认前锁定重新生成", async () => {
    const browser = new Window({ url: "http://localhost/" });
    const globals = { window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node, SVGElement: browser.SVGElement, ShadowRoot: browser.ShadowRoot, MutationObserver: browser.MutationObserver, CustomEvent: browser.CustomEvent, getComputedStyle: browser.getComputedStyle.bind(browser), ResizeObserver: browser.ResizeObserver, IS_REACT_ACT_ENVIRONMENT: true };
    const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    let submitted: any[] = [], finishCancel: (() => void) | undefined;
    const cancelled: string[] = [];
    mock.module("../src/services/api/generation-task", () => ({ runBackendGenerationTask: (options: any) => {
        submitted.push(options); options.onTaskUpdate({ id: "test-task", status: "running" });
        return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
    } }));
    mock.module("../src/services/api/task-center", () => ({ cancelGenerationTask: (id: string) => { cancelled.push(id); return new Promise<void>((resolve) => { finishCancel = resolve; }); }, listGenerationTasks: async () => [], queryGenerationTask: async () => ({}) }));
    mock.module("../src/components/assets/asset-library-picker-modal", () => ({ AssetLibraryPickerModal: ({ open, title, onConfirm }: any) => open ? <button onClick={() => { const interior = title.includes("内饰"); const ids = interior ? ["interior"] : ["front", "side"]; onConfirm(ids, ids.map((id) => ({ id, title: id, imageUrl: "data:image/png;base64,fixture" }))); }}>导入测试参考</button> : null }));
    const { createRoot } = await import("react-dom/client");
    const { MemoryRouter } = await import("react-router");
    const { App } = await import("antd");
    const { createModelChannel, defaultConfig, useConfigStore } = await import("../src/stores/use-config-store");
    const { defaultModelCapabilityConfig } = await import("../src/lib/model-capabilities");
    const { useUserStore } = await import("../src/stores/use-user-store");
    const savedConfig = useConfigStore.getState().config, features = useUserStore.getState().features;
    const capabilityConfig = defaultModelCapabilityConfig(); capabilityConfig.image!.references.maxImages = 5;
    const channel = createModelChannel({ id: "images", scope: "system", models: ["gpt-image-2"], modelCosts: [{ model: "gpt-image-2", capability: "image", displayName: "测试模型", billingMode: "fixed_request", unitPriceMicrocredits: 0, capabilityConfig }] });
    useConfigStore.setState({ config: { ...defaultConfig, channels: [channel], imageModel: "images::gpt-image-2", taskWorkflowProvider: "runninghub" } });
    useUserStore.setState({ features: { ...features, creditsEnabled: false } });
    const { AutoPartsWorkbench } = await import("../src/pages/auto-parts-center/workbench");
    const host = browser.document.createElement("div"); browser.document.body.append(host);
    const root = createRoot(host as unknown as HTMLElement);
    const clickText = async (label: string) => act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes(label))!.click());
    try {
        await act(async () => root.render(<MemoryRouter><App><AutoPartsWorkbench vehicle={{ id: "ford-f150", make: "Ford", model: "F-150", body: "pickup", markets: ["US"], sourceUrl: "https://www.ford.com/trucks/f150/", previewCell: 0, configurations: catalog["ford-f150"] as AutoPartsVehicleConfiguration[] }} onBack={() => {}} /></App></MemoryRouter>));
        const generateButton = () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("生成效果图"))!;
        expect(generateButton().disabled).toBe(true); expect(submitted).toHaveLength(0);
        await act(async () => host.querySelector('[aria-label="车型型号配置"]')!.dispatchEvent(new browser.MouseEvent("mousedown", { bubbles: true })));
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
        await act(async () => [...browser.document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find((option) => option.textContent === "XLT")!.click());
        expect(generateButton().disabled).toBe(true);
        for (const [field, label] of [["驾驶室车身", "SuperCrew · 全尺寸双排"], ["座椅结构", "40/20/40 前排 · 中间座椅／翻折扶手"]]) {
            await act(async () => host.querySelector(`[aria-label="${field}"]`)!.dispatchEvent(new browser.MouseEvent("mousedown", { bubbles: true })));
            await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
            await act(async () => [...browser.document.querySelectorAll<HTMLElement>(".ant-select-item-option")].find((option) => option.textContent === label)!.click());
        }
        expect(host.querySelector(".auto-parts-seat-details")!.textContent).toContain("60/40");
        for (const index of [0, 1]) {
            await act(async () => host.querySelectorAll<HTMLButtonElement>(".auto-parts-upload .ant-btn")[index].click());
            await clickText("导入测试参考");
        }
        await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
        expect(generateButton().disabled).toBe(false);
        await act(async () => { generateButton().click(); generateButton().click(); });
        expect(submitted).toHaveLength(1);
        expect(submitted[0].referenceImages.map((image: any) => image.id)).toEqual(["front", "side", "interior"]);
        expect(submitted[0].config.count).toBe("1"); expect(submitted[0].metadata.autoParts.productCount).toBe(2);
        expect(submitted[0].config.taskWorkflowProvider).toBe("model");
        expect(submitted[0].metadata.autoParts.seatingId).toBe("crew-bench");
        expect(submitted[0].metadata.autoParts.cabin).toBe("SuperCrew · 全尺寸双排");
        expect(host.querySelector("fieldset")!.hasAttribute("inert")).toBe(true);
        await clickText("取消当前任务");
        expect(cancelled).toEqual(["test-task"]); expect(generateButton().disabled).toBe(true);
        await act(async () => finishCancel!());
        expect(generateButton().disabled).toBe(false); expect(submitted).toHaveLength(1);
    } finally {
        await act(async () => root.unmount());
        useConfigStore.setState({ config: savedConfig }); useUserStore.setState({ features });
        for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
        await browser.happyDOM.close();
    }
}, 60_000);
