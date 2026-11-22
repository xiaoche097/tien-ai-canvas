import { http } from "../../src/services/api/request";
import type { PsdSession, PsdVersion } from "../../../apps/xc-aimutu/upstream/lib/services/psd-refinement";
export type { PsdSession, PsdVersion };
import type { EcommerceProject, EcommerceModule } from "./ecommerce-source";
export type { EcommerceProject, EcommerceModule };
const base = "/psd-lab/sessions";
export function ecommerceProjects(signal?: AbortSignal) { return http.get<{ projects: EcommerceProject[] }>("/psd-lab/projects", { signal }); }
export function ecommerceModules(projectId: string, signal?: AbortSignal) { return http.get<{ modules: EcommerceModule[] }>(`/psd-lab/projects/${encodeURIComponent(projectId)}/modules`, { signal }); }
export function importEcommerceModule(projectId: string, moduleId: string, expectedAssetId: string, requestId: string, signal?: AbortSignal) {
    const form = new FormData(); form.append("expectedAssetId", expectedAssetId); form.append("requestId", requestId);
    return http.post<{ session: PsdSession }>(`/psd-lab/projects/${encodeURIComponent(projectId)}/modules/${encodeURIComponent(moduleId)}/import`, form, { signal, timeout: 60000 });
}
export async function importedModuleFile(sessionId: string, signal?: AbortSignal) {
    return (await http.raw<ArrayBuffer>({ url: `${base}/${encodeURIComponent(sessionId)}/source`, method: "GET", responseType: "arraybuffer", signal, timeout: 60000 })).data;
}
export function savedPsdSessions(signal?: AbortSignal) { return http.get<{ userId: string; sessions: PsdSession[] }>(base, { signal }); }
export async function findSavedModuleVersion(projectId: string, moduleId: string, assetId: string, signal?: AbortSignal) {
    const { sessions } = await savedPsdSessions(signal);
    for (const session of sessions) {
        const origin = session.origin;
        if (!origin || origin.projectId !== projectId || origin.moduleId !== moduleId || origin.sourceAssetId !== assetId) continue;
        const { versions } = await savedPsdVersions(session.id, signal);
        const version = versions[0];
        if (version) return { session, version };
    }
    return null;
}
export function savedPsdVersions(sessionId: string, signal?: AbortSignal) { return http.get<{ versions: PsdVersion[] }>(`${base}/${encodeURIComponent(sessionId)}/versions`, { signal }); }
export function startPsdSession(source: ArrayBuffer, format: string, fileName: string, requestId: string, signal?: AbortSignal) {
    const form = new FormData(); form.append("source", new Blob([source]), fileName); form.append("format", format); form.append("fileName", fileName);
    form.append("requestId", requestId);
    return http.post<{ session: PsdSession }>(base, form, { timeout: 60000, signal });
}
export interface PsdSaveSnapshot { sessionId: string; requestId: string; parentVersionId: string | null; psd: ArrayBuffer; preview: ArrayBuffer }
export function persistPsdVersion(snapshot: PsdSaveSnapshot, signal?: AbortSignal) {
    const form = new FormData(); form.append("psd", new Blob([snapshot.psd], { type: "image/vnd.adobe.photoshop" }), "refined.psd");
    form.append("preview", new Blob([snapshot.preview], { type: "image/png" }), "preview.png"); form.append("requestId", snapshot.requestId);
    if (snapshot.parentVersionId) form.append("parentVersionId", snapshot.parentVersionId);
    return http.post<{ version: PsdVersion }>(`${base}/${encodeURIComponent(snapshot.sessionId)}/versions`, form, { timeout: 120000, signal });
}
export async function savedVersionFile(sessionId: string, versionId: string, format: "psd" | "png", signal?: AbortSignal) {
    const response = await http.raw<ArrayBuffer>({ url: `${base}/${encodeURIComponent(sessionId)}/versions/${encodeURIComponent(versionId)}/${format}`, method: "GET", responseType: "arraybuffer", timeout: 60000, signal });
    return response.data;
}
