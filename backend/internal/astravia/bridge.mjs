import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";

// Credentials can rotate while Astravia keeps this MCP process alive.
// stdout is exclusively MCP JSONL; status files never contain credentials or prompts.
const configPath = process.argv[2];
const runtimePath = join(dirname(configPath), `runtime-${process.pid}.json`);
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
let version = "2025-06-18";
let heartbeat;
let lastOrigin = "";
let warned = false;
let initialized = false;
let statusWrite = Promise.resolve();
let heartbeatTask = Promise.resolve();

function status(connected) {
    statusWrite = statusWrite.then(async () => {
    try {
        const temporary = `${runtimePath}.tmp`;
        await writeFile(temporary, JSON.stringify({ pid: process.pid, connected, origin: lastOrigin, lastSeenAt: new Date().toISOString() }), { mode: 0o600 });
        await rename(temporary, runtimePath);
    } catch {
        if (!warned) { process.stderr.write("Jingche connection status file unavailable\n"); warned = true; }
    }
    });
    return statusWrite;
}

async function forward(request, timeout = 60_000) {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    const endpoint = new URL(config.url);
    if (endpoint.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || typeof config.token !== "string" || !config.token) throw new Error("Invalid local connection");
    lastOrigin = endpoint.origin;
    const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${config.token}`, "MCP-Protocol-Version": version },
        body: JSON.stringify(request), redirect: "error", signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) throw new Error(response.status === 401 ? "authorization" : "unavailable");
    if (response.status === 202) return;
    const result = await response.json();
    if (result.jsonrpc !== "2.0") throw new Error("protocol");
    return result;
}

try {
    for await (const line of lines) {
        let request;
        try {
            request = JSON.parse(line);
            const result = await forward(request);
            if (request.method === "initialize") {
                if (!result?.result?.protocolVersion || result.result.serverInfo?.name !== "jingche") throw new Error("protocol");
                initialized = true;
                version = result.result.protocolVersion;
                if (!heartbeat) heartbeat = setInterval(() => { heartbeatTask = (async () => {
                    try { await forward({ jsonrpc: "2.0", id: "jingche-heartbeat", method: "ping" }, 5_000); await status(true); }
                    catch { await status(false); }
                })(); }, 15_000);
            }
            await status(initialized);
            if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
        } catch (cause) {
            await status(false);
            if (request && Object.hasOwn(request, "id")) {
                const message = cause?.message === "authorization" ? "境彻授权已更新或失效，请检查当前画布的连接授权。" : "境彻连接不可用，请检查后端与本机连接程序；提交任务失败时先查询结果，勿直接重复生成。";
                process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32000, message } })}\n`);
            }
        }
    }
} finally {
    clearInterval(heartbeat);
    await heartbeatTask;
    await statusWrite;
    await unlink(runtimePath).catch(() => {});
    await unlink(`${runtimePath}.tmp`).catch(() => {});
}
