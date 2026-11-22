import path from "node:path";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/utils/env";
import { fail, handleRouteError, ok } from "@/lib/utils/route";
import { getPsdSession, listPsdVersions, PsdError, readPsdSourceFile, readPsdVersionFile, savePsdVersion, type PsdScope } from "@/lib/services/psd-refinement";
import { modulePsdSession, verifyModulePsdSession } from "@/lib/services/psd-project";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: { id: string; sectionId: string; action?: string[] } };
function scope(): PsdScope {
  const userId = headers().get("x-canvas-user-id");
  const maxStoredBytes = Number(process.env.MOTU_PSD_STORAGE_LIMIT_BYTES);
  if (process.env.CANVAS_INTEGRATION !== "1" || !userId) throw new PsdError(401, "authentication_required", "请登录境彻后使用商品精修");
  if (!Number.isSafeInteger(maxStoredBytes) || maxStoredBytes <= 0) throw new PsdError(503, "storage_limit_unconfigured", "管理员尚未配置 PSD 存储上限");
  return { userId, db: prisma, storageRoot: path.resolve(env.STORAGE_ROOT), maxStoredBytes };
}
function failure(error: unknown) { return error instanceof PsdError ? fail(error.reason, error.message, null, error.status) : handleRouteError(error); }
async function form(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new PsdError(400, "missing_body", "缺少保存内容");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 101 * 1024 * 1024) { await reader.cancel(); throw new PsdError(413, "request_too_large", "保存内容超过 101 MB"); }
    chunks.push(value);
  }
  return new Request(request.url, { method: "POST", headers: { "Content-Type": request.headers.get("content-type") ?? "" }, body: Buffer.concat(chunks) }).formData();
}
export async function GET(_request: Request, { params }: Context) {
  try {
    const current = scope(), [sessionId, resource, versionId, format] = params.action ?? [];
    await verifyModulePsdSession(current, params.id, params.sectionId, sessionId);
    if (resource === "versions" && !versionId) return ok(await listPsdVersions(current, sessionId));
    const source = resource === "source" && !versionId;
    if (!source && !(resource === "versions" && versionId && (format === "psd" || format === "png"))) throw new PsdError(404, "not_found", "文件不存在");
    const session = await getPsdSession(current, sessionId);
    const extension = source ? session.sourceFormat : format;
    const buffer = source ? await readPsdSourceFile(current, sessionId) : await readPsdVersionFile(current, sessionId, versionId, format as "psd" | "png");
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": extension === "psd" ? "image/vnd.adobe.photoshop" : extension === "png" ? "image/png" : "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": `attachment; filename="refined-${source ? "source" : versionId}.${extension}"` } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    if (request.headers.get("origin") !== `http://${request.headers.get("host")}` && request.headers.get("origin") !== `https://${request.headers.get("host")}`) throw new PsdError(403, "origin_rejected", "请从当前网站提交精修操作");
    const current = scope(), [sessionId, resource] = params.action ?? [];
    if (!sessionId) {
      if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
        const data = await form(request), file = data.get("file"), requestId = data.get("requestId"), expectedAssetId = data.get("expectedAssetId");
        if (!(file instanceof File) || typeof requestId !== "string" || typeof expectedAssetId !== "string" || !expectedAssetId) throw new PsdError(400, "invalid_input", "缺少 PSD 文件或模块来源标识");
        if (!file.size || file.size > 50 * 1024 * 1024) throw new PsdError(413, "invalid_file_size", "PSD 文件须大于 0 且不超过 50 MB");
        return ok(await modulePsdSession(current, params.id, params.sectionId, { requestId, expectedAssetId, file: { name: file.name, source: Buffer.from(await file.arrayBuffer()) } }));
      }
      const body = await request.json();
      if (typeof body.requestId !== "string" || typeof body.expectedAssetId !== "string") throw new PsdError(400, "invalid_input", "缺少来源标识");
      if ((body.recoveryMode !== undefined && body.recoveryMode !== "new" && body.recoveryMode !== "resume") || (body.recoveryVersionId !== undefined && typeof body.recoveryVersionId !== "string")) throw new PsdError(400, "invalid_input", "精修恢复选项无效");
      return ok(await modulePsdSession(current, params.id, params.sectionId, { requestId: body.requestId, expectedAssetId: body.expectedAssetId, recoveryMode: body.recoveryMode, recoveryVersionId: body.recoveryVersionId }));
    }
    await verifyModulePsdSession(current, params.id, params.sectionId, sessionId);
    if (resource !== "versions") throw new PsdError(404, "not_found", "操作不存在");
    const data = await form(request);
    const psd = data.get("psd"), preview = data.get("preview"), requestId = data.get("requestId"), expectedAssetId = data.get("expectedAssetId"), parent = data.get("parentVersionId");
    if (!(psd instanceof File) || !(preview instanceof File) || typeof requestId !== "string" || typeof expectedAssetId !== "string" || !expectedAssetId || (parent !== null && typeof parent !== "string")) throw new PsdError(400, "invalid_input", "精修保存参数无效");
    return ok(await savePsdVersion(current, sessionId, { requestId, parentVersionId: parent || null, psd: Buffer.from(await psd.arrayBuffer()), preview: Buffer.from(await preview.arrayBuffer()), activate: { expectedAssetId } }));
  } catch (error) { return failure(error); }
}
