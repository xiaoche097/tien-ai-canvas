import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";

test("换装执行模型显示同分类下的具体选项，并按参考图数量限制选择", async () => {
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
    const { createModelChannel, defaultConfig, resolveModelRequestConfig } = await import("../src/stores/use-config-store");
    const { defaultModelCapabilityConfig } = await import("../src/lib/model-capabilities");
    const { useUserStore } = await import("../src/stores/use-user-store");
    const features = useUserStore.getState().features;
    useUserStore.setState({ features: { ...features, creditsEnabled: false } });
    const channel = createModelChannel({ id: "images", scope: "system", models: ["gpt-image-2-fast", "gpt-image-2-pro"], modelCosts: [2, 1].map((maxImages, index) => {
        const capabilityConfig = defaultModelCapabilityConfig();
        capabilityConfig.image!.references.maxImages = maxImages;
        return { model: index ? "gpt-image-2-pro" : "gpt-image-2-fast", capability: "image" as const, displayName: "影像GPT", channelLabel: index ? "GPT 精修版" : "GPT 快速版", billingMode: "fixed_request" as const, unitPriceMicrocredits: 0, capabilityConfig };
    }) });
    const config = { ...defaultConfig, channels: [channel] };
    const container = browser.document.createElement("div"); browser.document.body.append(container);
    const root = createRoot(container as unknown as HTMLElement);
    let selected = "images::gpt-image-2-fast";
    const render = async (imageCount: number) => {
        await act(async () => root.render(<ModelPicker config={config} capability="image" value={selected} fullWidth showConfiguredModelName showSelectedPrice={false} requirements={{ capability: "image", input: { textCount: 1, imageCount, referenceImageCount: imageCount, videoCount: 0, audioCount: 0, characterCount: 0 } }} onChange={(value) => { selected = value; }} />));
    };
    try {
        await render(2);
        expect(container.textContent).toContain("GPT 快速版");
        await act(async () => container.querySelector("button")!.click());
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
        const options = () => [...browser.document.querySelectorAll<HTMLButtonElement>('button[role="option"]')];
        expect(options()).toHaveLength(2);
        expect(options()[0].textContent).toContain("GPT 快速版");
        expect(options()[1].textContent).toContain("GPT 精修版");
        expect(options()[1].disabled).toBe(true);
        await render(1);
        expect(options()[1].disabled).toBe(false);
        await act(async () => options()[1].click());
        expect(selected).toBe("images::gpt-image-2-pro");
        expect(resolveModelRequestConfig(config, selected)).toMatchObject({ channelId: "images", model: "gpt-image-2-pro" });
        await render(1);
        expect(container.textContent).toContain("GPT 精修版");
    } finally {
        await act(async () => root.unmount());
        useUserStore.setState({ features });
        for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
        await browser.happyDOM.close();
    }
}, 60_000);
