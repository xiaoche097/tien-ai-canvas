import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";

test("narrow picker supports all-groups opening and navigation from the selected group", async () => {
    const browser = new Window({ url: "http://localhost/", width: 420, height: 900 });
    const globals = {
        window: browser, document: browser.document, navigator: browser.navigator,
        HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node,
        SVGElement: browser.SVGElement, ShadowRoot: browser.ShadowRoot,
        MutationObserver: browser.MutationObserver, CustomEvent: browser.CustomEvent,
        getComputedStyle: browser.getComputedStyle.bind(browser),
        ResizeObserver: browser.ResizeObserver, IS_REACT_ACT_ENVIRONMENT: true,
    };
    const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const { createRoot } = await import("react-dom/client");
    const { ModelPicker } = await import("../src/components/model-picker");
    const { createModelChannel, defaultConfig, selectableModelsByCapability } = await import("../src/stores/use-config-store");
    const { defaultModelCapabilityConfig } = await import("../src/lib/model-capabilities");
    const { imageLayerPlannerError } = await import("../src/lib/canvas/canvas-image-layer-plan");
    const { useUserStore } = await import("../src/stores/use-user-store");
    const features = useUserStore.getState().features;
    useUserStore.setState({ features: { ...features, creditsEnabled: false } });
    const capabilityConfig = defaultModelCapabilityConfig();
    capabilityConfig.text!.references.maxImages = 1;
    const channel = createModelChannel({ id: "vision", scope: "system", models: ["alpha", "beta"], modelCosts: [
        { model: "alpha", capability: "text", displayName: "视觉甲", unitPriceMicrocredits: 0, capabilityConfig },
        { model: "beta", capability: "text", displayName: "视觉乙", unitPriceMicrocredits: 0, capabilityConfig },
    ] });
    const config = { ...defaultConfig, channels: [channel] };
    expect(selectableModelsByCapability(config, "text")).toHaveLength(2);
    const container = browser.document.createElement("div"); browser.document.body.append(container);
    const root = createRoot(container as unknown as HTMLElement);
    let selected = "";
    try {
        for (const initialView of ["selected", "groups"] as const) {
        selected = "";
        await act(async () => { root.render(<ModelPicker key={initialView} initialView={initialView} config={config} value="vision::alpha" capability="text" showSelectedPrice={false} modelFilter={(model) => !imageLayerPlannerError(config, model)} onChange={(model) => { selected = model; }} />); });
        await act(async () => { container.querySelector("button")!.click(); });
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
        const back = browser.document.querySelector('[aria-label="返回全部模型分组"]') as unknown as HTMLButtonElement;
        if (initialView === "selected") {
            expect(back).not.toBeNull();
            expect(back.style.whiteSpace).toBe("nowrap");
            expect(back.style.width).toBe("auto");
            expect(back.parentElement!.style.flexDirection).toBe("column");
            await act(async () => { back.click(); });
        } else {
            expect(back).toBeNull();
            const alphaGroup = [...browser.document.querySelectorAll("button[data-model-picker-item]")].find((button) => button.textContent.includes("视觉甲"));
            expect(alphaGroup?.getAttribute("aria-pressed")).toBe("true");
        }
        const betaGroup = [...browser.document.querySelectorAll("button[data-model-picker-item]")].find((button) => button.textContent.includes("视觉乙"));
        expect(betaGroup).toBeDefined();
        await act(async () => { betaGroup!.click(); });
        const option = browser.document.querySelector('button[role="option"]')!;
        await act(async () => { option.click(); });
        expect(selected).toBe("vision::beta");
        }
    } finally {
        await act(async () => { root.unmount(); });
        useUserStore.setState({ features });
        for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
        await browser.happyDOM.close();
    }
}, 60_000);
