import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PoseModeSelect } from "../src/pages/ai-apps/try-on/pose-mode-select";
import { tryOnInputError, tryOnIntent, tryOnTools } from "../src/pages/ai-apps/try-on/workflow";

describe("模特换姿三种模式", () => {
    const tool = tryOnTools[5];
    test("智能换姿无须目标，文字和参考模式各自校验", () => {
        expect(tryOnInputError(tool, 1, "smart", 0, "", "smart")).toBe("");
        expect(tryOnInputError(tool, 1, "smart", 0, "", "text")).toContain("目标动作");
        expect(tryOnInputError(tool, 1, "reference", 0, "", "reference")).toContain("姿态参考图");
        expect(tryOnInputError(tool, 1, "reference", 1, "", "reference")).toBe("");
        expect(tryOnIntent(tool, 1, false, "", false, false, undefined, undefined, undefined, "smart").poseMode).toBe("smart");
    });
    test("默认智能面板展示服装选姿依据，三项选择可访问", () => {
        const html = renderToStaticMarkup(<PoseModeSelect value="smart" onChange={() => {}} />);
        expect(html).toContain('aria-label="换姿方式"');
        expect(html).toContain('aria-pressed="true">智能换姿');
        expect(html).toContain("文字换姿");
        expect(html).toContain("以图换姿");
        expect(html).toContain("领口、袖型、腰线与下摆");
        expect(renderToStaticMarkup(<PoseModeSelect value="text" onChange={() => {}} />)).not.toContain("无需填写动作");
    });
});
