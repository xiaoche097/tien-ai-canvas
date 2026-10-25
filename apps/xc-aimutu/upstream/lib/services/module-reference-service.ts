import { Prisma } from "@prisma/client";
import sharp from "sharp";
import { prisma } from "@/lib/db/prisma";
import { getProviderAdapter } from "./provider-service";
import { checkAndDeductCredits, refundCredits } from "./credit-service";
import { completeTask, failTask } from "./task-service";
import { assetPublicUrl, readStorageFile, saveGeneratedImage } from "@/lib/storage/asset-manager";
import { loadEcommercePromptTemplates } from "@/lib/canvas/prompt-templates";
import { isModuleReference, referenceMetadata, referenceShotsSchema, referencePlanPrompt, referenceImagePrompt, referenceShotKey, reusableReference, type referenceActionSchema } from "@/lib/ai/module-reference";
import type { z } from "zod";

export async function moduleReferenceState(projectId: string, sectionId: string) {
  const section = await prisma.pageSection.findFirst({ where: { id: sectionId, projectId }, select: { id: true } });
  if (!section) throw new Error("Module not found");
  const [tasks, assets] = await Promise.all([
    prisma.generationTask.findMany({ where: { projectId, id: { startsWith: "mref" } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.productAsset.findMany({ where: { projectId, type: "GENERATED" }, orderBy: { createdAt: "desc" } }),
  ]);
  return { tasks: tasks.filter(task => (task.inputPayload as Record<string, unknown> | null)?.referenceSectionId === sectionId || (task.status === "RUNNING" && (task.inputPayload as Record<string, unknown> | null)?.operation === "module_reference_generate")), assets: assets.filter(isModuleReference).map(asset => ({ ...asset, url: assetPublicUrl(asset) })) };
}

export async function runModuleReference(projectId: string, sectionId: string, input: z.infer<typeof referenceActionSchema>, accessKey?: string | null) {
  const section = await prisma.pageSection.findFirst({ where: { id: sectionId, projectId }, include: { project: true } });
  if (!section) throw new Error("Module not found");
  if (input.action === "approve") {
    const asset = await prisma.productAsset.findFirst({ where: { id: input.assetId, projectId } });
    if (!asset || !isModuleReference(asset)) throw new Error("Reference image not found");
    const updated = await prisma.productAsset.update({ where: { id: asset.id }, data: { metadata: { ...referenceMetadata(asset), referenceApproved: true, referenceScope: "project" } as Prisma.InputJsonValue } });
    return { asset: { ...updated, url: assetPublicUrl(updated) } };
  }

  let plan: Awaited<ReturnType<typeof prisma.generationTask.findFirst>> = null;
  if (input.action === "generate") {
    plan = await prisma.generationTask.findFirst({ where: { id: input.planId, projectId, status: "SUCCESS", taskType: "PLAN" } });
    if (!plan || (plan.inputPayload as Record<string, unknown>)?.referenceSectionId !== sectionId || (plan.inputPayload as Record<string, unknown>)?.operation !== "module_reference_plan") throw new Error("Reference plan not found");
  }
  const planInput = plan?.inputPayload as Record<string, unknown> | undefined;
  const sourceId = input.action === "plan" ? input.sourceAssetId : String(planInput?.sourceAssetId ?? "");
  const source = await prisma.productAsset.findFirst({ where: { id: sourceId, projectId, type: { in: ["MAIN", "ANGLE", "DETAIL", "REFERENCE"] } } });
  if (!source || isModuleReference(source)) throw new Error("请选择同一款产品的原始图片，不能用 AI 参考图继续推演。");
  const shot = input.action === "generate" ? referenceShotsSchema.parse(plan?.outputPayload).shots[input.shotIndex] : null;
  if (input.action === "generate" && !shot) throw new Error("Reference shot not found");
  const taskId = `${input.action === "plan" ? "mrefplan" : "mrefimage"}_${input.requestId}`;
  const referenceKey = shot ? referenceShotKey(source.id, shot) : null;
  const taskInput = { ...input, operation: `module_reference_${input.action}`, referenceSectionId: sectionId, sourceAssetId: source.id, referenceKey };
  const existing = await prisma.generationTask.findFirst({ where: { id: taskId, projectId } });
  if (existing) {
    if (JSON.stringify(existing.inputPayload) !== JSON.stringify(taskInput)) throw new Error("请求标识已使用，请重新操作。");
    return { task: existing };
  }
  try {
    const reused = await prisma.$transaction(async transaction => {
      if (shot) {
        const assets = await transaction.productAsset.findMany({ where: { projectId, type: "GENERATED" }, orderBy: { createdAt: "desc" } });
        const asset = reusableReference(assets, source.id, shot);
        if (shot.reuseAssetId && !asset) throw new Error("方案指定的可复用图片已不可用，请重新识别；未重新生成或计费。");
        if (asset && !(input.action === "generate" && input.force)) return { asset: { ...asset, url: assetPublicUrl(asset) }, reused: true };
        const running = await transaction.generationTask.findMany({ where: { projectId, status: "RUNNING", id: { startsWith: "mrefimage_" } } });
        const task = running.find(item => (item.inputPayload as Record<string, unknown> | null)?.referenceKey === referenceKey);
        if (task) return { task, pending: true };
      }
      await transaction.generationTask.create({ data: { id: taskId, projectId, taskType: input.action === "plan" ? "PLAN" : "GENERATE", status: "RUNNING", startedAt: new Date(), inputPayload: taskInput as Prisma.InputJsonValue } });
      return null;
    });
    if (reused) return reused;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const task = await prisma.generationTask.findFirst({ where: { id: taskId, projectId } });
    if (!task || JSON.stringify(task.inputPayload) !== JSON.stringify(taskInput)) throw new Error("请求标识已使用，请重新操作。");
    return { task };
  }
  let charged = false;
  try {
    const templates = await loadEcommercePromptTemplates();
    const snapshot = section.project.modelSnapshot as Record<string, unknown> | null;
    const facts = { name: section.project.name, description: section.project.description, category: snapshot?.category, sellingPoints: snapshot?.sellingPoints, targetAudience: snapshot?.targetAudience };
    if (input.action === "plan") {
      const { provider, adapter } = await getProviderAdapter("text");
      const model = provider.models.find(item => item.isDefaultPlanning && item.capabilities.text);
      if (!model) throw new Error("请先配置文案规划模型。");
      if (accessKey) { await checkAndDeductCredits(accessKey); charged = true; }
      const inventory = (await prisma.productAsset.findMany({ where: { projectId, type: "GENERATED" }, orderBy: { createdAt: "desc" } })).filter(asset => isModuleReference(asset) && referenceMetadata(asset).sourceAssetId === source.id);
      const result = await adapter.generateStructured({ model: model.modelId, userPrompt: referencePlanPrompt({ product: facts, module: input.draft, availableReferences: inventory.map(asset => ({ id: asset.id, shot: referenceMetadata(asset).referenceShot })) }, templates) + "\nREUSE CONTRACT: Avoid generating duplicate viewpoints. If an availableReference already covers a requested view AND the same physical part, set that shot's optional reuseAssetId to its EXACT id and retain its existing kind, view and target wording. Never invent an id or match different parts/angles. Use null or omit reuseAssetId if no existing image covers it. Do not request multiple equivalent shots within this plan.", schema: referenceShotsSchema, monitor: { projectId, sectionId, operation: "module_reference_plan" } });
      const parsed = referenceShotsSchema.parse(result.parsed);
      for (const shot of parsed.shots) if (shot.reuseAssetId && !inventory.some(asset => asset.id === shot.reuseAssetId)) throw new Error("识别返回了无效的复用图片标识，未调用图片生成。");
      await completeTask(taskId, parsed);
    } else {
      const { provider, adapter } = await getProviderAdapter("image");
      const model = provider.models.find(item => item.isDefaultImageEdit && item.capabilities.image_edit && item.capabilities.real_image_edit !== false);
      if (!model) throw new Error("请先在 AI 配置中选择支持图片编辑的模型。");
      const bytes = await sharp(await readStorageFile(source.filePath)).rotate().png().toBuffer();
      const prompt = referenceImagePrompt(shot!, facts, templates);
      if (accessKey) { await checkAndDeductCredits(accessKey); charged = true; }
      const result = await adapter.editImage({ model: model.modelId, prompt, image: `data:image/png;base64,${bytes.toString("base64")}`, aspectRatio: "1:1", size: "1024x1024", monitor: { projectId, sectionId, operation: "module_reference_image" } });
      const asset = await saveGeneratedImage({ projectId, sectionId, prompt, source: result, metadata: { purpose: "module_reference", referenceScope: "project", referenceApproved: false, sourceAssetId: source.id, referenceKey, referencePlanId: plan!.id, referenceShotIndex: input.shotIndex, referenceShot: shot, model: model.modelId, referenceTaskId: taskId } });
      await completeTask(taskId, { assetId: asset.id });
    }
    return { task: await prisma.generationTask.findUnique({ where: { id: taskId } }) };
  } catch (error) {
    if (charged && accessKey) await refundCredits(accessKey);
    await failTask(taskId, error instanceof Error ? error.message : "参考图任务失败");
    throw error;
  }
}
