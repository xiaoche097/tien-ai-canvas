import { astraviaEndpoint, connectAstravia, disconnectAstravia, getAstraviaStatus, type AstraviaConnection, type AstraviaStatus } from "./api/astravia";

export type AstraviaDesktopStatus = AstraviaStatus & { configured: boolean; ready?: boolean; connected: boolean; serverName?: string; message?: string };
const desktopURL = "http://127.0.0.1:18765";

// Separate local desktop protocol: it cannot use the backend's cookie/API transport.
// Keep credentials in memory only and never include them in URLs or errors.
async function desktop<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${desktopURL}${path}`, {
            method: body ? "POST" : "GET",
            headers: body ? { "Content-Type": "application/json" } : undefined,
            body: body ? JSON.stringify(body) : undefined,
            credentials: "omit",
            redirect: "error",
            signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(body ? 300_000 : 10_000)]) : AbortSignal.timeout(10_000),
        });
    } catch {
        throw new Error("未连接到本机连接程序。请先运行 scripts/start-astravia-connector.ps1，并允许浏览器访问本地网络。");
    }
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.message === "string" ? result.message : "Astravia 本机连接失败");
    return result as T;
}

export async function inspectAstravia(canvasId: string, signal?: AbortSignal): Promise<AstraviaDesktopStatus> {
    const status = await getAstraviaStatus(canvasId, signal);
    try {
        const local = await desktop<{ configured: boolean; ready: boolean; connected: boolean; serverName?: string; message?: string }>(`/status?id=${encodeURIComponent(status.id)}&endpoint=${encodeURIComponent(astraviaEndpoint(status.id))}`, undefined, signal);
        return { ...status, configured: local.configured, ready: status.authorized && local.ready, connected: status.authorized && local.connected === true, serverName: local.serverName, message: local.message };
    } catch (cause) {
        return { ...status, configured: false, connected: false, message: cause instanceof Error ? cause.message : "本机连接不可用" };
    }
}

export async function linkAstravia(canvasId: string, signal: AbortSignal): Promise<AstraviaDesktopStatus> {
    const existing = await inspectAstravia(canvasId, signal);
    if (existing.connected || (existing.configured && existing.ready)) return existing;
    await desktop("/status", undefined, signal);
    const connection: AstraviaConnection = await connectAstravia(canvasId, signal);
    try {
        const result=await desktop<{connected:boolean;ready:boolean;message?:string}>("/connect", connection, signal);
        return { id: connection.id, authorized: true, configured: true, ready:result.ready, connected:result.connected===true, message:result.message, expiresAt: connection.expiresAt };
    } catch (cause) {
        try { await disconnectAstravia(canvasId); } catch { throw new Error("连接未完成，服务端授权未能撤销。请打开连接面板撤销授权。"); }
        throw cause;
    }
}

export async function unlinkAstravia(canvasId: string, id: string) {
    await disconnectAstravia(canvasId);
    try {
        await desktop("/disconnect", { id });
        return {};
    } catch {
        return { warning: "服务端授权已撤销。本机连接程序不可用，凭据文件尚未清理；该凭据已无法访问境彻。" };
    }
}
