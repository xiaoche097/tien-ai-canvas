import { describe, expect, test } from "bun:test";
import { accessoryTypes, flatModeProducts, replaceGarmentSlot, replaceShoeView, tryOnGuides, tryOnInputError, tryOnIntent, tryOnReferences, tryOnTools } from "../src/pages/ai-apps/try-on/workflow";
import type { ReferenceImage } from "../src/types/image";

describe("镜彻穿戴工作流", () => {
    test("七类配饰提交真实品类，一次只试戴一件商品", () => {
        expect(accessoryTypes.map((item) => item.id)).toEqual(["bag", "belt", "necklace", "glasses", "bracelet", "hat", "ring"]);
        for (const category of accessoryTypes) {
            expect(tryOnIntent(tryOnTools[3], 1, true, "", false, false, undefined, undefined, category.id).accessoryType).toBe(category.id);
        }
        expect(tryOnInputError(tryOnTools[3], 2, "reference", 1, "")).toContain("最多 1 张");
    });
    test("上下装按固定职责提交，切换连体装不混图也不丢图", () => {
        const ref = (id: string): ReferenceImage => ({ id, name: id, type: "image/png", dataUrl: "" });
        let images = replaceGarmentSlot([], ref("裤子"), "lower");
        images = replaceGarmentSlot(images, ref("衬衣"), "upper");
        images = replaceGarmentSlot(images, ref("连衣裙"), "full");
        images = replaceGarmentSlot(images, ref("新衬衣"), "upper");
        expect(flatModeProducts(images, "separates").map((image) => image.id)).toEqual(["新衬衣", "裤子"]);
        expect(flatModeProducts(images, "onepiece").map((image) => image.id)).toEqual(["连衣裙"]);
        const separate = flatModeProducts(images, "separates");
        expect(tryOnIntent(tryOnTools[1], separate.length, true, "", false, false, undefined, separate.map((image) => image.garmentSlot!)).garmentSlots).toEqual(["upper", "lower"]);
        expect(flatModeProducts(images.filter((image) => image.garmentSlot !== "lower"), "separates").map((image) => image.id)).toEqual(["新衬衣"]);
    });
    test("八个功能接受各自的有效输入并阻止缺图和超量", () => {
        for (const tool of tryOnTools) {
            expect(tryOnInputError(tool, 1, "reference", 1, "")).toBe("");
            expect(tryOnInputError(tool, 0, "smart", 0, "目标")).toContain(tryOnGuides[tool.id].productLabel);
            expect(tryOnInputError(tool, tryOnGuides[tool.id].maxProducts + 1, "reference", 1, "")).toContain("最多");
            expect(tryOnInputError(tool, 1, "reference", 0, "目标")).toContain(tryOnGuides[tool.id].referenceLabel);
        }
    });
    test("姿态、脸和颜色需要文字或对应参考图，不能用空目标生成", () => {
        for (const tool of tryOnTools) {
            expect(Boolean(tryOnInputError(tool, 1, "smart", 0, "  "))).toBe(["model", "pose", "face", "color"].includes(tool.id));
            expect(tryOnInputError(tool, 1, "smart", 0, "目标说明")).toBe(["model", "face"].includes(tool.id) ? `请上传 1 张${tryOnGuides[tool.id].referenceLabel}，目标人物需由你提供` : "");
        }
        expect(tryOnGuides.pose.referenceLabel).toBe("目标姿态参考图");
        expect(tryOnGuides.face.referenceLabel).toBe("目标人脸参考图");
        expect(tryOnGuides.color.referenceLabel).toBe("目标配色参考图");
    });
    test("编辑功能只接受一个原图，穿搭保留多商品组合", () => {
        for (const tool of tryOnTools.filter((tool) => ["model", "pose", "face", "color"].includes(tool.id))) {
            expect(tryOnInputError(tool, 2, "reference", 1, "")).toContain("最多 1 张");
        }
        expect(tryOnInputError(tryOnTools[0], 10, "reference", 1, "")).toBe("");
    });
    test("鞋图乱序上传仍按双脚、外侧、内侧提交，替换不增加图片数", () => {
        const ref = (id: string): ReferenceImage => ({ id, name: id, type: "image/png", dataUrl: "" });
        let images = replaceShoeView([], ref("内侧"), "inner");
        images = replaceShoeView(images, ref("双脚"), "pair");
        images = replaceShoeView(images, ref("外侧"), "outer");
        images = replaceShoeView(images, ref("外侧新版"), "outer");
        expect(images.map((image) => image.id)).toEqual(["双脚", "外侧新版", "内侧"]);
        expect(tryOnIntent(tryOnTools[2], 3, true, "", false, false, images.map((image) => image.shoeView!)).shoeViews).toEqual(["pair", "outer", "inner"]);
    });
    test("商品、模特和一致性参考的顺序与提示词一致", () => {
        const ref = (id: string): ReferenceImage => ({ id, name: id, type: "image/png", dataUrl: "" });
        expect(tryOnReferences([ref("商品1"), ref("商品2")], ref("模特"), ref("首张成片")).map((r) => r.id)).toEqual(["商品1", "商品2", "模特", "首张成片"]);
        expect(tryOnIntent(tryOnTools[0], 2, true, "保持帽子图案", false, true)).toEqual({ tool: "outfit", productCount: 2, referenceMode: "reference", description: "保持帽子图案", generationMode: "professional", hasAnchor: true });
    });
    test("智能模特不引用不存在的图片，各工具执行不同指令", () => {
        const intents = tryOnTools.map((tool) => tryOnIntent(tool, 1, false, "", false));
        expect(new Set(intents.map((intent) => intent.tool)).size).toBe(8);
        expect(intents[0].referenceMode).toBe("smart");
        expect(intents[0].description).toBe("");
        expect(intents[0].hasAnchor).toBe(false);
    });
});
