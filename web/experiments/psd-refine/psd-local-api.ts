import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import type { PrismaClient } from "../../../apps/xc-aimutu/upstream/node_modules/@prisma/client";
import { createPsdSession, getPsdSession, listPsdSessions, listPsdVersions, savePsdVersion, readPsdVersionFile, readPsdSourceFile, PsdError, type PsdScope } from "../../../apps/xc-aimutu/upstream/lib/services/psd-refinement";
import { ecommerceId, moduleList, projectList, readEcommerceJson, readEcommerceSource, resolveModuleSource } from "./ecommerce-source";

// This adapter exists only in the 3002 dev server, never in the product router.
const prefix = "/api/psd-lab";
const upstream = fileURLToPath(new URL("../../../apps/xc-aimutu/upstream/", import.meta.url));
const dataRoot = fileURLToPath(new URL("../../../.local/project-workbench-debug/psd-refine/", import.meta.url));
const require = createRequire(path.join(upstream, "package.json"));
const clients = new Map<string, PrismaClient>();
const allowedOrigins = new Set(["http://localhost:3002", "http://127.0.0.1:3002"]);

function reply(response: ServerResponse, status: number, data: unknown, msg = "ok", reason?: string) {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    response.end(JSON.stringify({ code: status < 400 ? 0 : status, data, msg, reason }));
}
async function auth(request: IncomingMessage): Promise<PsdScope> {
    const response = await fetch("http://127.0.0.1:3000/api/auth/session", { headers: { Cookie: request.headers.cookie ?? "" }, redirect: "error", signal: AbortSignal.timeout(10000) });
    const payload = await response.json();
    if (!response.ok || payload.code !== 0) throw new PsdError(503, "authentication_unavailable", "无法校验境彻登录态");
    const userId = payload.data?.user?.id;
    if (typeof userId !== "string" || !userId) throw new PsdError(401, "authentication_required", "请先在 localhost:3000 登录境彻，再回到实验页");
    const scopeName = createHash("sha256").update(userId).digest("hex");
    const directory = path.join(dataRoot, "users", scopeName);
    let db = clients.get(directory);
    if (!db) {
        fs.mkdirSync(directory, { recursive: true });
        const dbPath = path.join(directory, "motu.db");
        execFileSync("node", [path.join(upstream, "scripts/apply-prisma-migrations.cjs")], { cwd: upstream, env: { ...process.env, DATABASE_URL: `file:${dbPath.replaceAll("\\", "/")}` }, stdio: "ignore" });
        const { PrismaClient: Client } = require("@prisma/client") as { PrismaClient: new (options: unknown) => PrismaClient };
        db = new Client({ datasources: { db: { url: `file:${dbPath.replaceAll("\\", "/")}` } } }); clients.set(directory, db);
    }
    return { userId, db, storageRoot: path.join(directory, "storage"), maxStoredBytes: 1024 * 1024 * 1024 };
}
async function form(request: IncomingMessage) {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 101 * 1024 * 1024) throw new PsdError(413, "request_too_large", "本地验收请求超过 101 MB 限制");
        chunks.push(Buffer.from(chunk));
    }
    return new Request("http://localhost:3002", { method: "POST", headers: { "Content-Type": request.headers["content-type"] ?? "" }, body: Buffer.concat(chunks) }).formData();
}
async function file(form: FormData, name: string) {
    const value = form.get(name);
    if (!value || typeof value === "string") throw new PsdError(400, "missing_file", "缺少上传文件");
    return Buffer.from(await value.arrayBuffer());
}
async function fixtureModule(scope: PsdScope) {
    const projectId = "psd_lab_fixture", sectionId = "psd_lab_fixture_module";
    await scope.db.project.upsert({ where: { id: projectId }, update: {}, create: { id: projectId, name: "PSD 隔离验收商品", platform: "test", style: "test" } });
    await scope.db.pageSection.upsert({ where: { id: sectionId }, update: {}, create: { id: sectionId, projectId, sectionKey: "psd-lab", type: "CUSTOM", title: "精修验收模块", goal: "隔离保存验证", copy: "", visualPrompt: "", order: 0 } });
    return { projectId, sectionId };
}
async function handle(request: IncomingMessage, response: ServerResponse) {
    const pathname = new URL(request.url!, "http://localhost:3002").pathname.slice(prefix.length);
    if (request.method !== "GET" && !allowedOrigins.has(request.headers.origin ?? "")) throw new PsdError(403, "origin_rejected", "保存请求来源不受信任");
    const scope = await auth(request);
    const cookie = request.headers.cookie ?? "";
    if (request.method === "GET" && pathname === "/projects") return reply(response, 200, { projects: projectList(await readEcommerceJson("/motu/api/projects", cookie)) });
    const projectMatch = pathname.match(/^\/projects\/([\w-]+)\/modules(?:\/([\w-]+)\/import)?$/);
    if (projectMatch) {
        const projectId = ecommerceId(projectMatch[1]);
        const project = await readEcommerceJson(`/motu/api/projects/${encodeURIComponent(projectId)}`, cookie);
        if (request.method === "GET" && !projectMatch[2]) return reply(response, 200, { modules: moduleList(project, projectId) });
        if (request.method === "POST" && projectMatch[2]) {
            const input = await form(request);
            const selected = resolveModuleSource(project, projectId, ecommerceId(projectMatch[2]), ecommerceId(input.get("expectedAssetId")));
            const source = await readEcommerceSource(selected.filePath, cookie);
            const local = await fixtureModule(scope);
            const session = await createPsdSession(scope, { ...local, requestId: String(input.get("requestId") ?? ""), fileName: selected.fileName, format: source.format, source: source.buffer, origin: selected.origin });
            return reply(response, 201, { session });
        }
        throw new PsdError(405, "method_not_allowed", "不支持的请求方法");
    }
    const sourceMatch = pathname.match(/^\/sessions\/([\w-]+)\/source$/);
    if (request.method === "GET" && sourceMatch) {
        const session = await getPsdSession(scope, sourceMatch[1]);
        const buffer = await readPsdSourceFile(scope, session.id);
        response.writeHead(200, { "Content-Type": session.sourceFormat === "png" ? "image/png" : session.sourceFormat === "jpg" ? "image/jpeg" : "image/vnd.adobe.photoshop", "Content-Disposition": 'attachment; filename="source"', "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
        return response.end(buffer);
    }
    if (request.method === "GET" && pathname === "/sessions") return reply(response, 200, { userId: scope.userId, sessions: await listPsdSessions(scope) });
    if (request.method === "POST" && pathname === "/sessions") {
        const input = await form(request);
        const format = String(input.get("format"));
        if (!["png", "jpg", "psd"].includes(format)) throw new PsdError(400, "invalid_format", "来源格式无效");
        // Explicitly named local fixture uses the existing Project/PageSection schema.
        // It is never substituted for a real product ID in the production workflow.
        const { projectId, sectionId } = await fixtureModule(scope);
        const session = await createPsdSession(scope, { requestId: String(input.get("requestId") ?? ""), projectId, sectionId, format: format as "png" | "jpg" | "psd", fileName: String(input.get("fileName") ?? "source"), source: await file(input, "source") });
        return reply(response, 201, { session });
    }
    const match = pathname.match(/^\/sessions\/([\w-]+)\/versions(?:\/([\w-]+)\/(psd|png))?$/);
    if (!match) throw new PsdError(404, "not_found", "验收接口不存在");
    const [, sessionId, versionId, format] = match;
    await getPsdSession(scope, sessionId);
    if (request.method === "GET" && versionId && format) {
        const buffer = await readPsdVersionFile(scope, sessionId, versionId, format as "psd" | "png");
        response.writeHead(200, { "Content-Type": format === "psd" ? "image/vnd.adobe.photoshop" : "image/png", "Content-Disposition": `attachment; filename="refined.${format}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
        return response.end(buffer);
    }
    if (request.method === "GET") return reply(response, 200, { versions: await listPsdVersions(scope, sessionId) });
    if (request.method === "POST" && !versionId) {
        const input = await form(request);
        const version = await savePsdVersion(scope, sessionId, { requestId: String(input.get("requestId") ?? ""), parentVersionId: input.get("parentVersionId") ? String(input.get("parentVersionId")) : null, psd: await file(input, "psd"), preview: await file(input, "preview") });
        return reply(response, 201, { version });
    }
    throw new PsdError(405, "method_not_allowed", "不支持的请求方法");
}
export function psdLocalApi(): Plugin {
    return { name: "psd-local-api", configureServer(server) {
        server.middlewares.use((request, response, next) => {
            if (!request.url?.startsWith(prefix + "/")) return next();
            void handle(request, response).catch((error: unknown) => {
                if (error instanceof PsdError) reply(response, error.status, null, error.message, error.reason);
                else reply(response, 500, null, "隔离存储操作失败；编辑内容仍可手动导出，请重试", "persistence_failed");
            });
        });
        server.httpServer?.once("close", () => { for (const client of clients.values()) void client.$disconnect(); clients.clear(); });
    } };
}
