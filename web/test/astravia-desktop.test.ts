import { afterAll, afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "astravia-transport-"));
const apiPath = join(dir, "api.ts");
writeFileSync(apiPath, `export const calls = []; export const connectAstravia = async () => { calls.push("grant"); return {id:"connection",url:"http://localhost:3000/api/integrations/astravia/mcp/connection",token:"TEST_ONLY_FAKE_TOKEN",expiresAt:"2030-01-01"}; }; export const disconnectAstravia = async () => { calls.push("revoke"); }; export const getAstraviaStatus = async () => ({id:"connection",authorized:true});`);
writeFileSync(apiPath, readFileSync(apiPath,"utf8") + `export const astraviaEndpoint = (id) => "http://localhost:3000/api/integrations/astravia/mcp/" + id;`);
writeFileSync(join(dir, "desktop.ts"), readFileSync(new URL("../src/services/astravia-desktop.ts", import.meta.url), "utf8").replace('"./api/astravia"', JSON.stringify(apiPath)));
const api: typeof import("../src/services/astravia-desktop") = await import(join(dir, "desktop.ts"));
const backend = await import(apiPath);
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; backend.calls.length = 0; });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("missing desktop helper does not create a grant", async () => {
    globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
    await expect(api.linkAstravia("canvas", new AbortController().signal)).rejects.toThrow("本机连接程序");
    expect(backend.calls).toEqual([]);
});

test("refused desktop installation revokes the prepared backend grant", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (url: string) => {
        urls.push(String(url));
        return String(url).endsWith("/connect") ? Response.json({ message: "授权拒绝" }, { status: 503 }) : Response.json({ available: true });
    }) as typeof fetch;
    await expect(api.linkAstravia("canvas", new AbortController().signal)).rejects.toThrow("授权拒绝");
    expect(backend.calls).toEqual(["grant", "revoke"]);
    expect(urls.every((url) => !url.includes("TEST_ONLY_FAKE_TOKEN"))).toBe(true);
});

test("backend authorization remains revocable when the helper is stopped", async () => {
    globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
    const status = await api.inspectAstravia("canvas");
    expect(status.authorized).toBe(true);
    expect(status.configured).toBe(false);
    const result = await api.unlinkAstravia("canvas", status.id);
    expect(backend.calls).toEqual(["revoke"]);
    expect(result.warning).toContain("授权已撤销");
});

test("an existing verified connection is reused without another grant or desktop approval", async () => {
    globalThis.fetch = (async () => Response.json({ configured: true, connected: true, serverName: "境彻" })) as typeof fetch;
    const result = await api.linkAstravia("canvas", new AbortController().signal);
    expect(result.connected).toBe(true);
    expect(result.serverName).toBe("境彻");
    expect(backend.calls).toEqual([]);
});

test("configuration alone never reports a connected state", async () => {
    globalThis.fetch = (async () => Response.json({ configured: true, connected: false, message: "握手失败" })) as typeof fetch;
    const result = await api.inspectAstravia("canvas");
    expect(result.configured).toBe(true);
    expect(result.connected).toBe(false);
    expect(result.message).toBe("握手失败");
});
