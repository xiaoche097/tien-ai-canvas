import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

import type { AssetType, ProductAsset } from "@prisma/client";
import { nanoid } from "nanoid";

import { prisma } from "@/lib/db/prisma";
import { canvasRequest } from "@/lib/canvas/backend";
import { env } from "@/lib/utils/env";
import { extFromMime, relativeStorageUrl, sanitizeFileName } from "@/lib/utils/files";

function rootDir() {
  return path.resolve(process.cwd(), env.STORAGE_ROOT);
}

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function ensureStorageScaffold() {
  await Promise.all([
    ensureDir(path.join(rootDir(), "uploads")),
    ensureDir(path.join(rootDir(), "generated")),
    ensureDir(path.join(rootDir(), "exports")),
  ]);
}

function projectDir(projectId: string, kind: "uploads" | "generated" | "exports", sectionId?: string) {
  const base = path.join(rootDir(), kind, projectId);
  return sectionId ? path.join(base, sectionId) : base;
}

export async function saveUploadAsset(params: {
  projectId: string;
  type: AssetType;
  fileName: string;
  mimeType?: string | null;
  fileBuffer: Buffer;
  sortOrder: number;
  isMain?: boolean;
}) {
  if (process.env.CANVAS_INTEGRATION === "1") {
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { id: true } });
    if (!project) throw new Error("商品项目不存在");
  }
  await ensureStorageScaffold();
  const safeName = `${Date.now()}-${nanoid(6)}-${sanitizeFileName(params.fileName)}`;
  const dir = projectDir(params.projectId, "uploads");
  await ensureDir(dir);
  const relativePath = path.join("uploads", params.projectId, safeName);
  await fs.writeFile(path.join(rootDir(), relativePath), params.fileBuffer);

  // Ensure project exists to satisfy foreign key constraint
  if (process.env.CANVAS_INTEGRATION !== "1") {
    await prisma.project.upsert({
      where: { id: params.projectId },
      update: {},
      create: { id: params.projectId, name: params.projectId, platform: "unknown", style: "unknown" },
    });
  }

  return prisma.productAsset.create({
    data: {
      projectId: params.projectId,
      type: params.type,
      filePath: relativePath,
      fileName: params.fileName,
      mimeType: params.mimeType,
      sortOrder: params.sortOrder,
      isMain: params.isMain ?? false,
      metadata: {
        bytes: params.fileBuffer.byteLength,
      },
    },
  });
}

