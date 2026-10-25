import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { getSectionAspectRatio } from "@/lib/utils/section-aspect-ratio";
import { buildSectionImagePrompt, buildRegenerationPrompt, buildImageEditPrompt } from "@/lib/ai/prompts/generation";
import { sectionPatchSchema } from "@/lib/validations/section";
import { PhonePreviewPanel } from "./phone-preview-panel";
import { getPreviewConfig } from "./editor-utils";
import { projectUpdateSchema } from "@/lib/validations/project";
import { buildSectionPlanningPrompt, buildClothingPlanningPrompt } from "@/lib/ai/prompts/planning";
import { ProjectOutputConfigCard } from "@/components/shared/project-output-config-card";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

test("old hero modules stay square; portrait selection does not change detail ratios", () => {
  assert.equal(getSectionAspectRatio({ type: "HERO" }), "1:1");
  assert.equal(getSectionAspectRatio({ type: "HERO", editableData: { heroAspectRatio: "3:4" } }), "3:4");
  assert.equal(getSectionAspectRatio({ type: "DETAIL_CLOSEUP", editableData: { heroAspectRatio: "3:4" } }, "9:16"), "9:16");
  assert.equal(getSectionAspectRatio({ type: "DETAIL_CLOSEUP" }, "3:4"), "3:4");
});

test("project ratio is inherited unless the hero explicitly overrides it", () => {
  assert.equal(getSectionAspectRatio({ type: "HERO" }, "9:16", "3:4"), "3:4");
  assert.equal(getSectionAspectRatio({ type: "HERO", editableData: { heroAspectRatio: "1:1" } }, "9:16", "3:4"), "1:1");
  assert.equal(getSectionAspectRatio({ type: "DETAIL_CLOSEUP" }, "9:16", "3:4"), "9:16");
  const modelSnapshot = { previewConfig: { heroAspectRatio: "3:4" } };
  assert.equal(getPreviewConfig({ modelSnapshot }).heroAspectRatio, "3:4");
  assert.deepEqual(projectUpdateSchema.parse({ modelSnapshot }).modelSnapshot, modelSnapshot);
  assert.equal(projectUpdateSchema.safeParse({ modelSnapshot: { previewConfig: { heroAspectRatio: "16:9" } } }).success, false);
});

test("output configuration offers an independent hero ratio and shows the saved ratio", () => {
  const html = renderToStaticMarkup(
    <AppRouterContext.Provider value={{ refresh() {} } as any}>
      <ProjectOutputConfigCard editable project={{ id: "project", modelSnapshot: { previewConfig: { heroAspectRatio: "3:4" } } }} />
    </AppRouterContext.Provider>,
  );
  assert.match(html, /id="output-hero-aspect-ratio"/);
  assert.match(html, /value="3:4" selected=""/);
  assert.match(html, /4 张（3:4）/);
});

test("both planning prompts request the configured hero ratio", () => {
  const analysis = { productName: "商品", category: "服装", subcategory: "上衣", styleTags: [], targetAudience: [], usageScenarios: [], coreSellingPoints: [], differentiationPoints: [], suggestedSectionPlan: [] } as any;
  assert.match(buildSectionPlanningPrompt(analysis, "", "", 6, 4, "zh-CN", "3:4"), /HERO composition: 3:4/);
  const clothing = buildClothingPlanningPrompt(analysis, "", "", 4, "zh-CN", "3:4");
  assert.match(clothing, /HERO sections.*vertical 3:4 composition/);
  assert.doesNotMatch(clothing, /square 1:1/);
});

test("section updates retain portrait settings and references, rejecting unsupported ratios", () => {
  const editableData = { heroAspectRatio: "3:4", referenceAssetIds: ["reference"] };
  assert.deepEqual(sectionPatchSchema.parse({ editableData }).editableData, editableData);
  assert.equal(sectionPatchSchema.safeParse({ editableData: { heroAspectRatio: "16:9" } }).success, false);
});

const hero = {
  id: "hero", type: "HERO", title: "商品主图", goal: "展示商品", copy: "保留真实材质",
  visualPrompt: "正方形 1:1 构图，适合 1:1 头图轮播。English Prompt: square 1:1 composition, square e-commerce hero image.",
  editableData: { heroAspectRatio: "3:4" }, imageUrl: "/image.png", currentImageAsset: { metadata: { mode: "image_api" } },
};

test("generation, regeneration and repaint replace legacy square composition hints", () => {
  const section = hero as unknown as Parameters<typeof buildSectionImagePrompt>[0];
  for (const prompt of [buildSectionImagePrompt(section, [], "3:4"), buildRegenerationPrompt(section, [], "3:4"), buildImageEditPrompt(section, [], "repaint", "3:4")]) {
    assert.match(prompt, /vertical 3:4/);
    assert.doesNotMatch(prompt, /square 1:1|正方形 1:1|1:1 头图/);
    assert.match(prompt, /保留真实材质/);
  }
});

test("phone hero and thumbnail use natural image height instead of a configured frame", () => {
  const html = renderToStaticMarkup(<PhonePreviewPanel project={{ sections: [hero], assets: [], modelSnapshot: {}, name: "商品" }} selectedHeroIndex={0} onSelectHeroIndex={() => {}} onOpenLightbox={() => {}} />);
  assert.match(html, /class="block h-auto w-full cursor-zoom-in"/);
  assert.match(html, /class="block h-auto w-full"/);
  assert.equal((html.match(/aspect-ratio:1\/1/g) ?? []).length, 3);
  assert.doesNotMatch(html, /object-contain|object-cover/);
});

test("an existing image follows its own size even when the project defaults to square", () => {
  const html = renderToStaticMarkup(<PhonePreviewPanel project={{ sections: [{ ...hero, editableData: {} }], assets: [], modelSnapshot: {}, name: "商品" }} selectedHeroIndex={0} onSelectHeroIndex={() => {}} onOpenLightbox={() => {}} />);
  assert.doesNotMatch(html, /aspect-ratio:3\/4/);
  assert.match(html, /aspect-ratio:1\/1/);
  assert.match(html, /class="relative bg-slate-100"><img[^>]*class="block h-auto w-full cursor-zoom-in"/);
});

test("only empty slots inherit the project portrait ratio", () => {
  const project = { sections: [{ ...hero, editableData: {} }], assets: [], modelSnapshot: { previewConfig: { heroAspectRatio: "3:4" } }, name: "商品" };
  const html = renderToStaticMarkup(<PhonePreviewPanel project={project} selectedHeroIndex={0} onSelectHeroIndex={() => {}} onOpenLightbox={() => {}} />);
  assert.equal((html.match(/aspect-ratio:3\/4/g) ?? []).length, 3);
  const empty = renderToStaticMarkup(<PhonePreviewPanel project={{ ...project, sections: [] }} selectedHeroIndex={0} onSelectHeroIndex={() => {}} onOpenLightbox={() => {}} />);
  assert.match(empty, /aspect-ratio:3\/4/);
});
