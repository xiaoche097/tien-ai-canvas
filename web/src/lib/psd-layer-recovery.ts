import type { GenerationTask } from "@/services/api/task-center";
import type { ImageLayerExtraction } from "@/lib/canvas/canvas-image-layer-strategy";
import { parsePsdLayerSource, psdLayerSourceMatches, type PsdLayerSource } from "@/lib/psd-layer-contract";

export type PsdRecoveryBatch = { id: string; createdAt: string; plan: GenerationTask; ocr: GenerationTask; images: GenerationTask[]; legacy: boolean };
export function psdTaskMetadata(task: GenerationTask): Record<string, unknown> {
    try { return JSON.parse(task.inputJson || "{}").metadata || {}; } catch { return {}; }
}
export function psdTaskImages(task: GenerationTask) {
    try {
        const images = JSON.parse(task.resultJson || "{}").images;
        if (!Array.isArray(images) || images.length > 8) return [];
        if (!images.every((image) => image && typeof image.dataUrl === "string" && (image.dataUrl || (typeof image.storageKey === "string" && image.storageKey)))) return [];
        return images as Array<{ dataUrl: string; storageKey?: string }>;
    } catch { return []; }
}
const created = (task: GenerationTask) => Date.parse(task.createdAt || task.created_at || "");

/** Old tasks have no batch ID: offer only unambiguous time groups for explicit user confirmation. */
export function psdRecoveryBatches(tasks: GenerationTask[], source?: PsdLayerSource): PsdRecoveryBatch[] {
    const ready = tasks.filter((task) => task.status === "succeeded" && task.resultJson && Number.isFinite(created(task)));
    const boundaries = tasks.filter((task) => psdTaskMetadata(task).edit === "psd-layer-plan" && Number.isFinite(created(task))).sort((a, b) => created(a) - created(b));
    const plans = ready.filter((task) => psdTaskMetadata(task).edit === "psd-layer-plan").sort((a, b) => created(a) - created(b));
    return plans.flatMap((plan) => {
        const binding = psdTaskMetadata(plan).psdSource;
        if (binding !== undefined && (!source || !psdLayerSourceMatches(binding, source))) return [];
        const batchId = psdTaskMetadata(plan).psdBatchId;
        if (batchId && plans.filter((candidate) => psdTaskMetadata(candidate).psdBatchId === batchId).length !== 1) return [];
        const sameBatch = (task: GenerationTask) => batchId ? psdTaskMetadata(task).psdBatchId === batchId : !psdTaskMetadata(task).psdBatchId;
        const ocr = ready.filter((task) => sameBatch(task) && psdTaskMetadata(task).edit === "psd-native-text-layout" && (batchId || Math.abs(created(task) - created(plan)) <= 10_000));
        if (ocr.length !== 1) return [];
        const nextPlan = boundaries.find((candidate) => created(candidate) > created(plan));
        const end = Math.min(nextPlan ? created(nextPlan) : Infinity, created(plan) + 3_600_000);
        const images = ready.filter((task) => {
            const edit = psdTaskMetadata(task).edit;
            return sameBatch(task) && psdTaskImages(task).length > 0 && (edit === "psd-layer-extraction" || edit === "psd-layer-decomposition") && (batchId || (created(task) >= created(plan) && created(task) < end));
        });
        if (!images.length) return [];
        return [{ id: plan.id, createdAt: plan.createdAt, plan, ocr: ocr[0], images, legacy: !batchId }];
    }).reverse();
}

/** Null means reproduce an existing local extraction, never create a paid task. */
export function psdRecoveryImages(batch: PsdRecoveryBatch, methods: ImageLayerExtraction["method"][]) {
    if (!methods.length || methods.length > 8) throw new Error("恢复图层数量无效");
    const batchId = psdTaskMetadata(batch.plan).psdBatchId;
    if ([batch.plan, batch.ocr, ...batch.images].some((task) => task.status !== "succeeded" || psdTaskMetadata(task).psdBatchId !== batchId)) throw new Error("恢复任务未完成或混入其他批次");
    const source = psdTaskMetadata(batch.plan).psdSource;
    if (source !== undefined) parsePsdLayerSource(source);
    if ([batch.ocr, ...batch.images].some((task) => source === undefined ? psdTaskMetadata(task).psdSource !== undefined : !psdLayerSourceMatches(psdTaskMetadata(task).psdSource, source as PsdLayerSource))) throw new Error("恢复任务混入其他商品模块或精修版本");
    const dedicated = batch.images.filter((task) => psdTaskMetadata(task).edit === "psd-layer-decomposition");
    if (dedicated.length) {
        if (dedicated.length !== 1 || batch.images.length !== 1) throw new Error("恢复批次存在多个拆层结果，未自动合并");
        const images = psdTaskImages(dedicated[0]);
        if (images.length !== methods.length) throw new Error("已有图层数量与规划不一致，未组装 PSD");
        return images;
    }
    if (batch.images.some((task) => {
        const metadata = psdTaskMetadata(task), index = metadata.layerIndex;
        return metadata.edit !== "psd-layer-extraction" || !Number.isInteger(index) || (index as number) < 0 || (index as number) >= methods.length || (metadata.layerStage !== undefined && metadata.layerStage !== "extract" && metadata.layerStage !== "remove-background");
    })) throw new Error("已有任务包含无效的图层编号或阶段");
    return methods.map((method, index) => {
        const candidates = batch.images.filter((task) => psdTaskMetadata(task).layerIndex === index);
        if (method !== "generate") {
            if (candidates.length) throw new Error(`第 ${index + 1} 层的本地提取计划与模型结果冲突`);
            return null;
        }
        const removal = candidates.filter((task) => psdTaskMetadata(task).layerStage === "remove-background");
        const extraction = candidates.filter((task) => psdTaskMetadata(task).layerStage === "extract");
        const selected = candidates.length === 2 && removal.length === 1 && extraction.length === 1 ? removal[0] : candidates.length === 1 ? candidates[0] : undefined;
        if (!selected) throw new Error(`第 ${index + 1} 层任务缺失或存在多个候选，未自动合并；请保留已有素材`);
        const images = psdTaskImages(selected);
        if (images.length !== 1) throw new Error("已有任务没有返回单张独立图层");
        return images[0];
    });
}
