import { test } from "node:test";
import assert from "node:assert/strict";
import { moduleContentRequirements } from "./module-content";

test("saved marketing copy and requested layout outrank generic sparse hero and clean reference photos", () => {
  const section = { copy: "Soft woven nylon · Adjustable fit", visualPrompt: "标题置顶，右侧三张圆形特写，保留原有六色平铺" };
  const prompt = moduleContentRequirements(section, false);
  assert.ok(prompt.includes(JSON.stringify(section)));
  assert.match(prompt, /generic HERO rule/);
  assert.match(prompt, /must not remove text or layout explicitly requested/);
  assert.match(prompt, /inside the generated artwork/);
  assert.match(prompt, /lack of text or layout must not erase/);
  assert.equal(moduleContentRequirements(section, true), "", "Amazon MAIN still forbids marketing overlays");
});
