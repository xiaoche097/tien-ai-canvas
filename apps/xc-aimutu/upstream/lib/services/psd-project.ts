import fs from "node:fs/promises";
import path from "node:path";
import { createPsdSession, getPsdSession, listPsdVersions, PsdError, validatePsdInput, type PsdScope, type PsdVersion } from "./psd-refinement";

export async function modulePsdSession(scope: PsdScope, projectId: string, sectionId: string, input: { requestId: string; expectedAssetId: string; file?: { name: string; source: Buffer }; recoveryMode?: "new" | "resume"; recoveryVersionId?: string }) {
  const section = await scope.db.pageSection.findFirst({ where: { id: sectionId, projectId }, include: { project: true, currentImageAsset: true } });
  if (!section?.currentImageAsset || section.currentImageAsset.projectId !== projectId || (section.currentImageAsset.sectionId && section.currentImageAsset.sectionId !== sectionId)) throw new PsdError(404, "source_not_found", "商品模块当前图片不存在");
  if (section.currentImageAssetId !== input.expectedAssetId || section.status === "GENERATING") throw new PsdError(409, "module_changed", "模块图片已变化或正在生成，请刷新后重试");
  const active = await scope.db.sectionVersion.findFirst({ where: { sectionId, imageAssetId: input.expectedAssetId, isActive: true } });
  const saved = (active?.promptSnapshot as { psd?: PsdVersion } | null)?.psd;
  if (input.file) {
    validatePsdInput(input.file.source, "psd");
    const session = await createPsdSession(scope, { requestId: input.requestId, projectId, sectionId, fileName: input.file.name, format: "psd", source: input.file.source,
      origin: { projectId, moduleId: sectionId, sourceAssetId: input.expectedAssetId, sourceVersionId: active?.id ?? null, projectName: section.project.name, moduleName: section.title } });
    return { session, versions: [], versionId: null, expectedAssetId: input.expectedAssetId };
  }
  if (saved?.sessionId) {
    const session = await getPsdSession(scope, saved.sessionId);
    if (session.projectId !== projectId || session.sectionId !== sectionId) throw new PsdError(404, "session_not_found", "精修来源不属于当前模块");
    const versions = await listPsdVersions(scope, session.id);
    if (!versions.some((version) => version.id === active!.id)) throw new PsdError(409, "version_not_found", "当前 PSD 版本记录无效");
    return { session, versions, versionId: active!.id, expectedAssetId: input.expectedAssetId };
  }
  if (input.recoveryMode !== "new") {
    const history = await scope.db.sectionVersion.findMany({ where: { sectionId }, orderBy: { versionNumber: "desc" } });
    for (const record of history) {
      const version = (record.promptSnapshot as { psd?: PsdVersion } | null)?.psd;
      if (!version || version.createdBy !== scope.userId || version.id !== record.id || version.previewAssetId !== record.imageAssetId || version.origin?.projectId !== projectId || version.origin?.moduleId !== sectionId || version.origin?.sourceAssetId !== input.expectedAssetId) continue;
      const session = await getPsdSession(scope, version.sessionId);
      if (session.projectId !== projectId || session.sectionId !== sectionId || session.origin?.sourceAssetId !== input.expectedAssetId) throw new PsdError(409, "invalid_origin_metadata", "已有精修的来源记录不一致");
      const recovery = { session, versions: await listPsdVersions(scope, session.id), versionId: version.id, expectedAssetId: input.expectedAssetId };
      if (input.recoveryMode === "resume") {
        if (input.recoveryVersionId !== version.id) throw new PsdError(409, "recovery_changed", "已有精修版本已变化，请重新进入模块确认");
        return recovery;
      }
      return { recovery };
    }
    if (input.recoveryMode === "resume") throw new PsdError(409, "recovery_not_found", "当前来源没有可恢复的精修版本");
  }
  const absolute = path.resolve(scope.storageRoot, section.currentImageAsset.filePath);
  if (!absolute.startsWith(path.resolve(scope.storageRoot) + path.sep)) throw new PsdError(400, "invalid_file_path", "原文件路径无效");
  const stat = await fs.stat(absolute);
  if (!stat.isFile() || stat.size > 50 * 1024 * 1024) throw new PsdError(413, "invalid_file_size", "源文件须不超过 50 MB");
  let source: Buffer = await fs.readFile(absolute);
  let fileName = section.currentImageAsset.fileName;
  if (source.toString("ascii", 0, 4) === "RIFF" && source.toString("ascii", 8, 12) === "WEBP") {
    try {
      const { default: sharp } = await import("sharp");
      const image = sharp(source, { limitInputPixels: 64_000_000 });
      const info = await image.metadata();
      if ((info.pages ?? 1) > 1) throw new PsdError(400, "unsupported_animation", "动画 WebP 暂不支持精修，请先导出静态图片");
      source = await image.png().toBuffer();
      fileName = `${path.parse(fileName).name}.png`;
    } catch (error) {
      if (error instanceof PsdError) throw error;
      throw new PsdError(400, "invalid_webp", "WebP 图片无法解码或尺寸过大，请先转换为 PNG 后重试");
    }
  }
  const format = source.toString("ascii", 0, 4) === "8BPS" ? "psd" : source.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "png" : source[0] === 255 && source[1] === 216 ? "jpg" : null;
  if (!format) throw new PsdError(400, "unsupported_source", "当前精修支持 PSD / PNG / JPG / 静态 WebP；其他格式请先转换");
  const session = await createPsdSession(scope, { requestId: input.requestId, projectId, sectionId, fileName, format, source,
    origin: { projectId, moduleId: sectionId, sourceAssetId: input.expectedAssetId, sourceVersionId: active?.id ?? null, projectName: section.project.name, moduleName: section.title } });
  return { session, versions: await listPsdVersions(scope, session.id), versionId: null, expectedAssetId: input.expectedAssetId };
}

export async function verifyModulePsdSession(scope: PsdScope, projectId: string, sectionId: string, sessionId: string) {
  const session = await getPsdSession(scope, sessionId);
  if (session.projectId !== projectId || session.sectionId !== sectionId) throw new PsdError(404, "session_not_found", "精修会话不属于当前商品模块");
  return session;
}
