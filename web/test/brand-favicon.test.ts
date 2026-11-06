import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { appearanceLogoURL, normalizePublicAppearance } from "../src/stores/use-appearance-store";

test("default brand favicon uses a distinct ICO URL in both themes", () => {
    const appearance = normalizePublicAppearance({});
    for (const theme of ["light", "dark"] as const) expect(appearanceLogoURL(appearance, theme)).toBe(`/jingche-favicon-${theme}.ico?v=2`);
});

test("custom brand favicon continues to use its configured theme logo", () => {
    const appearance = normalizePublicAppearance({logoConfigured:true,darkLogoConfigured:true,logoUrl:"/custom-light.png",darkLogoUrl:"/custom-dark.png"});
    expect(appearanceLogoURL(appearance, "light")).toBe("/custom-light.png");
    expect(appearanceLogoURL(appearance, "dark")).toBe("/custom-dark.png");
});

test("favicon contains valid embedded PNG frames for browser icon sizes", () => {
    for (const theme of ["light", "dark"]) {
    const ico = readFileSync(new URL(`../public/jingche-favicon-${theme}.ico`, import.meta.url));
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(4);
    for (const [index, size] of [16, 32, 48, 64].entries()) {
        const entry = 6 + index * 16;
        expect(ico[entry]).toBe(size);
        expect(ico[entry + 1]).toBe(size);
        const length = ico.readUInt32LE(entry + 8), offset = ico.readUInt32LE(entry + 12);
        expect(offset + length).toBeLessThanOrEqual(ico.length);
        expect(ico.subarray(offset, offset + 8).toString("hex")).toBe("89504e470d0a1a0a");
        expect(ico.readUInt32BE(offset + 16)).toBe(size);
        expect(ico.readUInt32BE(offset + 20)).toBe(size);
    }
    expect(ico.length).toBeLessThan(20000);
    }
});
