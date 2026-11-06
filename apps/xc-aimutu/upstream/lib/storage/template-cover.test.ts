import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

test("first uploaded reference becomes a persistent cover; replacing old covers does not call AI", async () => {
  const { mock } = require("bun:test");
  const directory = mkdtempSync(join(tmpdir(), "motu-cover-test-"));
  const before = { DATABASE_URL: process.env.DATABASE_URL, CANVAS_INTEGRATION: process.env.CANVAS_INTEGRATION, STORAGE_ROOT: process.env.STORAGE_ROOT, NEXT_PUBLIC_CANVAS_INTEGRATION: process.env.NEXT_PUBLIC_CANVAS_INTEGRATION };
  Object.assign(process.env, { CANVAS_INTEGRATION: "0", NEXT_PUBLIC_CANVAS_INTEGRATION: "1", STORAGE_ROOT: join(directory, "storage"), DATABASE_URL: `file:${join(directory, "test.db").replaceAll("\\", "/")}` });
  execFileSync("node", ["scripts/apply-prisma-migrations.cjs"], { env: process.env, stdio: "ignore" });
  const { prisma } = await import("@/lib/db/prisma");
  let modelCalls = 0;
  const structure = { overallStyle: "Clean", colorPalette: [], typography: {}, modules: [{ type: "hero", name: "Cover", order: 1 }] };
  mock.module("@/lib/services/provider-service", () => ({ getProviderAdapter: async () => ({ provider: { models: [{ modelId: "fixture", capabilities: { text: true, vision: true } }] }, adapter: { generateText: async () => { modelCalls++; return { text: JSON.stringify(structure) }; } } }) }));
  mock.module("@/lib/services/credit-service", () => ({ checkAndDeductCredits: async () => {}, refundCredits: async () => {} }));
  try {
    const { NextRequest } = await import("next/server");
    const first = await sharp({ create: { width: 120, height: 200, channels: 3, background: "red" } }).png().toBuffer();
    const second = await sharp({ create: { width: 120, height: 200, channels: 3, background: "blue" } }).png().toBuffer();
    const form = new FormData();
    form.append("images", new File([new Uint8Array(first)], "first.png", { type: "image/png" }));
    form.append("images", new File([new Uint8Array(second)], "second.png", { type: "image/png" }));
    const { POST: analyze } = await import("@/app/api/templates/analyze/route");
    const response = await analyze(new NextRequest("http://localhost/api/templates/analyze", { method: "POST", headers: { "x-access-key": "TEST_ONLY" }, body: form }));
    const analysis = await response.json();
    assert.equal(analysis.success, true);
    const coverUrl = analysis.data.referenceImageUrl;
    assert.match(coverUrl, /^\/motu\/api\/files\/templates\/covers\/.+\.webp$/);
    const savedImage = readFileSync(join(directory, "storage", coverUrl.split("/files/")[1]));
    const metadata = await sharp(savedImage).metadata();
    assert.equal(metadata.width, 120);
    assert.equal(metadata.height, 200, "persist the whole reference image; only the card display may crop it");
    const pixel = await sharp(savedImage).resize(1, 1).raw().toBuffer();
    assert.ok(pixel[0] > 200 && pixel[2] < 50, "cover comes from first red image, not the second blue image");
    const { POST: create, GET: list } = await import("@/app/api/templates/route");
    const created = await (await create(new NextRequest("http://localhost/api/templates", { method: "POST", body: JSON.stringify({ name: "Test template", referenceImageUrl: coverUrl, structureJson: analysis.data.structure, styleProfile: {} }) }))).json();
    assert.equal(created.success, true);
    const listed = await (await list(new NextRequest("http://localhost/api/templates"))).json();
    assert.equal(listed.data.templates[0].referenceImageUrl, coverUrl);
    const { POST: replace } = await import("@/app/api/templates/[id]/cover/route");
    const replacement = new FormData();
    replacement.append("file", new File([new Uint8Array(second)], "new-cover.png", { type: "image/png" }));
    const replaced = await (await replace(new NextRequest("http://localhost/api/templates/cover", { method: "POST", body: replacement }), { params: { id: created.data.template.id } })).json();
    assert.equal(replaced.success, true);
    assert.notEqual(replaced.data.template.referenceImageUrl, coverUrl);
    assert.deepEqual(replaced.data.template.structureJson, created.data.template.structureJson);
    const filePath = replaced.data.template.referenceImageUrl.split("/files/")[1];
    const { GET: readImage } = await import("@/app/api/files/[...path]/route");
    const image = await readImage(new Request("http://localhost/file"), { params: { path: filePath.split("/") } });
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/webp");
    assert.equal(modelCalls, 1, "replacing a cover does not run analysis or generation");
    const missing = await replace(new NextRequest("http://localhost/api/templates/cover", { method: "POST", body: new FormData() }), { params: { id: "missing" } });
    assert.equal(missing.status, 404);
  } finally {
    await prisma.$disconnect();
    for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + "motu-cover-test-"));
    rmSync(directory, { recursive: true, force: true });
  }
});
