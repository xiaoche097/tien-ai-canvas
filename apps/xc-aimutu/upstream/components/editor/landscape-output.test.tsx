import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ProjectOutputConfigCard } from "@/components/shared/project-output-config-card";
import { projectUpdateSchema } from "@/lib/validations/project";
import { getSectionAspectRatio, normalizeDetailAspectRatio, sectionOutputSize } from "@/lib/utils/section-aspect-ratio";
import { buildSectionImagePrompt, buildRegenerationPrompt, buildImageEditPrompt } from "@/lib/ai/prompts/generation";
import { buildAmazonImagePrompt } from "@/lib/ai/prompts/amazon";
import { getPreviewConfig, getAspectRatioClass } from "./editor-utils";

for (const ratio of ["16:9", "21:9"] as const) test(`${ratio} survives configuration, preview, generation and repaint without changing HERO ratio`, () => {
  const modelSnapshot = { previewConfig: { imageAspectRatio: ratio, heroAspectRatio: "3:4" } };
  const project = { platform: "amazon", modelSnapshot };
  assert.equal(projectUpdateSchema.parse({ modelSnapshot }).modelSnapshot?.previewConfig.imageAspectRatio, ratio);
  assert.equal(getPreviewConfig(project).imageAspectRatio, ratio);
  assert.equal(getSectionAspectRatio({ type: "DETAIL_CLOSEUP" }, ratio), ratio);
  assert.equal(getSectionAspectRatio({ type: "HERO" }, ratio, "3:4"), "3:4");
  const [width, height] = sectionOutputSize(ratio, "DETAIL_CLOSEUP").split("x").map(Number);
  const [rw, rh] = ratio.split(":").map(Number);
  assert.equal(width / height, rw / rh);
  const section = { type: "DETAIL_CLOSEUP", title: "商品", copy: "真实材质", goal: "细节", visualPrompt: "竖版 9:16 构图。vertical 9:16 mobile composition" } as any;
  for (const prompt of [buildSectionImagePrompt(section, [], ratio, "en-US"), buildRegenerationPrompt(section, [], ratio, "en-US"), buildImageEditPrompt(section, [], "repaint", ratio, "en-US")]) {
    assert.match(prompt, new RegExp(`horizontal landscape ${ratio}`));
    assert.doesNotMatch(prompt, /竖版 9:16|vertical 9:16/);
  }
  assert.match(buildAmazonImagePrompt(section, false, "en-US", ratio), new RegExp(`horizontal landscape ${ratio}`));
  assert.ok(getAspectRatioClass(ratio));
});

test("Amazon defaults to landscape; existing portrait settings are retained", () => {
  assert.equal(normalizeDetailAspectRatio(undefined, "amazon"), "16:9");
  assert.equal(normalizeDetailAspectRatio(undefined, "taobao_tmall"), "9:16");
  assert.equal(normalizeDetailAspectRatio("3:4", "amazon"), "3:4");
  assert.equal(projectUpdateSchema.safeParse({ modelSnapshot: { previewConfig: { imageAspectRatio: "99:1" } } }).success, false);
});

test("output control displays and restores the saved landscape ratio", () => {
  const html = renderToStaticMarkup(<AppRouterContext.Provider value={{ refresh() {} } as any}><ProjectOutputConfigCard editable project={{ id: "project", platform: "amazon", modelSnapshot: { previewConfig: { imageAspectRatio: "21:9" } } }} /></AppRouterContext.Provider>);
  assert.match(html, /id="output-detail-aspect-ratio"/);
  assert.match(html, /value="16:9"/);
  assert.match(html, /value="21:9" selected=""/);
  assert.match(html, /详情图比例：21:9/);
});
