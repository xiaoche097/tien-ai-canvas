import { test } from "node:test";
import assert from "node:assert/strict";
import { amazonPlanningRules, buildAmazonImagePrompt, prepareAmazonPlan } from "./amazon";
import { projectContentLanguage } from "@/lib/utils/content-language";
import { projectCreateSchema } from "@/lib/validations/project";

const section = { type: "HERO", title: "中文标题", goal: "图内中文促销", copy: "限时低价", visualPrompt: "竖版中文海报" };

test("Amazon defaults to English while explicit marketplace languages remain selectable", () => {
  assert.equal(projectContentLanguage("amazon"), "en-US");
  assert.equal(projectContentLanguage("taobao_tmall"), "zh-CN");
  assert.equal(projectContentLanguage("amazon", "ja-JP"), "ja-JP");
  assert.equal(projectContentLanguage("amazon", "zh-CN"), "zh-CN");
  assert.equal(projectCreateSchema.parse({ name: "Amazon 商品", platform: "amazon", style: "generic_clean", contentLanguage: "en-US" }).contentLanguage, "en-US");
  assert.equal(projectCreateSchema.safeParse({ name: "商品", platform: "amazon", style: "generic_clean", contentLanguage: "invalid" }).success, false);
});

test("MAIN uses clean product photography instructions without old Chinese marketing copy", () => {
  const prompt = buildAmazonImagePrompt(section, true, "en-US");
  assert.match(prompt, /RGB\(255,255,255\)/);
  assert.match(prompt, /square 1:1/);
  assert.match(prompt, /85%/);
  assert.match(prompt, /No unrelated props/);
  assert.match(prompt, /authentic markings physically present/);
  assert.doesNotMatch(prompt, /限时低价|竖版中文海报|中文标题/);
});

test("secondary copy translates the source brief into the selected language", () => {
  const english = buildAmazonImagePrompt(section, false, "en-US");
  assert.match(english, /All added image text must be in English/);
  assert.match(english, /Translate the source brief/);
  assert.match(buildAmazonImagePrompt(section, false, "ja-JP"), /All added image text must be in Japanese/);
  assert.match(amazonPlanningRules("en-US"), /first HERO is the MAIN/);
});

test("normal and fallback plans reserve only the first HERO for MAIN and leave domestic plans intact", () => {
  const plan = [section, { ...section, title: "附图" }, { ...section, type: "DETAIL_CLOSEUP" }];
  const result = prepareAmazonPlan("amazon", plan, "en-US");
  assert.equal(result[0].copy, "");
  assert.match(result[0].visualPrompt, /MAIN product listing/);
  assert.equal(result[1], plan[1]); assert.equal(result[2], plan[2]);
  assert.equal(plan[0].copy, "限时低价");
  assert.equal(prepareAmazonPlan("taobao_tmall", plan, "zh-CN"), plan);
});
