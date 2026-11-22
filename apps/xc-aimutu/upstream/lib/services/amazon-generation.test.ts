import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { ecommerceDefaultTemplates } from "@/lib/ai/prompts/ecommerce-templates";
import { amazonCastingRules } from "@/lib/ai/prompts/amazon";

test("Amazon generation and repaint submit chosen main ratio and final casting constraints", async () => {
  const { mock } = require("bun:test");
  const directory = mkdtempSync(join(tmpdir(), "motu-amazon-test-"));
  const before = { DATABASE_URL: process.env.DATABASE_URL, CANVAS_INTEGRATION: process.env.CANVAS_INTEGRATION };
  process.env.CANVAS_INTEGRATION = "0";
  process.env.DATABASE_URL = `file:${join(directory, "test.db").replaceAll("\\", "/")}`;
  execFileSync("node", ["scripts/apply-prisma-migrations.cjs"], { env: process.env, stdio: "ignore" });
  const { prisma } = await import("@/lib/db/prisma");
  const bytes = await sharp({ create: { width: 24, height: 32, channels: 3, background: "white" } }).png().toBuffer();
  const calls: any[] = [];
  mock.module("@/lib/services/provider-service", () => ({ getProviderAdapter: async () => ({
    provider: { models: [{ modelId: "fixture-image", isDefaultHeroImage: true, isDefaultDetailImage: true, isDefaultImageEdit: true, capabilities: { image_gen: true, real_image_gen: true, image_edit: true, real_image_edit: true } }] },
    adapter: { generateImage: async (input: any) => { calls.push(input); return { b64Json: bytes.toString("base64") }; }, editImage: async (input: any) => { calls.push(input); return { b64Json: bytes.toString("base64") }; } },
  }) }));
  mock.module("@/lib/canvas/prompt-templates", () => ({ loadEcommercePromptTemplates: async () => ecommerceDefaultTemplates }));
  mock.module("@/lib/canvas/style-prompt", () => ({ ecommerceStylePrompt: async () => "Existing style" }));
  mock.module("@/lib/storage/asset-manager", () => ({ readStorageFile: async () => bytes,
    saveGeneratedImage: async (input: any) => prisma.productAsset.create({ data: { projectId: input.projectId, sectionId: input.sectionId, type: "GENERATED", filePath: "test.png", fileName: "test.png", mimeType: "image/png", metadata: input.metadata } }),
  }));
  try {
    const project = await prisma.project.create({ data: { name: "Amazon fixture", platform: "amazon", style: "generic_clean", modelSnapshot: { previewConfig: { heroAspectRatio: "3:4", contentLanguage: "en-US" } } } });
    await prisma.productAsset.create({ data: { projectId: project.id, type: "MAIN", fileName: "source.png", filePath: "source.png", mimeType: "image/png", isMain: true } });
    const main = await prisma.pageSection.create({ data: { projectId: project.id, sectionKey: "main", type: "HERO", title: "Main", goal: "Product", copy: "", order: 0, visualPrompt: "Old square 1:1 composition" } });
    const secondary = await prisma.pageSection.create({ data: { projectId: project.id, sectionKey: "secondary", type: "HERO", title: "Scenario", goal: "Lifestyle", copy: "", visualPrompt: "Show the garment", order: 1 } });
    const { generateSectionImage, editSectionImage } = await import("./generation-service");
    await generateSectionImage(project.id, main.id);
    await editSectionImage(project.id, main.id, { editMode: "repaint" });
    await generateSectionImage(project.id, secondary.id);
    assert.equal(calls.length, 3);
    for (const call of calls) {
      assert.equal(call.aspectRatio, "3:4");
      assert.equal(call.size, "768x1024");
      assert.ok(call.prompt.endsWith(amazonCastingRules));
    }
    assert.match(calls[0].prompt, /vertical 3:4 composition/);
    assert.doesNotMatch(calls[0].prompt, /square 1:1/);
    assert.match(calls[1].prompt, /vertical 3:4 composition/);
    await prisma.pageSection.update({ where: { id: main.id }, data: { editableData: { heroAspectRatio: "1:1" } } });
    await generateSectionImage(project.id, main.id);
    assert.equal(calls[3].aspectRatio, "1:1");
    assert.equal(calls[3].size, "1024x1024");
  } finally {
    await prisma.$disconnect();
    for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + "motu-amazon-test-"));
    rmSync(directory, { recursive: true, force: true });
  }
});
