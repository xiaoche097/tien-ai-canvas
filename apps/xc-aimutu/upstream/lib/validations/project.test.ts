import { test } from "node:test";
import assert from "node:assert/strict";
import { projectCreateSchema, projectUpdateSchema } from "./project";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalysisWorkspace } from "@/components/analysis/analysis-workspace";

test("project metadata can save the descriptive style written by product analysis", () => {
  const input = { name: "商品项目", platform: "taobao_tmall", style: "户外机能·城市休闲", description: "商品备注" };
  assert.deepEqual(projectUpdateSchema.parse(input), input);
});

test("project updates keep style validation and leave output configuration independent", () => {
  assert.equal(projectUpdateSchema.safeParse({ style: "   " }).success, false);
  assert.equal(projectUpdateSchema.safeParse({ style: null }).success, false);
  assert.equal(projectUpdateSchema.safeParse({ platform: "unsupported" }).success, false);
  const modelSnapshot = { previewConfig: { heroAspectRatio: "3:4" } };
  assert.deepEqual(projectUpdateSchema.parse({ modelSnapshot }), { modelSnapshot });
  assert.equal(projectCreateSchema.safeParse({ name: "商品项目", platform: "taobao_tmall", style: "未选择的风格" }).success, false);
});

test("the metadata form shows the actual analysis style as its selected option", () => {
  const project = { id: "project", name: "商品项目", platform: "taobao_tmall", style: "户外机能·城市休闲", assets: [], sections: [], analysis: null, modelSnapshot: {} };
  const html = renderToStaticMarkup(createElement(AnalysisWorkspace, { project }));
  assert.match(html, /<option value="户外机能·城市休闲" selected="">户外机能·城市休闲<\/option>/);
});
