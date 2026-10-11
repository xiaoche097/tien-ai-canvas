import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { platformRule, resolvePlatform } from "../src/pages/projects/commerce/platform-standards.ts";
import { generationPolicy, checkGeneratedImage, generatedImageMime } from "../src/pages/projects/commerce/generation-policy.ts";

const rule = (name: string, id?: string) => platformRule(resolvePlatform(name, "").platform, id)!;
describe("commerce generation guidance", () => {
    it("reads the file signature instead of trusting the response MIME label", () => {
        assert.equal(generatedImageMime(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])), "image/png");
        assert.equal(generatedImageMime(new Uint8Array([255, 216, 255])), "image/jpeg");
        assert.equal(generatedImageMime(new TextEncoder().encode("RIFF0000WEBP")), "image/webp");
        assert.equal(generatedImageMime(new TextEncoder().encode("not-an-image")), "");
    });
    it("warns about listing restrictions and uses general guidance for unresolved platforms", () => {
        assert.match(generationPolicy(rule("TikTok"), "1024x1024", ["1024x1024"], "").warnings.join(), /继续制作创意草稿/);
        assert.match(generationPolicy(undefined, "1024x1024", [], "").warnings.join(), /通用商品创作/);
    });
    it("makes merchant rules optional where official requirements are not available", () => {
        assert.match(generationPolicy(rule("淘宝"), "1024x1024", [], "").warnings.join(), /不影响创作/);
        assert.deepEqual(generationPolicy(rule("淘宝"), "1024x1024", [], "已核对店铺类目规则").warnings, []);
    });
    it("selects supported A+ dimensions and advises when sizes need later adjustment", () => {
        assert.equal(generationPolicy(rule("亚马逊A+", "overlay"), "1024x1024", ["1024x1024", "970x300"], "").size, "970x300");
        assert.match(generationPolicy(rule("亚马逊A+", "overlay"), "1024x1024", ["1024x1024"], "").warnings.join(), /裁切调整/);
        assert.match(generationPolicy(rule("eBay"), "400x300", ["400x300"], "").warnings.join(), /最长边/);
    });
    it("checks actual pixels rather than trusting selected ratio or provider metadata", () => {
        const image = { width: 300, height: 300, bytes: 1000, mimeType: "image/png" };
        assert.match(checkGeneratedImage(rule("eBay"), image).failures.join(), /最长边/);
        assert.match(checkGeneratedImage(rule("亚马逊A+", "overlay"), { ...image, width: 970, height: 600 }).failures.join(), /比例/);
        const checked = checkGeneratedImage(rule("eBay"), { ...image, width: 600 });
        assert.deepEqual(checked.failures, []);
        assert.match(checked.review, /不代表平台审核/);
    });
});
