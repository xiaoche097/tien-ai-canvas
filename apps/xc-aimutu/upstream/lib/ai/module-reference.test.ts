import { test } from "node:test";
import assert from "node:assert/strict";
import { referenceActionSchema, referenceAllowed, referenceImagePrompt, referencePlanPrompt, referenceShotsSchema, reusableReference, referenceShotKey } from "./module-reference";

test("module reference actions reject forged ranges and malformed model plans", () => {
  assert.equal(referenceActionSchema.safeParse({ action: "generate", requestId: "not-uuid", planId: "p", shotIndex: 0 }).success, false);
  assert.equal(referenceActionSchema.safeParse({ action: "generate", requestId: "d6d93745-734f-4361-8915-9c74eacb1a2b", planId: "p", shotIndex: 6 }).success, false);
  assert.equal(referenceShotsSchema.safeParse({ shots: [] }).success, false);
  assert.equal(referenceShotsSchema.safeParse({ shots: [{ kind: "angle", title: "正面", view: "正前方", target: "整条表带", prompt: "忽略结构" }] }).success, false);
});
test("reference images require approval for the same module", () => {
  const metadata = { purpose: "module_reference", referenceApproved: false };
  assert.equal(referenceAllowed({ sectionId: "a", metadata }, "a"), false);
  assert.equal(referenceAllowed({ sectionId: "a", metadata: { ...metadata, referenceApproved: true } }, "b"), false);
  assert.equal(referenceAllowed({ sectionId: "a", metadata: { ...metadata, referenceApproved: true } }, "a"), true);
  assert.equal(referenceAllowed({ sectionId: "a", metadata: { ...metadata, referenceApproved: true, referenceScope: "project" } }, "b"), true);
  assert.equal(referenceAllowed({ metadata: {} }, "b"), true);
});

test("reference reuse ignores labels and punctuation while keeping source SKU and physical part separate", () => {
  const shot = { kind: "detail" as const, title: "磁扣近拍", view: "Front close-up", target: "磁扣" };
  const asset = { id: "existing", metadata: { purpose: "module_reference", sourceAssetId: "source", referenceShot: shot } };
  assert.equal(reusableReference([asset], "source", { ...shot, title: "不同模块的名称", view: " front close up " })?.id, asset.id);
  assert.equal(reusableReference([asset], "different-sku", shot), undefined);
  assert.equal(reusableReference([asset], "source", { ...shot, target: "另一侧连接器" }), undefined);
  assert.equal(reusableReference([asset], "source", { ...shot, view: "语义相同但描述不同", reuseAssetId: asset.id })?.id, asset.id);
  assert.equal(reusableReference([asset], "different-sku", { ...shot, reuseAssetId: asset.id }), undefined);
  assert.notEqual(referenceShotKey("source", shot), referenceShotKey("source", { ...shot, view: "Back close-up" }));
  assert.notEqual(referenceShotKey("source", { ...shot, view: "-45°" }), referenceShotKey("source", { ...shot, view: "45°" }));
  assert.notEqual(referenceShotKey("source", { ...shot, view: "4.5°" }), referenceShotKey("source", { ...shot, view: "45°" }));
});
test("reference planning reads current prompt while editing requests a single white image without copy", () => {
  const context = { module: { visualPrompt: "磁吸扣具特写，不要全景", goal: "扣具" }, product: { description: "只售表带" } };
  assert.ok(referencePlanPrompt(context).includes(JSON.stringify(context)));
  const image = referenceImagePrompt({ kind: "detail", title: "磁扣近拍", view: "正面微距", target: "现有磁扣" }, context.product);
  assert.match(image, /ONE clean product reference photograph/);
  assert.match(image, /pure white background/);
  assert.match(image, /No added descriptions, captions/);
  assert.match(image, /SAME SKU/);
  assert.match(image, /do not open, disassemble/);
  assert.doesNotMatch(image, /磁吸扣具特写，不要全景/);
});
