import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { prepareAnalysisImage } from "./analysis-image";

test("large uploaded PNG remains a real image after analysis compression", async () => {
  const input = await sharp(randomBytes(1200 * 1800 * 3), { raw: { width: 1200, height: 1800, channels: 3 } }).png().toBuffer();
  assert.ok(input.length > 1.5 * 1024 * 1024);
  const url = await prepareAnalysisImage(input, "image/png");
  assert.ok(url.startsWith("data:image/jpeg;base64,"));
  const output = Buffer.from(url.split(",")[1], "base64");
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.height, 1600);
  assert.ok(Math.abs(metadata.width! / metadata.height! - 1200 / 1800) < 0.001);
  assert.ok(output.length < input.length);
});

test("small image is preserved and corrupt image rejects instead of becoming a text-only request", async () => {
  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: "white" } }).png().toBuffer();
  assert.equal(await prepareAnalysisImage(png, "image/png"), `data:image/png;base64,${png.toString("base64")}`);
  await assert.rejects(prepareAnalysisImage(Buffer.from("invalid image"), "image/png"));
});
