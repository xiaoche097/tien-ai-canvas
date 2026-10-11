import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { commercePlatforms, resolvePlatform, platformRule, preferredPlatformSize, checkPlatformSettings, compileCommerceBrief } from "../src/pages/projects/commerce/platform-standards.ts";

const get = (name: string, id?: string) => platformRule(resolvePlatform(name, "").platform, id)!;
describe("commerce platform standards", () => {
    it("keeps automatic matching explicit and does not confuse Douyin with TikTok", () => {
        assert.equal(commercePlatforms.length, 16);
        assert.equal(resolvePlatform("智能匹配", "一张护肤品主图").platform.id, "auto");
        assert.equal(resolvePlatform("智能匹配", "抖音商品主图").platform.id, "douyin");
        assert.equal(resolvePlatform("智能匹配", "TikTok shop 首图").platform.id, "tiktok");
        assert.equal(resolvePlatform("智能匹配", "Amazon 和淘宝都要").platform.id, "auto");
        assert.equal(resolvePlatform("智能匹配", "notamazonexample").platform.id, "auto");
        assert.equal(resolvePlatform("eBay", "淘宝").platform.id, "ebay");
    });
    it("checks eBay longest side rather than enforcing a square image", () => {
        const rule = get("eBay");
        assert.deepEqual(checkPlatformSettings(rule, "600x300", ""), []);
        assert.match(checkPlatformSettings(rule, "499x300", "").join(), /最长边/);
        assert.match(checkPlatformSettings(rule, "600x300", "添加水印").join(), /冲突/);
    });
    it("distinguishes A+ modules and preserves model parameter boundaries", () => {
        const header = get("亚马逊A+", "header");
        const overlay = get("亚马逊A+", "overlay");
        assert.deepEqual(header.minimum, [970, 600]);
        assert.deepEqual(overlay.minimum, [970, 300]);
        assert.equal(preferredPlatformSize(header, ["1:1", "3:4"]), undefined);
        assert.equal(preferredPlatformSize(overlay, ["970x300", "970x600"]), "970x300");
        assert.equal(preferredPlatformSize(header, ["485x300"]), undefined);
        assert.match(checkPlatformSettings(header, "1:1", "二维码折扣").join(), /促销或导流/);
    });
    it("does not certify unknown pixels, merchant-only standards or AI renderings", () => {
        assert.match(checkPlatformSettings(get("TikTok"), "600x600", "").join(), /禁止商品数字渲染图/);
        assert.match(checkPlatformSettings(get("TikTok"), "1:1", "").join(), /无法据此确认最终像素/);
        assert.match(checkPlatformSettings(get("淘宝"), "800x800", "").join(), /尚待核验/);
        assert.equal(get("Shopee").status, "guidance");
        assert.equal(get("Shopee").minimum, undefined);
        assert.equal(preferredPlatformSize(get("Shopee"), ["512x512", "1024x1024"]), "1024x1024");
        assert.equal(get("抖音").status, "guidance");
        assert.match(checkPlatformSettings(get("eMAG"), "1024x1024", "").join(), /完整上传/);
    });
    it("compiles sourced platform constraints without overwriting user requirements", () => {
        const platform = resolvePlatform("亚马逊A+", "").platform;
        const brief = compileCommerceBrief({
            platform,
            rule: platformRule(platform),
            requirements: "我的包装需要保持",
            language: "简体中文",
            size: "1:1",
            count: "3",
            product: "香水",
            sellingPoints: "花香",
            audience: "",
            style: "",
            avoid: "",
            merchantRules: "后台类目规定：JPG",
        });
        assert.match(brief, /我的包装需要保持/);
        assert.match(brief, /970 × 600/);
        assert.match(brief, /不加入价格/);
        assert.match(brief, /https:\/\/developer-docs.amazon.com/);
        assert.match(brief, /用户提供，尚未独立核验/);
    });
});
