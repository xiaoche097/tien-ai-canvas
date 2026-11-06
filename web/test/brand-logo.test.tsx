import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandLogo } from "../src/components/brand/brand-logo";
import { LogoThemePreview } from "../src/pages/admin/settings/appearance-settings-parts";

test("default Jingche identity displays its original logo in both themes without an upload", () => {
    for (const theme of ["light", "dark"] as const) {
        const html = renderToStaticMarkup(<BrandLogo theme={theme} fallback={<span>generic-icon</span>} />);
        expect(html).toContain("jingche-logo.png?v=2");
        expect(html.includes("invert(1)")).toBe(theme === "dark");
        expect(html).not.toContain("generic-icon");
    }
});

test("admin builtin logo previews keep the source artwork and correct theme without a frame", () => {
    for (const dark of [false, true]) {
        const html = renderToStaticMarkup(<LogoThemePreview label="preview" icon={null} src="/jingche-logo.png?v=2" dark={dark} frameEnabled builtin />);
        expect(html).toContain("jingche-logo.png?v=2");
        expect(html).toContain("is-unframed");
        expect(html.includes("invert(1)")).toBe(dark);
    }
});
