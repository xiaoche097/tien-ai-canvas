import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { useToolDraftState } from "../src/pages/ai-apps/try-on/use-tool-draft-state";
import { descriptionPresetsFor, tryOnTools } from "../src/pages/ai-apps/try-on/workflow";

test("八工具草稿、函数更新、延迟响应与跨工具历史恢复互不串用", async () => {
    const browser = new Window({ url: "http://localhost/" });
    const globals = { window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node, IS_REACT_ACT_ENVIRONMENT: true };
    const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const { createRoot } = await import("react-dom/client");
    type Draft = { images: string[]; reference: string; description: string; model: string; count: number };
    let controls!: ReturnType<typeof useToolDraftState<Draft>>;
    function Harness({ tool }: { tool: string }) {
        controls = useToolDraftState<Draft>(tool, { images: [], reference: "smart", description: "", model: "default", count: 1 });
        return <output>{JSON.stringify(controls[0])}</output>;
    }
    const host = browser.document.createElement("div"); browser.document.body.append(host);
    const root = createRoot(host as unknown as HTMLElement);
    const show = async (tool: string) => { await act(async () => root.render(<Harness tool={tool} />)); };
    try {
        for (const [i, tool] of tryOnTools.entries()) {
            await show(tool.id);
            expect(controls[0].images).toEqual([]);
            await act(async () => controls[1]({ images: [tool.id], reference: "reference", description: tool.id, model: `model-${tool.id}`, count: i + 1 }));
        }
        for (const [i, tool] of tryOnTools.entries()) {
            await show(tool.id);
            expect(controls[0]).toEqual({ images: [tool.id], reference: "reference", description: tool.id, model: `model-${tool.id}`, count: i + 1 });
        }
        await show("pose");
        const delayedSetter = controls[1];
        await show("color");
        await act(async () => delayedSetter((draft) => ({ ...draft, description: "晚到的姿态扩写" })));
        expect(controls[0].description).toBe("color");
        await act(async () => controls[1]((draft) => ({ ...draft, model: "历史换脸模型", images: ["历史原图", "历史目标人脸"] }), "face"));
        expect(controls[0].model).toBe("model-color");
        await show("face");
        expect(controls[0].images).toEqual(["历史原图", "历史目标人脸"]);
        expect(controls[0].model).toBe("历史换脸模型");
        await show("pose"); expect(controls[0].description).toBe("晚到的姿态扩写");
        await act(async () => controls[1]((draft) => ({ ...draft, images: [] })));
        await show("outfit"); expect(controls[0].images).toEqual(["outfit"]);
        await show("accessory-bag"); await act(async () => controls[1]((draft) => ({ ...draft, description: "单肩背包" })));
        await show("accessory-ring"); expect(controls[0].description).toBe("");
        await show("accessory-bag"); expect(controls[0].description).toBe("单肩背包");
    } finally {
        await act(async () => root.unmount());
        for (const key of Object.keys(globals)) { const descriptor = previous[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
        await browser.happyDOM.close();
    }
});

test("局部编辑词库只提供对应保留项，不附加棚拍或街拍场景", () => {
    for (const tool of ["model", "face", "pose", "color"] as const) {
        const text = descriptionPresetsFor(tool).map((item) => item.text).join(" ");
        expect(text).not.toContain("浅灰背景");
        expect(text).not.toContain("城市街道");
    }
    expect(descriptionPresetsFor("color")[0].text).toContain("底布颜色");
    expect(descriptionPresetsFor("face")[0].text).toContain("保留原表情");
    expect(descriptionPresetsFor("shoes").map((item) => item.text).join(" ")).not.toContain("全身构图");
    expect(descriptionPresetsFor("outfit", true).map((item) => item.text).join(" ")).not.toContain("城市街道");
});
