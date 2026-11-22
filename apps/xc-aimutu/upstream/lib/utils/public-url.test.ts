import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { motuApiUrl, motuFileUrl } from "./public-url";

const integration = process.env.NEXT_PUBLIC_CANVAS_INTEGRATION;
afterEach(() => {
  if (integration === undefined) delete process.env.NEXT_PUBLIC_CANVAS_INTEGRATION;
  else process.env.NEXT_PUBLIC_CANVAS_INTEGRATION = integration;
});

test("integrated export URLs stay under the Motu proxy for ZIP and JSON", () => {
  process.env.NEXT_PUBLIC_CANVAS_INTEGRATION = "1";
  assert.equal(motuApiUrl("projects/project-1/export/images"), "/motu/api/projects/project-1/export/images");
  assert.equal(motuApiUrl("projects/project-1/export/json"), "/motu/api/projects/project-1/export/json");
  assert.equal(motuFileUrl("generated/image.png"), "/motu/api/files/generated/image.png");
});

test("standalone exports keep their original API root", () => {
  delete process.env.NEXT_PUBLIC_CANVAS_INTEGRATION;
  assert.equal(motuApiUrl("projects/project-1/export/images"), "/api/projects/project-1/export/images");
  assert.equal(motuFileUrl("generated/image.png"), "/api/files/generated/image.png");
});
