import type { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export interface PsdScope { userId: string; db: PrismaClient; storageRoot: string; maxStoredBytes: number }
export interface PsdOrigin { projectId: string; moduleId: string; sourceAssetId: string; sourceVersionId: string | null; projectName: string; moduleName: string }
export interface PsdSession { id: string; projectId: string; sectionId: string; fileName: string; sourceFormat: string; origin?: PsdOrigin }
export interface PsdVersion {
  id: string; sessionId: string; versionNumber: number; parentVersionId: string | null;
  width: number; height: number; checksum: string; previewChecksum: string;
  psdAssetId: string; previewAssetId: string; createdAt: string; createdBy: string;
  origin?: PsdOrigin;
  baseAssetId?: string;
}
export class PsdError extends Error {
  constructor(public status: number, public reason: string, message: string) { super(message); }
}
const limit = 50 * 1024 * 1024;
const hash = (buffer: Uint8Array) => createHash("sha256").update(buffer).digest("hex");
const locks = new Map<string, Promise<unknown>>();

export function validatePsdInput(buffer: Buffer, format: "psd" | "png" | "jpg") {
  if (!buffer.length || buffer.length > limit) throw new PsdError(413, "invalid_file_size", "单个文件须大于 0 且不超过 50 MB");
  if (format === "psd") {
    if (buffer.length < 26 || buffer.toString("ascii", 0, 4) !== "8BPS" || buffer.readUInt16BE(4) !== 1 || buffer.readUInt32BE(14) < 1 || buffer.readUInt32BE(18) < 1) {
      throw new PsdError(400, "invalid_psd", "PSD 文件头或尺寸无效");
    }
  } else if (format === "png") {
    if (buffer.length < 33 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || buffer.toString("ascii", 12, 16) !== "IHDR") {
      throw new PsdError(400, "invalid_png", "PNG 文件头无效");
    }
  } else if (buffer.length < 4 || buffer[0] !== 255 || buffer[1] !== 216 || buffer[buffer.length - 2] !== 255 || buffer[buffer.length - 1] !== 217) {
    throw new PsdError(400, "invalid_jpg", "JPG 文件头无效");
  }
}
function identity(scope: PsdScope) {
  if (!scope.userId || !path.isAbsolute(scope.storageRoot) || !Number.isSafeInteger(scope.maxStoredBytes) || scope.maxStoredBytes <= 0) throw new PsdError(401, "authentication_required", "缺少有效登录态或存储范围");
}
function id(value: string) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw new PsdError(400, "invalid_id", "文件或版本 ID 无效");
  return value;
}
function requestId(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new PsdError(400, "invalid_request_id", "保存请求标识必须为有效 UUID");
  return value.toLowerCase();
}
function metadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function originMetadata(value: unknown): PsdOrigin | undefined {
  if (value == null) return undefined;
  const item = metadata(value);
  if (!["projectId", "moduleId", "sourceAssetId", "projectName", "moduleName"].every((key) => typeof item[key] === "string" && item[key]) || !(item.sourceVersionId === null || typeof item.sourceVersionId === "string")) throw new PsdError(409, "invalid_origin_metadata", "精修来源记录不完整");
  return item as unknown as PsdOrigin;
}
function describeSession(asset: { id: string; projectId: string; sectionId: string | null; fileName: string; metadata: unknown }): PsdSession {
  const meta = metadata(asset.metadata), origin = originMetadata(meta.origin);
  return { id: asset.id, projectId: asset.projectId, sectionId: asset.sectionId!, fileName: asset.fileName, sourceFormat: String(meta.sourceFormat), ...(origin ? { origin } : {}) };
}
async function serial<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(action); locks.set(key, current);
  try { return await current; } finally { if (locks.get(key) === current) locks.delete(key); }
}
async function writeObject(scope: PsdScope, directory: string, fileName: string, buffer: Buffer) {
  const relative = path.join(directory, `${randomUUID()}-${fileName}`);
  const target = path.join(scope.storageRoot, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const handle = await fs.open(target, "wx");
  let verified = false;
  try {
    await handle.writeFile(buffer); await handle.sync();
    const stored = await fs.readFile(target);
    if (hash(stored) !== hash(buffer)) throw new PsdError(500, "storage_verification_failed", "存储文件校验失败");
    verified = true;
  } finally { await handle.close(); if (!verified) await fs.unlink(target); }
  return relative;
}
async function removeObjects(scope: PsdScope, paths: string[]) {
  for (const relative of paths) await fs.unlink(path.join(scope.storageRoot, relative));
}
async function checkQuota(scope: PsdScope, addedBytes: number) {
  const assets = await scope.db.productAsset.findMany({ select: { filePath: true } });
  const seen = new Set<string>(); let used = 0;
  try {
    const root = assets.length ? await fs.realpath(scope.storageRoot) : path.resolve(scope.storageRoot);
    for (const asset of assets) {
      const file = await fs.realpath(path.resolve(scope.storageRoot, asset.filePath));
      if (!file.startsWith(root + path.sep)) throw new PsdError(409, "invalid_file_path", "已登记素材的存储路径无效，请联系管理员检查");
      if (seen.has(file)) continue;
      const stat = await fs.stat(file);
      if (!stat.isFile()) throw new PsdError(409, "invalid_file_path", "已登记素材不是有效文件，请联系管理员检查");
      seen.add(file); used += stat.size;
    }
  } catch (error) {
    if (error instanceof PsdError) throw error;
    throw new PsdError(503, "storage_inspection_failed", "无法核对已有素材的实际占用，请先下载当前 PSD 并联系管理员检查存储");
  }
  if (used + addedBytes > scope.maxStoredBytes) throw new PsdError(413, "storage_quota_exceeded", "PSD 存储额度不足，请先下载文件并联系管理员");
}

export async function getPsdSession(scope: PsdScope, sessionId: string): Promise<PsdSession> {
  identity(scope);
  const asset = await scope.db.productAsset.findUnique({ where: { id: id(sessionId) } });
  const meta = metadata(asset?.metadata);
  if (!asset || !asset.sectionId || meta.psdSession !== true || meta.ownerId !== scope.userId) throw new PsdError(404, "session_not_found", "精修会话不存在或不属于当前用户");
  const section = await scope.db.pageSection.findFirst({ where: { id: asset.sectionId, projectId: asset.projectId } });
  if (!section) throw new PsdError(404, "section_not_found", "商品模块不存在");
  return describeSession(asset);
}

export async function createPsdSession(scope: PsdScope, input: { requestId: string; projectId: string; sectionId: string; fileName: string; format: "psd" | "png" | "jpg"; source: Buffer; origin?: PsdOrigin }): Promise<PsdSession> {
  identity(scope); validatePsdInput(input.source, input.format);
  const section = await scope.db.pageSection.findFirst({ where: { id: id(input.sectionId), projectId: id(input.projectId) } });
  if (!section) throw new PsdError(404, "section_not_found", "商品或模块不存在");
  return serial(scope.storageRoot, async () => {
    const sessionId = `psds_${requestId(input.requestId)}`;
    const existing = await scope.db.productAsset.findUnique({ where: { id: sessionId } });
    if (existing) {
      const meta = metadata(existing.metadata);
      const previousOrigin = originMetadata(meta.origin);
      const sameOrigin = ["projectId", "moduleId", "sourceAssetId", "sourceVersionId"].every((key) => metadata(previousOrigin)[key] === metadata(input.origin)[key]);
      if (!sameOrigin || meta.ownerId !== scope.userId || meta.checksum !== hash(input.source) || existing.projectId !== section.projectId || existing.sectionId !== section.id) throw new PsdError(409, "idempotency_conflict", "此来源保存标识已用于不同内容");
      return getPsdSession(scope, sessionId);
    }
    await checkQuota(scope, input.source.length);
    const sourcePath = await writeObject(scope, path.join("uploads", input.projectId), `source.${input.format}`, input.source);
    try {
      await scope.db.productAsset.create({ data: { id: sessionId, projectId: section.projectId, sectionId: section.id, type: "REFERENCE", filePath: sourcePath,
        fileName: path.basename(input.fileName).slice(0, 200), mimeType: input.format === "psd" ? "image/vnd.adobe.photoshop" : input.format === "png" ? "image/png" : "image/jpeg",
        metadata: { psdSession: true, ownerId: scope.userId, sourceFormat: input.format, checksum: hash(input.source), bytes: input.source.length, ...(input.origin ? { origin: { ...input.origin } } : {}) } } });
    } catch (error) { if (!await scope.db.productAsset.findUnique({ where: { id: sessionId } })) await removeObjects(scope, [sourcePath]); throw error; }
    return getPsdSession(scope, sessionId);
  });
}

export async function listPsdSessions(scope: PsdScope): Promise<PsdSession[]> {
  identity(scope);
  const sources = await scope.db.productAsset.findMany({ where: { type: "REFERENCE" }, orderBy: { createdAt: "desc" } });
  const result: PsdSession[] = [];
  for (const asset of sources) {
    const meta = metadata(asset.metadata);
    if (meta.psdSession === true && meta.ownerId === scope.userId && asset.sectionId) result.push(describeSession(asset));
  }
  return result;
}
function versionSnapshot(snapshot: unknown, sessionId: string, userId: string): PsdVersion | null {
  const value = metadata(metadata(snapshot).psd);
  return value.schemaVersion === 1 && value.sessionId === sessionId && value.createdBy === userId ? value as unknown as PsdVersion : null;
}
export async function listPsdVersions(scope: PsdScope, sessionId: string): Promise<PsdVersion[]> {
  const session = await getPsdSession(scope, sessionId);
  const versions = await scope.db.sectionVersion.findMany({ where: { sectionId: session.sectionId }, orderBy: { versionNumber: "desc" } });
  return versions.flatMap((version) => { const value = versionSnapshot(version.promptSnapshot, sessionId, scope.userId); return value ? [value] : []; });
}

export async function savePsdVersion(scope: PsdScope, sessionId: string, input: { requestId: string; parentVersionId: string | null; psd: Buffer; preview: Buffer; activate?: { expectedAssetId: string } }): Promise<PsdVersion> {
  const session = await getPsdSession(scope, sessionId);
  const versionId = `psdv_${requestId(input.requestId)}`;
  validatePsdInput(input.psd, "psd"); validatePsdInput(input.preview, "png");
  // Decode the preview, rather than trusting dimensions supplied by the browser.
  const { default: sharp } = await import("sharp");
  const preview = sharp(input.preview, { limitInputPixels: 64_000_000 });
  const decoded = await preview.metadata();
  await preview.stats();
  const width = input.psd.readUInt32BE(18), height = input.psd.readUInt32BE(14);
  if (width !== decoded.width || height !== decoded.height) throw new PsdError(400, "dimension_mismatch", "PSD 与预览图尺寸不一致");
  const checksum = hash(input.psd), previewChecksum = hash(input.preview);
  return serial(scope.storageRoot, async () => {
    const existing = await scope.db.sectionVersion.findUnique({ where: { id: versionId } });
    if (existing) {
      const version = versionSnapshot(existing.promptSnapshot, sessionId, scope.userId);
      if (!version || version.checksum !== checksum || version.previewChecksum !== previewChecksum || version.parentVersionId !== input.parentVersionId || version.baseAssetId !== input.activate?.expectedAssetId) throw new PsdError(409, "idempotency_conflict", "此保存标识已用于不同内容");
      return version;
    }
    if (input.parentVersionId && !(await listPsdVersions(scope, sessionId)).some((version) => version.id === input.parentVersionId)) throw new PsdError(400, "invalid_parent_version", "父版本不属于当前精修会话");
    await checkQuota(scope, input.psd.length + input.preview.length);
    const objects: string[] = [];
    let committed = false;
    try {
      objects.push(await writeObject(scope, path.join("exports", session.projectId, session.sectionId), "refined.psd", input.psd));
      objects.push(await writeObject(scope, path.join("generated", session.projectId, session.sectionId), "preview.png", input.preview));
      const result = await scope.db.$transaction(async (tx) => {
        const number = ((await tx.sectionVersion.aggregate({ where: { sectionId: session.sectionId }, _max: { versionNumber: true } }))._max.versionNumber ?? 0) + 1;
        const psdAssetId = `psda_${randomUUID()}`, previewAssetId = `psda_${randomUUID()}`;
        const version: PsdVersion = { id: versionId, sessionId, versionNumber: number, parentVersionId: input.parentVersionId, width, height, checksum, previewChecksum,
          psdAssetId, previewAssetId, createdAt: new Date().toISOString(), createdBy: scope.userId, ...(session.origin ? { origin: session.origin } : {}), ...(input.activate ? { baseAssetId: input.activate.expectedAssetId } : {}) };
        await tx.productAsset.create({ data: { id: psdAssetId, projectId: session.projectId, sectionId: session.sectionId, type: "EXPORTED", filePath: objects[0], fileName: "refined.psd", mimeType: "image/vnd.adobe.photoshop", metadata: { ownerId: scope.userId, sessionId, checksum, bytes: input.psd.length } } });
        await tx.productAsset.create({ data: { id: previewAssetId, projectId: session.projectId, sectionId: session.sectionId, type: "GENERATED", filePath: objects[1], fileName: "preview.png", mimeType: "image/png", metadata: { ownerId: scope.userId, sessionId, checksum: previewChecksum, bytes: input.preview.length, mode: "psd_refine" } } });
        const { origin, ...versionFields } = version;
        await tx.sectionVersion.create({ data: { id: versionId, sectionId: session.sectionId, versionNumber: number, promptSnapshot: { psd: { schemaVersion: 1, ...versionFields, ...(origin ? { origin: { ...origin } } : {}) } }, copySnapshot: { sourceAssetId: sessionId }, imageAssetId: previewAssetId, isActive: false } });
        if (input.activate) {
          const updated = await tx.pageSection.updateMany({ where: { id: session.sectionId, projectId: session.projectId, currentImageAssetId: input.activate.expectedAssetId, status: { not: "GENERATING" } }, data: { currentImageAssetId: previewAssetId, status: "SUCCESS" } });
          if (updated.count !== 1) throw new PsdError(409, "module_changed", "模块当前图片已变化或正在生成，请保留 PSD 后重新打开模块");
          await tx.sectionVersion.updateMany({ where: { sectionId: session.sectionId }, data: { isActive: false } });
          await tx.sectionVersion.update({ where: { id: versionId }, data: { isActive: true } });
        }
        return version;
      });
      committed = true;
      return result;
    } finally {
      // If commit acknowledgement is uncertain, keep files belonging to a durable
      // row. If the database is unavailable, preserve them for a keyed retry.
      if (!committed && !await scope.db.sectionVersion.findUnique({ where: { id: versionId } })) await removeObjects(scope, objects);
    }
  });
}

export async function readPsdVersionFile(scope: PsdScope, sessionId: string, versionId: string, format: "psd" | "png") {
  const version = (await listPsdVersions(scope, sessionId)).find((item) => item.id === id(versionId));
  if (!version) throw new PsdError(404, "version_not_found", "精修版本不存在");
  const asset = await scope.db.productAsset.findUnique({ where: { id: format === "psd" ? version.psdAssetId : version.previewAssetId } });
  return readVerifiedAsset(scope, asset, format === "psd" ? version.checksum : version.previewChecksum);
}
export async function readPsdSourceFile(scope: PsdScope, sessionId: string) {
  await getPsdSession(scope, sessionId);
  const asset = await scope.db.productAsset.findUnique({ where: { id: sessionId } });
  return readVerifiedAsset(scope, asset, String(metadata(asset?.metadata).checksum));
}
async function readVerifiedAsset(scope: PsdScope, asset: { filePath: string; metadata: unknown } | null, checksum: string) {
  if (!asset || metadata(asset.metadata).ownerId !== scope.userId) throw new PsdError(404, "asset_not_found", "精修文件不存在");
  const absolute = path.resolve(scope.storageRoot, asset.filePath);
  if (!absolute.startsWith(path.resolve(scope.storageRoot) + path.sep)) throw new PsdError(400, "invalid_file_path", "文件路径无效");
  const buffer = await fs.readFile(absolute);
  if (hash(buffer) !== checksum) throw new PsdError(409, "checksum_mismatch", "文件校验失败，请勿恢复此版本");
  return buffer;
}
