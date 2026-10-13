import { describe, expect, it } from "bun:test";
import { trustedLive2DURL } from "./live2d-loader";

describe("trustedLive2DURL", () => {
    const api = new URL("https://api.example.com/api/");
    const bundled = new URL("https://www.example.com/live2d/jingche/");

    it("accepts only the bundled model files for either theme", () => {
        expect(trustedLive2DURL(new URL("dark/JingcheAgent.model3.json", bundled), api, bundled)).toBe(true);
        expect(trustedLive2DURL(new URL("light/texture_00.png", bundled), api, bundled)).toBe(true);
        expect(trustedLive2DURL(new URL("dark/other.js", bundled), api, bundled)).toBe(false);
        expect(trustedLive2DURL(new URL("dark/nested/texture_00.png", bundled), api, bundled)).toBe(false);
        expect(trustedLive2DURL(new URL("https://other.example.com/live2d/jingche/dark/texture_00.png"), api, bundled)).toBe(false);
    });

    it("keeps the uploaded-model API on its configured origin", () => {
        expect(trustedLive2DURL(new URL("public/appearance/live2d/id/model3.json", api), api, bundled)).toBe(true);
        expect(trustedLive2DURL(new URL("admin/settings/appearance/live2d/id/model3.json", api), api, bundled)).toBe(true);
        expect(trustedLive2DURL(new URL("https://www.example.com/api/public/appearance/live2d/id/model3.json"), api, bundled)).toBe(false);
    });
});
