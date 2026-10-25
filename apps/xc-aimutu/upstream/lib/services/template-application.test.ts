import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { ecommerceDefaultTemplates } from "@/lib/ai/prompts/ecommerce-templates";

test("template creates an unanalyzed draft and replans current product with exact output and preserved style", async () => {
  const { mock } = require("bun:test");
  const directory = mkdtempSync(join(tmpdir(), "motu-template-test-"));
  const before = { DATABASE_URL: process.env.DATABASE_URL, CANVAS_INTEGRATION: process.env.CANVAS_INTEGRATION };
  process.env.CANVAS_INTEGRATION = "0";
  process.env.DATABASE_URL = `file:${join(directory, "test.db").replaceAll("\\", "/")}`;
  execFileSync("node", ["scripts/apply-prisma-migrations.cjs"], { env: process.env, stdio: "ignore" });
  const { prisma } = await import("@/lib/db/prisma");
  const prompts: string[] = [];
  let empty = false;
  mock.module("@/lib/services/provider-service", () => ({ getProviderAdapter: async () => ({
    provider: { models: [{ modelId: "test", isDefaultPlanning: true, capabilities: { text: true, structured_output: true } }] },
    adapter: { generateStructured: async (input: any) => {
      prompts.push(input.userPrompt);
      return { parsed: { sections: empty ? [] : Array.from({ length: 13 }, (_, index) => ({
        id: `section-${index}`, type: index < 5 ? "hero" : "material", title: `新外套模块 ${index}`, goal: "展示新商品", copy: "新外套文案", visualPrompt: "新外套实物排版", editableFields: {},
      })) } };
    } },
  }) }));
  mock.module("@/lib/canvas/style-prompt", () => ({ ecommerceStylePrompt: async () => "基础风格" }));
  mock.module("@/lib/canvas/prompt-templates", () => ({ loadEcommercePromptTemplates: async () => ecommerceDefaultTemplates }));
  try {
    const template = await prisma.template.create({ data: { name: "旧表带模板", referenceImageUrl: "/old.png", moduleCount: 1,
      styleProfile: { overallStyle: "粉色留白", colorPalette: ["pink"], typography: { heading: "粗体" } },
      structureJson: { modules: [{ type: "detail", name: "旧表带商品名称", styleNotes: "右侧留白", textLayout: "标题置顶", bgType: "白底" }] },
    } });
    const { POST } = await import("@/app/api/templates/[id]/apply/route");
    const { NextRequest } = await import("next/server");
    const input = { name: "新外套详情", productName: "新外套", description: "防风尼龙外套，仅售外套", platform: "amazon", previewConfig: { heroImageCount: 5, heroAspectRatio: "3:4", detailSectionCount: 8, imageAspectRatio: "21:9", contentLanguage: "en-US" } };
    const request = (body: unknown) => new NextRequest("http://localhost/api/templates/apply", { method: "POST", body: JSON.stringify(body) });
    const invalid = await POST(request({ ...input, description: "" }), { params: Promise.resolve({ id: template.id }) });
    assert.notEqual(invalid.status, 200);
    assert.equal(await prisma.project.count(), 0);
    const response = await POST(request(input), { params: Promise.resolve({ id: template.id }) });
    const payload = await response.json();
    assert.equal(payload.success, true);
    const id = payload.data.projectId;
    const project = await prisma.project.findUniqueOrThrow({ where: { id }, include: { analysis: true, sections: true } });
    assert.equal(project.status, "DRAFT");
    assert.equal(project.analysis, null);
    assert.equal(project.sections.length, 0);
    assert.match(project.description!, /防风尼龙外套/);
    assert.deepEqual((project.modelSnapshot as any).previewConfig, input.previewConfig);
    const { planSections } = await import("./planner-service");
    await assert.rejects(planSections(id), /请先完成商品分析/);
    assert.equal(prompts.length, 0);
    await prisma.productAnalysis.create({ data: { projectId: id, rawResult: {}, normalizedResult: { productName: "新外套", category: "服装", subcategory: "外套", styleTags: [], targetAudience: [], usageScenarios: [], coreSellingPoints: ["防风"], differentiationPoints: [], suggestedSectionPlan: [] } } });
    const result = await planSections(id);
    assert.equal(result.sections.filter(section => section.type === "HERO").length, 5);
    assert.equal(result.sections.filter(section => section.type !== "HERO").length, 8);
    assert.equal(result.previewConfig.imageAspectRatio, "21:9");
    assert.equal(result.previewConfig.heroAspectRatio, "3:4");
    assert.match(prompts[0], /新外套/);
    assert.match(prompts[0], /粉色留白/);
    assert.match(prompts[0], /标题置顶/);
    assert.doesNotMatch(prompts[0], /旧表带商品名称/);
    assert.match(result.sections.at(-1)!.visualPrompt, /粉色留白/);
    assert.equal(result.sections[0].copy, "", "Amazon MAIN copy remains empty");
    const reloaded = await prisma.project.findUniqueOrThrow({ where: { id } });
    assert.deepEqual((reloaded.modelSnapshot as any).previewConfig, input.previewConfig);
    empty = true;
    await assert.rejects(planSections(id), /模块数量不完整/);
    assert.equal(prompts.length, 2, "no silent retry or generic template fallback");
    assert.equal(await prisma.pageSection.count({ where: { projectId: id } }), 13, "failed template replanning preserves the previous plan");
  } finally {
    await prisma.$disconnect();
    for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    rmSync(directory, { recursive: true, force: true });
  }
});
