import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { appearanceLogoURL, normalizePublicAppearance } from "../src/stores/use-appearance-store";

test("default brand favicon switches with the theme", () => {
    const appearance = normalizePublicAppearance({});
    for (const theme of ["light", "dark"] as const) {
        expect(appearanceLogoURL(appearance, theme)).toBe(`/jingche-favicon-${theme}.ico?v=2`);
        const ico = readFileSync(new URL(`../public/jingche-favicon-${theme}.ico`, import.meta.url));
        expect(ico.readUInt16LE(2)).toBe(1);
        expect(ico.readUInt16LE(4)).toBe(4);
        expect(ico.length).toBeLessThan(20000);
    }
});

test("custom brand favicon keeps its configured theme logos", () => {
    const appearance = normalizePublicAppearance({logoConfigured:true,darkLogoConfigured:true,logoUrl:"/custom-light.png",darkLogoUrl:"/custom-dark.png"});
    expect(appearanceLogoURL(appearance, "light")).toBe("/custom-light.png");
    expect(appearanceLogoURL(appearance, "dark")).toBe("/custom-dark.png");
});
