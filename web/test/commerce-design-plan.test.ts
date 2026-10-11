import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { commerceAnalysisPrompt, parseCommerceDesignPlan } from "../src/pages/projects/commerce/design-plan.ts";

const design = {
    productSummary: "可见蓝色棉质衬衫，成分待确认",
    designSystem: "留白、统一字体，保留产品外观",
    images: [
        { title: "主展示", description: "整体款式", prompt: "保留蓝色衬衫结构，正面拍摄" },
        { title: "细节", description: "领口特写", prompt: "忠实展示可见领口与缝线" },
    ],
};
describe("commerce expert planning", () => {
    it("reads real structured model results and fenced JSON", () => {
        const plan = parseCommerceDesignPlan(`\`\`\`json\n${JSON.stringify(design)}\n\`\`\``, 2);
        assert.equal(plan.images[0].prompt, design.images[0].prompt);
        assert.equal(plan.images[1].id, "design-2");
    });
    it("does not replace missing or invalid analysis with invented planning", () => {
        assert.throws(() => parseCommerceDesignPlan("invalid", 2), /有效的设计规划/);
        assert.throws(() => parseCommerceDesignPlan(JSON.stringify(design), 3), /3 张/);
        assert.throws(() => parseCommerceDesignPlan(JSON.stringify({ ...design, images: [{ ...design.images[0], prompt: "" }, design.images[1]] }), 2), /生成需求/);
    });
    it("asks the expert to inspect images and avoid unsupported product claims", () => {
        const prompt = commerceAnalysisPrompt("淘宝 商品详情图", 2);
        assert.match(prompt, /实际查看上传/);
        assert.match(prompt, /不要编造/);
        assert.match(prompt, /正好 2 项/);
        assert.match(prompt, /不阻止创意草稿/);
    });
});
