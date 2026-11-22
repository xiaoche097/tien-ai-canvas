import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandLogo } from "../src/components/brand/brand-logo";

test("default Jingche identity displays its original logo in both themes without an upload", () => {
    for (const theme of ["light", "dark"] as const) {
        const html = renderToStaticMarkup(<BrandLogo theme={theme} fallback={<span>generic-icon</span>} />);
        expect(html).toContain("jingche-logo.png?v=2");
        expect(html.includes("invert(1)")).toBe(theme === "dark");
        expect(html).not.toContain("generic-icon");
    }
});
