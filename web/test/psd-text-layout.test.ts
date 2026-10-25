import { expect, test } from "bun:test";
import { psdTextPixels, updatePsdTextLayout } from "@/lib/psd-text-layout";
import { validateNativeTextLayers, type NativeTextLayer } from "@/lib/psd-layer-contract";

const line: NativeTextLayer = { text: "原文", bbox: [100, 200, 600, 400], fontSize: 40, color: "#123456", bold: true, align: "left", rotation: 0 };
const canvas = { width: 1000, height: 2000 };
test("text settings convert original pixel dimensions into the existing normalized PSD contract", () => {
    expect(psdTextPixels(line, canvas)).toEqual({ x: 100, y: 400, width: 500, height: 400, fontSizePx: 80 });
    const next = updatePsdTextLayout(line, canvas, { fontSizePx: 60, text: "新文案\n第二行", color: "#ABCDEF", bold: false, align: "center", rotation: 20 });
    expect(next).toEqual({ ...line, text: "新文案\n第二行", fontSize: 30, color: "#ABCDEF", bold: false, align: "center", rotation: 20 });
    expect(validateNativeTextLayers([next])).toEqual([next]);
    expect(line.text).toBe("原文");
});
test("moving keeps text box size and resizing stays inside the image", () => {
    const moved = updatePsdTextLayout(line, canvas, { x: 900, y: -20 });
    expect(psdTextPixels(moved, canvas)).toEqual({ x: 500, y: 0, width: 500, height: 400, fontSizePx: 80 });
    const resized = updatePsdTextLayout(moved, canvas, { width: 9000, height: 9000 });
    expect(resized.bbox).toEqual([500, 0, 1000, 1000]);
    const minimum = updatePsdTextLayout(line, canvas, { width: 0, height: -10, rotation: 500, fontSizePx: 9000 });
    expect(psdTextPixels(minimum, canvas).width).toBeCloseTo(1);
    expect(psdTextPixels(minimum, canvas).height).toBeCloseTo(1);
    expect(minimum.rotation).toBe(180);
    expect(minimum.fontSize).toBe(300);
    expect(() => validateNativeTextLayers([minimum])).not.toThrow();
});
test("clearing a text draft remains editable and final validation rejects it", () => {
    const draft = updatePsdTextLayout(line, canvas, { text: "" });
    expect(draft.text).toBe("");
    expect(draft.bbox).toEqual(line.bbox);
    expect(() => validateNativeTextLayers([draft])).toThrow();
});
