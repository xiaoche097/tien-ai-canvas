import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env } from "@/lib/utils/env";
import { relativeStorageUrl } from "@/lib/utils/files";

export async function saveTemplateCover(buffer: Buffer) {
  if (!buffer.length || buffer.length > 20 * 1024 * 1024) throw new Error("封面图片需在 20MB 以内");
  const image = await sharp(buffer, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 1600, height: 8000, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
  const relativePath = path.join("templates", "covers", `${randomUUID()}.webp`);
  const target = path.join(env.STORAGE_ROOT, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, image);
  return relativeStorageUrl(relativePath);
}
