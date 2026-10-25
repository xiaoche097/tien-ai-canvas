import type { ImageLayerPlan } from "./canvas-image-layer-plan";
import { experimentalLayerPrompt, parseImageLayerGeneration } from "./canvas-image-layers";
import type { NativeTextLayer } from "@/lib/psd-layer-contract";

export function preparePsdImageLayers(plan: ImageLayerPlan, texts: NativeTextLayer[]) {
  if (!texts.length && plan.layers.some((layer, i) => i > 0 && layer.editUnit === "text")) throw new Error("规划识别到文案，但原生文字识别为空；请核对模型，未开始生成图片");
  const layers = plan.layers.filter((layer, index) => index === 0 || layer.editUnit !== "text");
  if (layers.length + texts.length < 2) throw new Error("没有足够的独立图层，未开始生成图片");
  const removal = texts.length ? "\n本层必须移除原图中叠加排版的文案并修补，不能留下文字残影，不能重新绘制文案；印在商品实物上的品牌、标签和纹理文字保留。排版文案随后会作为原生文本层单独恢复。" : "";
  return layers.map((layer, index) => {
    if (index > 0 && layer.extraction?.method === "source-region" && texts.some((line) => { const b = layer.extraction?.region?.bbox; return b && Math.min(b[2], line.bbox[2]) > Math.max(b[0], line.bbox[0]) && Math.min(b[3], line.bbox[3]) > Math.max(b[1], line.bbox[1]); })) throw new Error("原像素提取区域与文案相交，会造成叠字；请调整拆分要求后重新规划");
    const generation = parseImageLayerGeneration({ ...layer.generation, prompt: experimentalLayerPrompt(layer.generation, layer.bbox) + removal }, index);
    return { ...layer, generation };
  });
}
