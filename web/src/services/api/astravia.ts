import { apiBaseURL, http } from "./request";

export type AstraviaStatus = {
    id: string;
    authorized: boolean;
    expiresAt?: string;
};

export type AstraviaConnection = { id: string; url: string; token: string; expiresAt: string };

export function astraviaEndpoint(id: string) {
    return `${new URL(apiBaseURL, window.location.origin).href.replace(/\/$/, "")}/integrations/astravia/mcp/${encodeURIComponent(id)}`;
}

export function getAstraviaStatus(canvasId: string, signal?: AbortSignal) {
    return http.get<AstraviaStatus>("/integrations/astravia", { params: { canvasId }, signal, timeout: 10_000 });
}

export function connectAstravia(canvasId: string, signal?: AbortSignal) {
    const apiBaseUrl = new URL(apiBaseURL, window.location.origin).href.replace(/\/$/, "");
    return http.post<AstraviaConnection>("/integrations/astravia", { canvasId, apiBaseUrl }, { signal, timeout: 15_000 });
}

export function disconnectAstravia(canvasId: string) {
    return http.delete<{ revoked: boolean }>("/integrations/astravia", { params: { canvasId } });
}
