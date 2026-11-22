import { expect, test } from "bun:test";
import { preparePsdImageLayers } from "@/lib/canvas/psd-layer-plan";
import type { ImageLayerPlan } from "@/lib/canvas/canvas-image-layer-plan";
import type { NativeTextLayer } from "@/lib/psd-layer-contract";
const text: NativeTextLayer = { text: "商品标题", bbox: [50,50,500,200], fontSize: 40, color: "#112233", bold: true, align: "left", rotation: 0 };
const plan: ImageLayerPlan = { layers: [
  { name: "背景", description: "原背景", kind: "background", generation: { prompt: "移除商品后补全背景", background: "opaque" } },
  { name: "商品", description: "商品主体", kind: "object", editUnit: "object", generation: { prompt: "提取商品", background: "transparent" } },
  { name: "标题", description: "排版文案", kind: "object", editUnit: "text", generation: { prompt: "提取文字", background: "transparent" } },
] };
test("PSD keeps canvas image planning but replaces raster text with native text", () => {
  const images = preparePsdImageLayers(plan, [text]);
  expect(images.map((layer) => layer.name)).toEqual(["背景", "商品"]);
  expect(images[0].generation.prompt).toContain("alpha=255");
  expect(images[1].generation.prompt).toContain("alpha=0");
  expect(images.every((layer) => layer.generation.prompt.includes("排版文案随后会作为原生文本层"))).toBe(true);
  expect(plan.layers).toHaveLength(3);
  expect(() => preparePsdImageLayers(plan, [])).toThrow("原生文字识别为空");
});
test("source-region containing text cannot silently duplicate old lettering", () => {
  const region = { ...plan.layers[1], extraction: { method: "source-region" as const, region: { shape: "rect" as const, bbox: [0,0,1000,1000] as [number,number,number,number] } } };
  expect(() => preparePsdImageLayers({ layers: [plan.layers[0], region] }, [text])).toThrow("叠字");
  expect(preparePsdImageLayers({ layers: [plan.layers[0], { ...region, extraction: { ...region.extraction, region: { shape: "rect", bbox: [600,400,950,900] } } }] }, [text])).toHaveLength(2);
});
