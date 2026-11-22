import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import baseline from "./ecommerce-baseline.json";
import detailBaseline from "./ecommerce-detail-baseline.json";
import * as analysis from "./analysis";
import * as planning from "./planning";
import * as generation from "./generation";
import { ecommerceDefaultTemplates, ecommercePromptDefinitions, renderEcommercePrompt } from "./ecommerce-templates";
import { loadEcommercePromptTemplates } from "@/lib/canvas/prompt-templates";
import { buildTemplateAnalysisInput, buildTemplateAnalysisPrompt, buildTemplateSectionPrompt, buildReferenceStylePrompt } from "./template";

const modules: Record<string, any> = { analysis, planning, generation };
for (const fixture of baseline) {
  test(`workflow regression: ${fixture.name} (${baseline.indexOf(fixture) + 1})`, () => {
    const result = modules[fixture.module][fixture.name](...structuredClone(fixture.args));
    if (fixture.module === "planning" && fixture.name !== "buildPreviewDecisionPrompt") {
      assert.equal(result.split("\n\n## HERO product-gallery planning rules")[0], fixture.expected);
      assert.match(result, /apply ONLY to type=hero/);
      assert.match(result, /Keep all non-HERO detail sections/);
    } else if (fixture.module === "generation" && fixture.name !== "buildSectionSvgLayoutPrompt") {
      assert.match(result, /HERO composition rules:/);
      assert.match(result, /one dominant product and a concise cover layout/);
      assert.doesNotMatch(result, /marketplace poster composition/);
    } else {
      assert.equal(result, fixture.expected);
    }
  });
}

for (const fixture of detailBaseline) {
  test(`detail prompt remains byte-identical: ${fixture.name} (${detailBaseline.indexOf(fixture) + 1})`, () => {
    assert.equal((generation as Record<string, any>)[fixture.name](...structuredClone(fixture.args)), fixture.expected);
  });
}

test("Go and Motu ship the same original workflow defaults", () => {
  const goDefaults = JSON.parse(readFileSync(new URL("../../../../../../backend/internal/prompts/ecommerce_defaults.json", import.meta.url), "utf8"));
  assert.deepEqual(goDefaults, ecommercePromptDefinitions);
  assert.equal(ecommercePromptDefinitions.length, 21);
});

test("custom workflow versions replace their own stage and propagate through regeneration", () => {
  const section = { type: "HERO", title: "测试{{保留}}", goal: "说明", copy: "商品", visualPrompt: "真实商品" } as any;
  const templates = { ...ecommerceDefaultTemplates, ecommerce_workflow_hero_image: "新版本：{{模块标题}} / {{模块视觉提示词}}" };
  const result = generation.buildRegenerationPrompt(section, [], "3:4", "zh-CN", templates);
  assert.match(result, /^新版本：测试\{\{保留\}\} \/ 真实商品\n/);
  assert.doesNotMatch(result, /senior e-commerce key-visual/);
  assert.throws(() => renderEcommercePrompt("ecommerce_workflow_hero_image", {}, templates), /缺少变量/);
});

test("hero and detail template versions stay isolated at 3:4", () => {
  const section = { type: "HERO", title: "商品", goal: "展示", copy: "参数和卖点", visualPrompt: "真实商品" } as any;
  const templates = { ...ecommerceDefaultTemplates, ecommerce_workflow_image: "详情专用", ecommerce_workflow_hero_image: "头图专用" };
  assert.equal(generation.buildSectionImagePrompt(section, [], "3:4", "zh-CN", templates), "头图专用");
  for (const type of ["SELLING_POINTS", "SCENARIO", "DETAIL_CLOSEUP", "SPECS", "MATERIAL", "COMPARISON", "GIFT_SCENE", "BRAND_TRUST", "SUMMARY", "CUSTOM"]) {
    assert.equal(generation.buildSectionImagePrompt({ ...section, type }, [], "3:4", "zh-CN", templates), "详情专用");
  }
  for (const ratio of ["1:1", "3:4"] as const) {
    const prompt = generation.buildSectionImagePrompt(section, [], ratio);
    assert.match(prompt, /Text is optional/);
    assert.match(prompt, /AT MOST TWO concise supporting points/);
    assert.match(prompt, /Do not create stacked feature panels/);
    assert.match(prompt, /source material, not a mandatory typesetting checklist/);
    assert.ok(prompt.includes(`${ratio} e-commerce product-gallery hero composition`));
  }
});

test("template analysis, application and reference instructions retain the original wording", () => {
  assert.match(buildTemplateAnalysisPrompt(), /^你是一个电商视觉分析专家/);
  assert.equal(buildTemplateAnalysisInput("样品", false), "用户描述的详情页内容：\n样品");
  assert.equal(buildTemplateAnalysisInput("样品", true), "请分析这张电商详情页长图，拆解它的模块结构和视觉风格。\n用户补充描述：\n样品");
  assert.equal(buildTemplateAnalysisInput("", true), "请分析这张电商详情页长图，拆解它的模块结构和视觉风格。");
  assert.equal(buildTemplateSectionPrompt({ name: "头图", productName: "样品", overallStyle: "户外", styleNotes: "自然光" }), "生成头图图片。商品：样品。风格要求：户外。自然光");
  assert.match(buildReferenceStylePrompt(), /^【风格参照指令】/);
});

test("workflow lookup reads current templates and refuses incomplete responses", async () => {
  const previous = process.env.CANVAS_INTEGRATION;
  process.env.CANVAS_INTEGRATION = "1";
  try {
    let version = 0;
    const request = async (url: string) => {
      assert.equal(url, "/api/ecommerce/prompt-templates");
      return { templates: ecommercePromptDefinitions.map(definition => ({ operation: definition.operation, content: definition.operation === "ecommerce_workflow_image" ? `版本${version}` : definition.content, templateId: "test", templateVersion: version })) };
    };
    assert.equal((await loadEcommercePromptTemplates(request)).ecommerce_workflow_image, "版本0");
    version = 1;
    assert.equal((await loadEcommercePromptTemplates(request)).ecommerce_workflow_image, "版本1");
    await assert.rejects(loadEcommercePromptTemplates(async () => ({ templates: [] })), /模板缺失/);
    await assert.rejects(loadEcommercePromptTemplates(async () => { throw new Error("unavailable"); }), /unavailable/);
  } finally {
    if (previous === undefined) delete process.env.CANVAS_INTEGRATION;
    else process.env.CANVAS_INTEGRATION = previous;
  }
});
