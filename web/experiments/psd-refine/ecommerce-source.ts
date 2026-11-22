import { PsdError, validatePsdInput, type PsdOrigin } from "../../../apps/xc-aimutu/upstream/lib/services/psd-refinement";

export interface EcommerceProject { id: string; name: string }
export interface EcommerceModule { id: string; title: string; assetId: string | null; sourceVersionId: string | null }
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {};
function text(value: unknown) {
    if (typeof value !== "string" || !value.trim()) throw new PsdError(502, "invalid_ecommerce_response", "电商数据响应不完整");
    return value;
}
export function ecommerceId(value: unknown) {
    const result = text(value);
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(result)) throw new PsdError(400, "invalid_ecommerce_id", "商品或模块 ID 无效");
    return result;
}
export function projectList(value: unknown): EcommerceProject[] {
    if (!Array.isArray(value)) throw new PsdError(502, "invalid_ecommerce_response", "商品列表响应无效");
    return value.map((item) => { const project = object(item); return { id: ecommerceId(project.id), name: text(project.name) }; });
}
function projectDetail(value: unknown, projectId: string) {
    const project = object(value);
    if (project.id !== projectId || !Array.isArray(project.sections)) throw new PsdError(404, "project_not_found", "商品不存在或无权访问");
    return project;
}
function sourceVersion(section: ObjectValue, assetId: string) {
    const versions = (Array.isArray(section.versions) ? section.versions : []).map(object).filter((version) => version.imageAssetId === assetId && version.sectionId === section.id);
    const version = versions.find((item) => item.isActive === true) ?? versions[0];
    return version ? ecommerceId(version.id) : null;
}
export function moduleList(value: unknown, projectId: string): EcommerceModule[] {
    const project = projectDetail(value, projectId);
    return (project.sections as unknown[]).map((value) => {
        const section = object(value);
        if (section.projectId !== projectId) throw new PsdError(502, "invalid_ecommerce_response", "模块商品关联无效");
        const assetId = typeof section.currentImageAssetId === "string" && section.currentImageAssetId ? ecommerceId(section.currentImageAssetId) : null;
        return { id: ecommerceId(section.id), title: text(section.title), assetId, sourceVersionId: assetId ? sourceVersion(section, assetId) : null };
    });
}
export function resolveModuleSource(value: unknown, projectId: string, moduleId: string, expectedAssetId: string) {
    const project = projectDetail(value, ecommerceId(projectId));
    const section = (project.sections as unknown[]).map(object).find((item) => item.id === ecommerceId(moduleId));
    if (!section || section.projectId !== projectId) throw new PsdError(404, "module_not_found", "模块不属于所选商品");
    if (!section.currentImageAssetId) throw new PsdError(400, "module_has_no_image", "当前模块尚无可精修图像");
    if (section.currentImageAssetId !== ecommerceId(expectedAssetId)) throw new PsdError(409, "source_changed", "模块当前图像已变化，请重新读取模块后再载入");
    const asset = object(section.currentImageAsset);
    if (asset.id !== expectedAssetId || asset.projectId !== projectId || (asset.sectionId != null && asset.sectionId !== moduleId)) throw new PsdError(403, "asset_scope_mismatch", "图像素材不属于当前商品模块");
    const origin: PsdOrigin = { projectId, moduleId, sourceAssetId: expectedAssetId, sourceVersionId: sourceVersion(section, expectedAssetId), projectName: text(project.name), moduleName: text(section.title) };
    return { origin, fileName: text(asset.fileName), filePath: text(asset.filePath) };
}
export function ecommerceFilePath(filePath: string) {
    const segments = filePath.replaceAll("\\", "/").split("/");
    if (segments.some((item) => !item || item === "." || item === ".." || /[:\u0000-\u001f]/.test(item))) throw new PsdError(400, "invalid_source_path", "商品图像路径无效");
    return `/motu/api/files/${segments.map(encodeURIComponent).join("/")}`;
}
async function request(path: string, cookie: string) {
    const response = await fetch(new URL(path, "http://127.0.0.1:3000"), { headers: { Cookie: cookie }, redirect: "error", signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new PsdError([401, 403, 404].includes(response.status) ? response.status : 502, "ecommerce_read_failed", "无法读取当前账号的电商商品或图像");
    return response;
}
async function limitedBytes(response: Response, max: number) {
    if (Number(response.headers.get("content-length")) > max || !response.body) throw new PsdError(413, "source_too_large", "商品数据或图像超过本次读取限制");
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
        for (;;) {
            const item = await reader.read(); if (item.done) break;
            size += item.value.byteLength;
            if (size > max) { await reader.cancel(); throw new PsdError(413, "source_too_large", "商品数据或图像超过本次读取限制"); }
            chunks.push(item.value);
        }
    } finally { reader.releaseLock(); }
    return Buffer.concat(chunks);
}
export async function readEcommerceJson(path: string, cookie: string): Promise<unknown> {
    const response = await request(path, cookie);
    const raw = await limitedBytes(response, 16 * 1024 * 1024);
    let payload: ObjectValue;
    try { payload = object(JSON.parse(raw.toString("utf8"))); }
    catch { throw new PsdError(502, "invalid_ecommerce_response", "电商接口未返回有效 JSON"); }
    if (payload.success !== true) throw new PsdError(502, "ecommerce_read_failed", "电商接口未返回成功结果");
    return payload.data;
}
export async function readEcommerceSource(filePath: string, cookie: string): Promise<{ buffer: Buffer; format: "psd" | "png" | "jpg" }> {
    const buffer = await limitedBytes(await request(ecommerceFilePath(filePath), cookie), 50 * 1024 * 1024);
    const format = buffer.toString("ascii", 0, 4) === "8BPS" ? "psd" : buffer[0] === 137 ? "png" : buffer[0] === 255 ? "jpg" : null;
    if (!format) throw new PsdError(400, "unsupported_source_format", "当前模块图像暂不支持精修，请先导出 PNG 或 JPG 后导入");
    validatePsdInput(buffer, format);
    return { buffer, format };
}
