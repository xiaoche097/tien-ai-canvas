import type { NativeTextLayer } from "@/lib/psd-layer-contract";

type TextLayoutPatch = Partial<Pick<NativeTextLayer, "text" | "color" | "bold" | "align" | "rotation">> & { fontSizePx?: number; x?: number; y?: number; width?: number; height?: number };
export function psdTextPixels(line: NativeTextLayer, canvas: { width: number; height: number }) {
    return { x: line.bbox[0] * canvas.width / 1000, y: line.bbox[1] * canvas.height / 1000,
        width: (line.bbox[2] - line.bbox[0]) * canvas.width / 1000, height: (line.bbox[3] - line.bbox[1]) * canvas.height / 1000, fontSizePx: line.fontSize * canvas.height / 1000 };
}

/** UI uses pixels; PSD text contracts use normalized coordinates. Moving keeps box size. */
export function updatePsdTextLayout(line: NativeTextLayer, canvas: { width: number; height: number }, patch: TextLayoutPatch): NativeTextLayer {
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    const pixel = psdTextPixels(line, canvas);
    const x = patch.x === undefined ? pixel.x : clamp(patch.x, 0, canvas.width - pixel.width);
    const y = patch.y === undefined ? pixel.y : clamp(patch.y, 0, canvas.height - pixel.height);
    const width = patch.width === undefined ? pixel.width : clamp(patch.width, 1, canvas.width - x);
    const height = patch.height === undefined ? pixel.height : clamp(patch.height, 1, canvas.height - y);
    return { ...line, ...(patch.text !== undefined ? { text: patch.text } : {}), ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.bold !== undefined ? { bold: patch.bold } : {}), ...(patch.align !== undefined ? { align: patch.align } : {}),
        rotation: patch.rotation === undefined ? line.rotation : clamp(patch.rotation, -180, 180),
        fontSize: patch.fontSizePx === undefined ? line.fontSize : clamp(patch.fontSizePx / canvas.height * 1000, 1, 300),
        bbox: [patch.x, patch.y, patch.width, patch.height].every((value) => value === undefined) ? [...line.bbox] : [x / canvas.width * 1000, y / canvas.height * 1000, Math.min(1000, (x + width) / canvas.width * 1000), Math.min(1000, (y + height) / canvas.height * 1000)] };
}
