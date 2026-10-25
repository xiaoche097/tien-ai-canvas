import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { ecommerceDefaultTemplates } from "@/lib/ai/prompts/ecommerce-templates";

test("reference pipeline isolates projects, edits original once, persists candidates and gates approval", async () => {
  const { mock } = require("bun:test");
  const folder = mkdtempSync(join(tmpdir(), "motu-reference-test-"));
  const before = { DATABASE_URL: process.env.DATABASE_URL, CANVAS_INTEGRATION: process.env.CANVAS_INTEGRATION };
  const state = globalThis as any;
  const recovered = state.__stuckTasksRecovered;
  state.__stuckTasksRecovered = true;
  process.env.CANVAS_INTEGRATION = "0";
  process.env.DATABASE_URL = `file:${join(folder, "test.db").replaceAll("\\", "/")}`;
  execFileSync("node", ["scripts/apply-prisma-migrations.cjs"], { env: process.env, stdio: "ignore" });
  const { prisma } = await import("@/lib/db/prisma");
  let textCalls = 0, imageCalls = 0, failImage = false;
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } }).png().toBuffer();
  const edits: any[] = [];
  const detailCalls: any[] = [];
  const planPrompts: string[] = [];
  let signalImageStarted!: () => void, releaseImage!: () => void;
  const imageStarted = new Promise<void>(resolve => { signalImageStarted = resolve; });
  const imageGate = new Promise<void>(resolve => { releaseImage = resolve; });
  mock.module("@/lib/services/provider-service", () => ({ getProviderAdapter: async (purpose: string) => ({
    provider: { models: [{ modelId: purpose, isDefaultPlanning: true, isDefaultImageEdit: true, isDefaultHeroImage: true, isDefaultDetailImage: true, capabilities: { text: true, image_edit: true, real_image_edit: true, image_gen: true, real_image_gen: true } }] },
    adapter: {
      generateStructured: async (input: any) => {
        textCalls++;
        if (input.monitor?.operation === "module_prompt_rewrite") return { parsed: { replacement: "标题置顶，右侧三张圆形特写，保留原六色平铺", copy: "Soft woven nylon · Adjustable fit" } };
        planPrompts.push(input.userPrompt);
        return { parsed: { shots: [{ kind: "detail", title: "磁扣近拍", view: "正面特写", target: "磁扣" }] } };
      },
      editImage: async (input: any) => { imageCalls++; edits.push(input); if (imageCalls === 1) { signalImageStarted(); await imageGate; } if (failImage) throw new Error("模拟编辑失败"); return { b64Json: bytes.toString("base64") }; },
      generateImage: async (input: any) => { detailCalls.push(input); return { b64Json: bytes.toString("base64") }; },
    },
  }) }));
  mock.module("@/lib/canvas/prompt-templates", () => ({ loadEcommercePromptTemplates: async () => ecommerceDefaultTemplates }));
  mock.module("@/lib/canvas/style-prompt", () => ({ ecommerceStylePrompt: async () => "Style fixture" }));
  mock.module("@/lib/storage/asset-manager", () => ({
    readStorageFile: async () => bytes,
    assetPublicUrl: (asset: any) => `/api/assets/${asset.id}`,
    saveGeneratedImage: async (input: any) => prisma.productAsset.create({ data: { projectId: input.projectId, sectionId: input.sectionId, type: "GENERATED", filePath: "test.png", fileName: "test.png", mimeType: "image/png", metadata: input.metadata } }),
  }));
  try {
    const { runModuleReference, moduleReferenceState } = await import("./module-reference-service");
    const project = await prisma.project.create({ data: { name: "测试表带", platform: "amazon", style: "minimal", description: "只售表带" } });
    const other = await prisma.project.create({ data: { name: "其他商品", platform: "amazon", style: "minimal" } });
    const section = await prisma.pageSection.create({ data: { projectId: project.id, sectionKey: "detail", type: "DETAIL_CLOSEUP", title: "扣具", goal: "扣具结构", copy: "磁扣", visualPrompt: "营销排版标题", order: 0 } });
    const source = await prisma.productAsset.create({ data: { projectId: project.id, type: "MAIN", fileName: "source.png", filePath: "source.png", isMain: true } });
    const foreignSource = await prisma.productAsset.create({ data: { projectId: other.id, type: "MAIN", fileName: "other.png", filePath: "other.png", isMain: true } });
    const draft = { type: section.type, title: section.title, goal: section.goal, copy: section.copy, visualPrompt: section.visualPrompt };
    const planInput = { action: "plan" as const, requestId: randomUUID(), sourceAssetId: source.id, draft };
    await assert.rejects(runModuleReference(other.id, section.id, planInput), /not found/);
    assert.equal(textCalls, 0);
    await assert.rejects(runModuleReference(project.id, section.id, { ...planInput, sourceAssetId: foreignSource.id }), /原始图片/);
    assert.equal(textCalls, 0);
    const plan = (await runModuleReference(project.id, section.id, planInput) as any).task;
    await runModuleReference(project.id, section.id, planInput);
    assert.equal(textCalls, 1, "same request id never charges another planning call");
    const request = { action: "generate" as const, requestId: randomUUID(), planId: plan.id, shotIndex: 0 };
    const firstImage = runModuleReference(project.id, section.id, request);
    await imageStarted;
    const inFlightDuplicate = await runModuleReference(project.id, section.id, { ...request, requestId: randomUUID() }) as any;
    assert.equal(inFlightDuplicate.pending, true, "another request cannot charge for the same in-flight view");
    assert.equal(imageCalls, 1);
    assert.equal(await prisma.generationTask.count({ where: { id: { startsWith: "mrefimage_" } } }), 1);
    releaseImage(); await firstImage;
    await runModuleReference(project.id, section.id, request);
    assert.equal(imageCalls, 1, "same request id never repeats image edit");
    assert.equal(edits[0].image, `data:image/png;base64,${bytes.toString("base64")}`);
    assert.equal(edits[0].aspectRatio, "1:1");
    assert.match(edits[0].prompt, /No added descriptions, captions/);
    assert.doesNotMatch(edits[0].prompt, /营销排版标题/);
    const history = await moduleReferenceState(project.id, section.id);
    assert.equal(history.assets.length, 1);
    assert.equal((history.assets[0].metadata as any).referenceApproved, false);
    assert.equal((await prisma.pageSection.findUniqueOrThrow({ where: { id: section.id } })).currentImageAssetId, null);
    assert.equal(await prisma.sectionVersion.count(), 0, "reference generation does not replace detail or PSD history");
    await assert.rejects(runModuleReference(other.id, section.id, { action: "approve", assetId: history.assets[0].id }), /not found/);
    const approved = await runModuleReference(project.id, section.id, { action: "approve", assetId: history.assets[0].id }) as any;
    assert.equal(approved.asset.metadata.referenceApproved, true);
    assert.equal(imageCalls, 1, "approval is free of model calls");
    const { generateSectionImage } = await import("./generation-service");
    await prisma.pageSection.update({ where: { id: section.id }, data: { editableData: { referenceAssetIds: [source.id, approved.asset.id] } } });
    const detail = await generateSectionImage(project.id, section.id);
    assert.equal(detailCalls.length, 1);
    assert.equal(detailCalls[0].referenceImages.length, 2, "detail generation actually receives original and approved angle");
    assert.equal((detail.imageAsset.metadata as any).primaryReferenceAssetId, source.id);
    assert.deepEqual(new Set((detail.imageAsset.metadata as any).sourceReferenceAssetIds), new Set([source.id, approved.asset.id]));
    assert.match(detailCalls[0].prompt, /first reference remains the original product identity anchor/);
    const otherSection = await prisma.pageSection.create({ data: { projectId: project.id, sectionKey: "other", type: "DETAIL_CLOSEUP", title: "其他模块", goal: "其他", copy: "其他", visualPrompt: "其他", order: 1, editableData: { referenceAssetIds: [approved.asset.id] } } });
    await generateSectionImage(project.id, otherSection.id);
    assert.equal(detailCalls.length, 2, "a project-approved global reference is usable in another selected module");
    const otherPlan = (await runModuleReference(project.id, otherSection.id, { ...planInput, requestId: randomUUID() }) as any).task;
    assert.ok(planPrompts[1].includes(approved.asset.id), "the existing planning call sees the reusable project inventory");
    const reused = await runModuleReference(project.id, otherSection.id, { ...request, requestId: randomUUID(), planId: otherPlan.id }) as any;
    assert.equal(reused.reused, true);
    assert.equal(reused.asset.id, approved.asset.id);
    assert.equal(imageCalls, 1, "new module and request id reuse an existing angle without another edit call");
    assert.equal((await moduleReferenceState(project.id, otherSection.id)).assets.length, 1, "generated angle is listed globally, not duplicated");
    await prisma.generationTask.update({ where: { id: otherPlan.id }, data: { outputPayload: { shots: [{ kind: "detail", title: "同角度另一种名称", view: "正面微距近拍", target: "同一个磁吸搭扣", reuseAssetId: approved.asset.id }] } } });
    const semanticReuse = await runModuleReference(project.id, otherSection.id, { ...request, requestId: randomUUID(), planId: otherPlan.id }) as any;
    assert.equal(semanticReuse.asset.id, approved.asset.id);
    assert.equal(imageCalls, 1, "a validated planning reuse id avoids duplicate editing even if the wording changes");
    const { saveModuleRewrite } = await import("./module-rewrite-service");
    const persisted = await prisma.pageSection.findUniqueOrThrow({ where: { id: section.id } });
    const expected = { type: persisted.type, title: persisted.title, goal: persisted.goal, copy: persisted.copy, visualPrompt: persisted.visualPrompt };
    const updates = { copy: "Soft woven nylon · Adjustable fit", visualPrompt: "标题置顶，右侧三张圆形特写，保留原六色平铺" };
    const { NextRequest } = await import("next/server");
    const { POST: previewRewrite } = await import("@/app/api/projects/[id]/sections/[sectionId]/rewrite-prompt/route");
    const { POST: applyRewrite } = await import("@/app/api/projects/[id]/sections/[sectionId]/rewrite-prompt/apply/route");
    const requestFor = (body: unknown) => new NextRequest("http://localhost:3000/motu/api/rewrite", { method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const routeContext = { params: { id: project.id, sectionId: section.id } };
    const previewResponse = await previewRewrite(requestFor({ instruction: "同步改为柔软透气卖点，标题置顶并保留三张圆形特写", target: "both", mode: "module", currentPrompt: persisted.visualPrompt, start: 0, end: persisted.visualPrompt.length, draft: { title: persisted.title, goal: persisted.goal, copy: persisted.copy, visualPrompt: persisted.visualPrompt } }), routeContext);
    assert.equal(previewResponse.status, 200);
    const preview = (await previewResponse.json()).data;
    assert.equal(preview.copy, updates.copy);
    assert.equal(preview.visualPrompt, updates.visualPrompt);
    assert.equal((await prisma.pageSection.findUniqueOrThrow({ where: { id: section.id } })).copy, persisted.copy, "preview alone never persists");
    assert.equal(await saveModuleRewrite(other.id, section.id, { expected, updates }), null, "cannot save across projects");
    await prisma.pageSection.update({ where: { id: section.id }, data: { status: "GENERATING" } });
    assert.equal(await saveModuleRewrite(project.id, section.id, { expected, updates }), null, "cannot overwrite content while an image task is using it");
    await prisma.pageSection.update({ where: { id: section.id }, data: { status: persisted.status } });
    const beforeVersions = await prisma.sectionVersion.count();
    const savedResponse = await applyRewrite(requestFor({ expected: preview.expected, updates: { copy: preview.copy, visualPrompt: preview.visualPrompt } }), routeContext);
    assert.equal(savedResponse.status, 200);
    const saved = (await savedResponse.json()).data;
    assert.equal(saved?.copy, updates.copy);
    const reloaded = await prisma.pageSection.findUniqueOrThrow({ where: { id: section.id } });
    assert.equal(reloaded.visualPrompt, updates.visualPrompt, "new DB read retains the adopted edit");
    assert.equal(reloaded.currentImageAssetId, persisted.currentImageAssetId);
    assert.deepEqual(reloaded.editableData, persisted.editableData, "saving rewrite preserves reference bindings");
    assert.equal(await prisma.sectionVersion.count(), beforeVersions, "saving copy does not overwrite image/PSD versions");
    assert.equal(await saveModuleRewrite(project.id, section.id, { expected, updates: { ...updates, copy: "stale" } }), null, "stale previews cannot overwrite newer content");
    assert.equal((await applyRewrite(requestFor({ expected, updates }), routeContext)).status, 409);
    const { regenerateSectionImage, editSectionImage } = await import("./generation-service");
    await prisma.project.update({ where: { id: project.id }, data: { platform: "taobao_tmall", modelSnapshot: { templateApplication: { styleProfile: { overallStyle: "粉色留白套版", colorPalette: ["pink"] }, structure: {} } } } });
    await regenerateSectionImage(project.id, section.id);
    assert.ok(detailCalls[2].prompt.includes(updates.copy));
    assert.ok(detailCalls[2].prompt.includes(updates.visualPrompt));
    assert.match(detailCalls[2].prompt, /CURRENT MODULE COPY AND LAYOUT REQUIREMENTS/);
    assert.match(detailCalls[2].prompt, /粉色留白套版/);
    await editSectionImage(project.id, section.id, { editMode: "enhance" });
    assert.ok(edits[1].prompt.includes(updates.visualPrompt));
    assert.match(edits[1].prompt, /must not remove text or layout explicitly requested/);
    assert.match(edits[1].prompt, /粉色留白套版/);
    failImage = true;
    const failed = { ...request, requestId: randomUUID(), force: true };
    await assert.rejects(runModuleReference(project.id, section.id, failed), /模拟编辑失败/);
    const repeat = await runModuleReference(project.id, section.id, failed) as any;
    assert.equal(repeat.task.status, "FAILED");
    assert.equal(imageCalls, 3, "failed reference requests are never automatically retried; one explicit detail enhancement also ran");
  } finally {
    await prisma.$disconnect(); mock.restore();
    for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    state.__stuckTasksRecovered = recovered;
    if (!folder.startsWith(join(tmpdir(), "motu-reference-test-"))) throw new Error("Unexpected test directory");
    rmSync(folder, { recursive: true, force: true });
  }
});
