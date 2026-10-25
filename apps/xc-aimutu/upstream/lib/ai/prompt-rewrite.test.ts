import { test } from "node:test";
import assert from "node:assert/strict";
import { promptRewriteSchema, applyPromptReplacement, buildModuleRewritePrompt } from "./prompt-rewrite";
import { moduleReferenceGuide, productFidelityGuard } from "./module-reference-guide";

const originalPrompt = "商品是尼龙表带。背景是黑色。English: preserve the band.";
const input = { instruction: "只改背景", target: "both" as const, currentPrompt: originalPrompt, mode: "selection" as const, start: 8, end: 14, draft: { title: "材质说明", goal: "突出织纹", copy: "仅售表带，不含手表", visualPrompt: originalPrompt } };

test("partial replacement preserves both outside spans byte for byte", () => {
  const parsed = promptRewriteSchema.parse(input);
  const result = applyPromptReplacement(parsed, "米白背景");
  assert.equal(result.prompt, input.currentPrompt.slice(0, 8) + "米白背景" + input.currentPrompt.slice(14));
  assert.ok(result.prompt.endsWith("English: preserve the band."));
  assert.equal(result.replacement, "米白背景");
});

test("rewrite bounds reject empty, out of range, and implicit full-module ranges", () => {
  for (const range of [{ start: 1, end: 1 }, { start: -1, end: 3 }, { start: 2, end: 99999 }, { start: 0.5, end: 3 }]) assert.equal(promptRewriteSchema.safeParse({ ...input, ...range }).success, false);
  assert.equal(promptRewriteSchema.safeParse({ ...input, mode: "module" }).success, false);
  assert.equal(promptRewriteSchema.safeParse({ ...input, mode: "module", start: 0, end: input.currentPrompt.length }).success, true);
  assert.throws(() => applyPromptReplacement(input, "   "));
  assert.throws(() => applyPromptReplacement(input, "x".repeat(20001)));
});

test("rewrite context includes product facts, module theme and the original span without recursive template substitution", () => {
  const prompt = buildModuleRewritePrompt({ ...input, instruction: "保留 {{原始提示词}} 标记" }, { platform: "amazon", amazonMain: true, product: { description: "band only; watch not included" } });
  assert.ok(prompt.includes("band only; watch not included"));
  assert.ok(prompt.includes("材质说明"));
  assert.ok(prompt.includes(input.currentPrompt.slice(input.start, input.end)));
  assert.ok(prompt.includes("保留 {{原始提示词}} 标记"));
  assert.ok(prompt.includes("Amazon MAIN"));
});

test("reference guidance distinguishes wear, texture, clasp and dimensions without claiming coverage", () => {
  const guide = (title: string) => moduleReferenceGuide({ type: "CUSTOM", title, goal: "" }).join("\n");
  assert.match(guide("佩戴场景"), /佩戴或使用图/);
  assert.match(guide("柔软编织材质"), /材质近拍/);
  assert.match(guide("磁吸扣开合"), /打开、闭合/);
  assert.match(guide("腕围尺寸"), /不让 AI 估算/);
  assert.match(guide("产品对比"), /相同角度/);
  assert.match(productFidelityGuard(1), /Do not invent a hidden back/);
  assert.match(productFidelityGuard(5), /Multiple references do not prove/);
});

test("copy rewriting validates its own source and permits explicit deletion of marketing copy", () => {
  const request = { ...input, target: "copy" as const, mode: "module" as const, currentPrompt: input.draft.copy, start: 0, end: input.draft.copy.length };
  const parsed = promptRewriteSchema.parse(request);
  assert.equal(applyPromptReplacement(parsed, "").prompt, "");
  assert.equal(promptRewriteSchema.safeParse({ ...request, currentPrompt: "与草稿不一致" }).success, false);
  assert.match(buildModuleRewritePrompt(input, {}), /synchronize only related marketing text/);
  assert.match(buildModuleRewritePrompt(input, {}), /text placement, typography hierarchy/);
});
