import type { CanvasImageLayerDecompositionPayload } from "@/components/canvas/canvas-node-layer-decomposition-dialog";
import { applyImageLayerPlanningPurpose, imageLayerPlanningPrompt, imageLayerPlannerError, imageLayerOutputSize, imageLayerPlanTargets, parseImageLayerPlan } from "@/lib/canvas/canvas-image-layer-plan";
import { imageLayerProviderMetadata, layerDecompositionConfig, supportsExperimentalLayerExtraction, supportsLayerDecomposition, validateImageLayerRole } from "@/lib/canvas/canvas-image-layers";
import { preparePsdImageLayers } from "@/lib/canvas/psd-layer-plan";
import { modelCapabilityConfigFor } from "@/lib/model-capabilities";
import { resolveImageRequestSize } from "@/services/api/image-validation";
import { defaultImageParamsForModel } from "@/lib/model-selection";
import { parseNativeTextLayers, parsePsdLayerSource, psdLayerSourceMatches, type PsdLayerSource, type NativeTextLayer, type PsdLayerBundle, validatePsdLayerBundle } from "@/lib/psd-layer-contract";
import { parseBackendGenerationResult, runBackendGenerationTask } from "@/services/api/generation-task";
import { psdRecoveryImages, psdTaskMetadata, type PsdRecoveryBatch } from "@/lib/psd-layer-recovery";
import { decodeLayer, normalizeImageLayerCanvas, pngBlob, type LayerInput } from "@/services/canvas-image-layer-compositor";
import { runImageLayerExtraction } from "@/services/canvas-image-layer-extraction";
import { prepareImageLayerPlanningReference } from "@/services/canvas-image-layer-planning";
import { calibrateImageLayerPlan, extractImageLayerFromSource } from "@/services/canvas-image-layer-source";
import { useConfigStore, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

export type PsdLayerResult = { bundle: PsdLayerBundle; blobs: Blob[] };
const OCR_PROMPT = `读取参考图中叠加排版的全部文案，逐段输出可编辑文本框；不读取印在商品实物上的品牌、标签或纹理文字，不臆造被遮挡内容。只输出 JSON：{"canRead":true,"coordinateSpace":"normalized_1000","lines":[{"text":"原文，保留换行","bbox":[左,上,右,下],"fontSize":字号占整图高度的千分比,"color":"#RRGGBB","bold":true或false,"align":"left或center或right","rotation":角度}]}。bbox 为整图0–1000坐标，必须覆盖完整文字；每段独立，最多80段。字号、颜色、位置据图估计，禁止写执行代码。没有叠加文字时 lines=[]；无法看图时 canRead=false。`;

function configured(config: AiConfig, model: string) {
  if (!useConfigStore.getState().isAiConfigReady(config, model)) throw new Error("所选模型未配置可用渠道");
}
function sized(config: AiConfig, model: string, canvas: { width: number; height: number }, quality?: AiConfig["quality"]) {
  const next = layerDecompositionConfig({ ...config, ...defaultImageParamsForModel(config, model) }, model);
  if (quality) next.quality = quality;
  const size = imageLayerOutputSize(next, model, canvas);
  if (!size) throw new Error("所选模型没有支持原图比例的尺寸");
  const profile = modelCapabilityConfigFor(next, model).image;
  next.size = profile ? resolveImageRequestSize(profile, next.quality, size)?.value || "auto" : size;
  configured(next, model); return next;
}

/** Reuse canvas planning, task billing, extraction and alpha checks; no canvas store writes. */
export async function runPsdLayerWorkflow(source: ReferenceImage, payload: CanvasImageLayerDecompositionPayload, config: AiConfig, signal: AbortSignal, assertActive: () => void, progress: (message: string) => void, partial: (index: number, name: string, blob: Blob) => void, binding: PsdLayerSource): Promise<PsdLayerResult> {
  const check = () => { signal.throwIfAborted(); assertActive(); };
  check();
  const psdBatchId = crypto.randomUUID();
  const psdSource = parsePsdLayerSource(binding);
  const planner = { ...config, model: payload.plannerModel, textModel: payload.plannerModel, taskWorkflowProvider: "model" as const };
  const error = imageLayerPlannerError(planner, payload.plannerModel); if (error) throw new Error(error);
  configured(planner, payload.plannerModel);
  const { reference, sourceSize } = await prepareImageLayerPlanningReference(source, "original", signal);
  const model = payload.generationConfig?.model || config.imageModel || config.model;
  const imageConfig = sized(config, model, sourceSize, payload.generationConfig?.quality);
  if (!supportsLayerDecomposition(imageConfig, model) && !supportsExperimentalLayerExtraction(imageConfig, model)) throw new Error("请选择画布中可用的拆层或参考图编辑模型");
  check();
  progress("正在复用画布识图规划，并识别原生文字位置（两次文字模型调用）…");
  const tasks: Parameters<typeof runBackendGenerationTask>[0] = { mode: "text", prompt: "", config: planner, referenceImages: [reference], signal, metadata: { edit: "psd-layer-plan", psdBatchId, psdSource } };
  const [planning, ocr] = await Promise.all([
    runBackendGenerationTask({ ...tasks, prompt: imageLayerPlanningPrompt(`${payload.prompt}\n叠加文字将单独变成原生文本层，不要将其合并进商品对象；背景与各独立素材须去除叠加文案。`, sourceSize, "recompose") }),
    runBackendGenerationTask({ ...tasks, prompt: OCR_PROMPT, metadata: { edit: "psd-native-text-layout", psdBatchId, psdSource } }),
  ]);
  check();
  const texts = parseNativeTextLayers(ocr.text || "");
  const plan = await calibrateImageLayerPlan(source, applyImageLayerPlanningPurpose(parseImageLayerPlan(planning.text || "", sourceSize), "recompose"));
  const layers = preparePsdImageLayers(plan, texts);
  check();
  const outputs: Array<Awaited<ReturnType<typeof normalizeImageLayerCanvas>>["image"] | undefined> = [];
  const collect = async (index: number, image: LayerInput) => {
    check(); const normalized = await normalizeImageLayerCanvas(image, sourceSize); outputs[index] = normalized.image;
    const decoded = await decodeLayer(normalized.image);
    try { partial(index, layers[index].name, decoded.blob); } finally { decoded.bitmap.close(); }
  };
  const runStage: Parameters<typeof runImageLayerExtraction>[0]["runStage"] = async ({ index, stage, prompt, config: selected, reference: input }) => {
    check(); progress(`正在处理 ${layers[index].name} · ${stage === "extract" ? "提取" : "透明背景"}…`);
    const result = await runBackendGenerationTask({ mode: "image", prompt, config: selected, referenceImages: [input], signal, metadata: { edit: "psd-layer-extraction", psdBatchId, psdSource, layerStage: stage, layerIndex: index, ...imageLayerProviderMetadata(selected, index) } });
    check(); if (result.images?.length === 1) await collect(index, result.images[0]); return result;
  };
  if (supportsLayerDecomposition(imageConfig, model)) {
    const result = await runBackendGenerationTask({ mode: "image", prompt: `${payload.prompt}\n按顺序输出这些图层，不输出任何叠加排版文字：${JSON.stringify(layers)}`, config: imageConfig, referenceImages: [source], signal, metadata: { edit: "psd-layer-decomposition", psdBatchId, psdSource } });
    check(); if (result.images?.length !== layers.length) throw new Error("专用拆层结果数量与已确认计划不一致，未组装 PSD");
    for (let i = 0; i < layers.length; i++) await collect(i, result.images[i]);
  } else if (layers.length === 1) {
    await runStage({ index: 0, stage: "extract", prompt: layers[0].generation.prompt, config: { ...imageConfig, transparentBackground: "false" }, reference: source, canvas: sourceSize });
  } else {
    const removalConfig = payload.backgroundRemovalModel ? sized(config, payload.backgroundRemovalModel, sourceSize) : undefined;
    await runImageLayerExtraction({ source, targets: imageLayerPlanTargets({ ...plan, layers }), generations: layers.map((layer) => layer.generation), extractions: layers.map((layer) => layer.extraction || { method: "generate" }), removeFromBackground: layers.map((_, i) => i > 0), config: imageConfig, removalConfig, signal, assertActive: check, runStage, onLocalResult: collect });
  }
  check(); progress("正在验证透明度与完整背景，准备原生文本图层…");
  if (outputs.length !== layers.length || layers.some((_, index) => !outputs[index])) throw new Error("拆层结果尚未完整，未组装 PSD");
  return finishPsdLayers(outputs as LayerInput[], layers.map((layer) => layer.name), texts, sourceSize, check);
}

async function finishPsdLayers(images: LayerInput[], names: string[], texts: NativeTextLayer[], sourceSize: { width: number; height: number }, check: () => void, partial?: (index: number, name: string, blob: Blob) => void): Promise<PsdLayerResult> {
  const blobs: Blob[] = [], rasters: PsdLayerBundle["rasters"] = [];
  for (let index = 0; index < images.length; index++) {
    check();
    const normalized = await normalizeImageLayerCanvas(images[index], sourceSize);
    const decoded = await decodeLayer(normalized.image);
    try {
      validateImageLayerRole(decoded.info, index);
      const canvas = document.createElement("canvas"); canvas.width = sourceSize.width; canvas.height = sourceSize.height;
      try { const context = canvas.getContext("2d"); if (!context) throw new Error("浏览器不支持 PNG 图层导出"); context.drawImage(decoded.bitmap, 0, 0); const blob = await pngBlob(canvas); check(); partial?.(index, names[index], blob); blobs.push(blob); rasters.push({ name: names[index], buffer: await blob.arrayBuffer() }); }
      finally { canvas.width = canvas.height = 0; }
    } finally { decoded.bitmap.close(); }
  }
  check(); const bundle: PsdLayerBundle = { version: 1, ...sourceSize, rasters, texts: texts as NativeTextLayer[] }; validatePsdLayerBundle(bundle);
  return { bundle, blobs };
}

/** Reads completed tasks only; never submits, retries or bills a model request. */
export async function recoverPsdLayerWorkflow(source: ReferenceImage, batch: PsdRecoveryBatch, signal: AbortSignal, assertActive: () => void, partial: (index: number, name: string, blob: Blob) => void, binding: PsdLayerSource) {
  const check = () => { signal.throwIfAborted(); assertActive(); };
  check();
  parsePsdLayerSource(binding);
  const storedSource = psdTaskMetadata(batch.plan).psdSource;
  if (storedSource !== undefined && !psdLayerSourceMatches(storedSource, binding)) throw new Error("所选批次属于其他商品模块或精修版本，未读取图层");
  const sourceSize = { width: source.width!, height: source.height! };
  const texts = parseNativeTextLayers(parseBackendGenerationResult(batch.ocr).text || "");
  const rawPlan = parseBackendGenerationResult(batch.plan).text || "";
  const rawSize = JSON.parse(rawPlan.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")).imageSize;
  if (rawSize && (rawSize.width !== sourceSize.width || rawSize.height !== sourceSize.height)) throw new Error("所选批次的原图尺寸与当前文档不同，请选择正确批次");
  const plan = await calibrateImageLayerPlan(source, applyImageLayerPlanningPurpose(parseImageLayerPlan(rawPlan, sourceSize), "recompose"));
  const layers = preparePsdImageLayers(plan, texts);
  const stored = psdRecoveryImages(batch, layers.map((layer) => layer.extraction?.method || "generate"));
  const images: LayerInput[] = [];
  for (let index = 0; index < stored.length; index++) {
    check();
    images.push(stored[index] || await extractImageLayerFromSource(source, layers[index].extraction!, sourceSize));
  }
  return finishPsdLayers(images, layers.map((layer) => layer.name), texts, sourceSize, check, partial);
}
