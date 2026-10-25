import { expect, test } from "bun:test";
import { verifyRoundtrip, type VerificationStep } from "./roundtrip-verification";
import type { DocumentInfo, Format } from "./photopea-bridge";

function sourcePng() {
    const bytes = new Uint8Array(24); bytes.set([137, 80, 78, 71, 13, 10, 26, 10]); return bytes.buffer;
}
// These doubles test the verifier's failure decisions, not real Photopea or PSD parsing.
function editorFixture(loseEdits: boolean) {
    let opens = 0;
    let exports = 0;
    const doc = (text: string[] = []): DocumentInfo => ({ name: "sample.psd", width: 900, height: 1100, layers: text.length ? 2 : 1, text });
    return {
        open: async () => { opens++; return doc(opens === 1 ? [] : [opens === 2 || loseEdits ? "PSD ROUNDTRIP" : "PSD EDIT VERIFIED"]); },
        addTestText: async () => doc(["PSD ROUNDTRIP"]),
        updateTestText: async () => doc(["PSD EDIT VERIFIED"]),
        export: async (format: Format) => {
            if (format !== "psd") return new ArrayBuffer(3);
            const bytes = new Uint8Array(26); bytes.set([56, 66, 80, 83, 0, 1]); bytes[25] = ++exports; return bytes.buffer;
        },
    };
}

test("does not pass when a second PSD export drops an in-memory text edit", async () => {
    const artifacts: string[] = [];
    const updates: VerificationStep[][] = [];
    const { report } = await verifyRoundtrip(editorFixture(true), sourcePng(), (steps) => updates.push(steps), (_, __, name) => artifacts.push(name));
    expect(report.status).toBe("failed");
    expect(report.steps.length).toBe(7);
    expect(report.steps[6].status).toBe("failed");
    expect(report.steps[6].error).toContain("文字图层");
    expect(artifacts).toEqual(["phase0-source.png", "phase0-original.psd", "phase0-edited.psd"]);
    expect(report.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
    expect(updates[0][0].status).toBe("running");
    expect(updates.at(-1)?.[6].status).toBe("failed");
});

test("stops at wrong imported dimensions without exporting PSD", async () => {
    const editor = editorFixture(false);
    editor.open = async () => ({ name: "wrong.png", width: 1, height: 1, layers: 1, text: [] });
    const { report } = await verifyRoundtrip(editor, sourcePng(), () => {}, () => {});
    expect(report.status).toBe("failed");
    expect(report.steps.length).toBe(1);
    expect(report.steps[0].error).toContain("尺寸");
    expect(report.files.map((file) => file.name)).toEqual(["phase0-source.png"]);
});

test("does not retain corrupt raster output or report later checks as passed", async () => {
    const artifacts: string[] = [];
    const { report } = await verifyRoundtrip(editorFixture(false), sourcePng(), () => {}, (_, __, name) => artifacts.push(name));
    expect(report.status).toBe("failed");
    expect(report.steps.length).toBe(8);
    expect(report.steps[6].status).toBe("passed");
    expect(report.steps[7].status).toBe("failed");
    expect(artifacts.some((name) => name === "phase0-result.png")).toBe(false);
    expect(report.finishedAt).toBeDefined();
    expect(report.scope).toBe("controlled-sample-only");
});