export async function saveGeneratedImage(params: {
  projectId: string;
  sectionId: string;
  prompt: string;
  source: {
    url?: string | null;
    b64Json?: string | null;
    svgText?: string | null;
    mimeType?: string | null;
    canvasResourceId?: string | null;
  };
  metadata?: Record<string, unknown>;
}) {
  await ensureStorageScaffold();
  const dir = projectDir(params.projectId, "generated", params.sectionId);
  await ensureDir(dir);

  const mimeType =
    params.source.svgText ? "image/svg+xml" : params.source.mimeType ?? "image/png";
  const ext = extFromMime(mimeType);
  const fileName = `${Date.now()}-${nanoid(6)}.${ext}`;
  const relativePath = path.join("generated", params.projectId, params.sectionId, fileName);
  const absolutePath = path.join(rootDir(), relativePath);

  if (params.source.svgText) {
    await fs.writeFile(absolutePath, params.source.svgText, "utf8");
  } else if (params.source.b64Json) {
    await fs.writeFile(absolutePath, Buffer.from(params.source.b64Json, "base64"));
  } else if (params.source.url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(params.source.url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`Failed to download generated image: ${response.status}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(absolutePath, bytes);
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  } else {
    throw new Error("Image generation produced no usable image output.");
  }

  const asset = await prisma.productAsset.create({
    data: {
      projectId: params.projectId,
      sectionId: params.sectionId,
      type: "GENERATED",
      filePath: relativePath,
      fileName,
      mimeType,
      sortOrder: 0,
      metadata: {
        prompt: params.prompt,
        ...(params.metadata ?? {}),
        ...(process.env.CANVAS_INTEGRATION === "1" && params.source.canvasResourceId ? { canvasResourceId: params.source.canvasResourceId } : {}),
      },
    },
  });
  if (process.env.CANVAS_INTEGRATION !== "1") return asset;
  try {
    await syncGeneratedImageToCanvas(asset.id);
    return asset;
  } catch {
    await prisma.productAsset.update({
      where: { id: asset.id },
      data: { metadata: { ...(asset.metadata as Record<string, unknown>), canvasSyncStatus: "failed" } },
    }).catch(() => undefined);
    return { ...asset, canvasSyncWarning: "图片已保存在电商设计室，但未能同步到境彻资产。重新进入项目时会重试。" };
  }
}

export async function syncGeneratedImageToCanvas(assetId: string) {
  if (process.env.CANVAS_INTEGRATION !== "1") return;
  const asset = await prisma.productAsset.findUnique({
    where: { id: assetId }, include: { project: { select: { name: true } }, section: { select: { title: true } } },
  });
  if (!asset || asset.type !== "GENERATED") throw new Error("生成图片不存在");
  const metadata = asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata)
    ? asset.metadata as Record<string, unknown> : {};
  if (metadata.canvasSyncStatus === "synced") return;

  const original = await readStorageFile(asset.filePath);
  const format = (await sharp(original).metadata()).format;
  const bytes = asset.mimeType === "image/svg+xml" || !["png", "jpeg", "webp"].includes(format ?? "")
    ? await sharp(original).png().toBuffer() : original;
  const info = await sharp(bytes).metadata();
  const mimeType = info.format === "jpeg" ? "image/jpeg" : info.format === "webp" ? "image/webp" : "image/png";
  let resourceId = typeof metadata.canvasResourceId === "string" ? metadata.canvasResourceId : "";
  if (!resourceId) {
    const form = new FormData();
    form.append("kind", "image");
    form.append("width", String(info.width ?? 0));
    form.append("height", String(info.height ?? 0));
    form.append("file", new Blob([new Uint8Array(bytes)], { type: mimeType }), `motu-${asset.id}.${extFromMime(mimeType)}`);
    const uploaded = await canvasRequest<{ resource: { id: string } }>("/api/resources", {
      method: "POST", headers: { "X-Idempotency-Key": `motu-generated:${asset.id}` }, body: form,
    });
    resourceId = uploaded.resource.id;
    await prisma.productAsset.update({ where: { id: asset.id }, data: { metadata: { ...metadata, canvasResourceId: resourceId } } });
  }

  const canvasAssetId = `motu_${asset.id}`;
  const resourceUrl = `/api/resources/${encodeURIComponent(resourceId)}/file`;
  await canvasRequest(`/api/assets/${encodeURIComponent(canvasAssetId)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asset: {
      id: canvasAssetId, kind: "image", category: "other", status: "confirmed",
      title: `${asset.project.name} · ${asset.section?.title || "生成图片"}`.slice(0, 200),
      coverUrl: resourceUrl, tags: [], source: "电商设计室",
      createdAt: asset.createdAt.toISOString(), updatedAt: asset.createdAt.toISOString(),
      data: { dataUrl: resourceUrl, storageKey: `resource:${resourceId}`, width: info.width ?? 0,
        height: info.height ?? 0, bytes: bytes.length, mimeType },
      metadata: { source: "motu", motuProjectId: asset.projectId, motuSectionId: asset.sectionId,
        motuAssetId: asset.id, projectName: asset.project.name },
    } }),
  });
  await prisma.productAsset.update({ where: { id: asset.id }, data: {
    metadata: { ...metadata, canvasResourceId: resourceId, canvasAssetId, canvasSyncStatus: "synced" },
  } });
}

export async function duplicateExportFile(params: {
  projectId: string;
  fileName: string;
  sourceBuffer: Buffer;
  mimeType: string;
}) {
  await ensureStorageScaffold();
  const ext = extFromMime(params.mimeType);
  const safeName = sanitizeFileName(`${params.fileName}.${ext}`);
  const relativePath = path.join("exports", params.projectId, safeName);
  await ensureDir(projectDir(params.projectId, "exports"));
  await fs.writeFile(path.join(rootDir(), relativePath), params.sourceBuffer);

  return prisma.productAsset.create({
    data: {
      projectId: params.projectId,
      type: "EXPORTED",
      filePath: relativePath,
      fileName: safeName,
      mimeType: params.mimeType,
      sortOrder: 0,
    },
  });
}

export async function deleteAssetRecord(assetId: string) {
  const asset = await prisma.productAsset.findUnique({ where: { id: assetId } });
  if (!asset) {
    return null;
  }

  const absolutePath = path.join(rootDir(), asset.filePath);
  await fs.rm(absolutePath, { force: true });
  await prisma.productAsset.delete({ where: { id: assetId } });
  return asset;
}

export function assetPublicUrl(asset: Pick<ProductAsset, "filePath"> | null | undefined) {
  if (!asset) {
    return null;
  }

  return relativeStorageUrl(asset.filePath);
}

function resolveSafePath(relativePath: string) {
  const target = path.resolve(rootDir(), relativePath);
  const root = path.resolve(rootDir());
  if (!target.startsWith(root + path.sep) && target !== root) {
    throw new Error("Access denied: path traversal detected");
  }
  return target;
}

export async function readStorageFile(relativePath: string) {
  return fs.readFile(resolveSafePath(relativePath));
}

export async function statStorageFile(relativePath: string) {
  return fs.stat(resolveSafePath(relativePath));
}
