import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("workspace credit gift mark", () => {
    test("workspace credits stay inside the account menu and canvas retains its compact gift", () => {
        const topBar = readFileSync(resolve(import.meta.dir, "../src/components/layout/workspace-top-bar.tsx"), "utf8");
        const canvas = readFileSync(resolve(import.meta.dir, "../src/pages/canvas/canvas-project-top-bar.tsx"), "utf8");
        const mark = readFileSync(resolve(import.meta.dir, "../src/components/layout/workspace-credit-gift-mark.tsx"), "utf8");
        const css = readFileSync(resolve(import.meta.dir, "../src/styles/globals.css"), "utf8");

        const account = readFileSync(resolve(import.meta.dir, "../src/components/layout/workspace-account-card.tsx"), "utf8");
        expect(topBar).not.toContain("app-workspace-topbar-credit-pill");
        expect(topBar).toContain("<WorkspaceAccountMenu />");
        expect(account).toContain("WorkspaceCreditGiftMark");
        expect(topBar).not.toContain("Coins");
        expect(canvas).toContain('<WorkspaceCreditGiftMark className="is-compact" />');
        expect(canvas).not.toContain("Coins");
        expect(mark).toContain("#FFB34A");
        expect(mark).toContain("#12B8A8");
        expect(css).toContain(".app-workspace-credit-gift");
        expect(css).toContain("rotate(-8deg)");
    });
});
