import { afterAll, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import sharp from "../../../apps/xc-aimutu/upstream/node_modules/sharp";
import type { PrismaClient } from "../../../apps/xc-aimutu/upstream/node_modules/@prisma/client";
import { createPsdSession, getPsdSession, listPsdVersions, readPsdSourceFile, readPsdVersionFile, savePsdVersion, type PsdScope } from "../../../apps/xc-aimutu/upstream/lib/services/psd-refinement";
import { modulePsdSession, verifyModulePsdSession } from "../../../apps/xc-aimutu/upstream/lib/services/psd-project";

const upstream = fileURLToPath(new URL("../../../apps/xc-aimutu/upstream/", import.meta.url));
const require = createRequire(path.join(upstream, "package.json"));
const { PrismaClient: Client } = require("@prisma/client") as { PrismaClient: new (options: unknown) => PrismaClient };
const clients: PrismaClient[] = [];
afterAll(async () => { await Promise.all(clients.map((client) => client.$disconnect())); });
async function fixture() {
    const directory = fileURLToPath(new URL(`../../../.local/cache/psd-persistence-tests/${crypto.randomUUID()}/`, import.meta.url));
    await fs.mkdir(directory, { recursive: true });
    const databaseUrl = `file:${path.join(directory, "motu.db").replaceAll("\\", "/")}`;
    execFileSync("node", [path.join(upstream, "scripts/apply-prisma-migrations.cjs")], { cwd: upstream, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "ignore" });
    const db = new Client({ datasources: { db: { url: databaseUrl } } }); clients.push(db);
    await db.project.create({ data: { id: "project", name: "验收商品", platform: "test", style: "test" } });
    await db.pageSection.create({ data: { id: "module", projectId: "project", sectionKey: "hero", type: "HERO", title: "主图", goal: "test", copy: "", visualPrompt: "", order: 0 } });
    const scope: PsdScope = { userId: "test-user-a", db, storageRoot: path.join(directory, "storage"), maxStoredBytes: 1024 * 1024 };
    const png = await sharp({ create: { width: 32, height: 40, channels: 4, background: "white" } }).png().toBuffer();
    // Header fixture validates server persistence contracts, not Photoshop fidelity.
    const psd = Buffer.alloc(26); psd.write("8BPS"); psd.writeUInt16BE(1, 4); psd.writeUInt16BE(3, 12); psd.writeUInt32BE(40, 14); psd.writeUInt32BE(32, 18); psd.writeUInt16BE(8, 22); psd.writeUInt16BE(3, 24);
    const sourceInput = { requestId: crypto.randomUUID(), projectId: "project", sectionId: "module", fileName: "original.png", format: "png" as const, source: png };
    const session = await createPsdSession(scope, sourceInput);
    await db.pageSection.update({ where: { id: "module" }, data: { currentImageAssetId: session.id } });
    const input = { requestId: crypto.randomUUID(), parentVersionId: null as string | null, psd, preview: png };
    return { scope, session, input, directory, databaseUrl, sourceInput };
}

test("stores both files and one version; repeated concurrent save is idempotent", async () => {
    const f = await fixture();
    expect((await createPsdSession(f.scope, f.sourceInput)).id).toBe(f.session.id);
    const [first, second] = await Promise.all([savePsdVersion(f.scope, f.session.id, f.input), savePsdVersion(f.scope, f.session.id, f.input)]);
    expect(first.id).toBe(second.id);
    expect(await f.scope.db.sectionVersion.count()).toBe(1);
    expect(await f.scope.db.productAsset.count()).toBe(3);
    expect(await readPsdVersionFile(f.scope, f.session.id, first.id, "psd")).toEqual(f.input.psd);
    expect(await readPsdVersionFile(f.scope, f.session.id, first.id, "png")).toEqual(f.input.preview);
    expect((await f.scope.db.pageSection.findUnique({ where: { id: "module" } }))?.currentImageAssetId).toBe(f.session.id);
});

test("quota includes legacy assets without byte metadata before creating PSD objects", async () => {
    const f = await fixture();
    await fs.writeFile(path.join(f.scope.storageRoot, "legacy.png"), Buffer.alloc(4096));
    await f.scope.db.productAsset.create({ data: { id: "legacy", projectId: "project", type: "MAIN", fileName: "legacy.png", filePath: "legacy.png", mimeType: "image/png", metadata: {} } });
    const maxStoredBytes = f.sourceInput.source.length + 4096 + f.input.psd.length + f.input.preview.length - 1;
    await expect(savePsdVersion({ ...f.scope, maxStoredBytes }, f.session.id, f.input)).rejects.toThrow("额度");
    expect(await f.scope.db.productAsset.count()).toBe(2);
    expect(await f.scope.db.sectionVersion.count()).toBe(0);
    expect(await fs.stat(path.join(f.scope.storageRoot, "generated")).catch(() => null)).toBe(null);
});

test("quota uses actual sizes and counts multiple references to the same file once", async () => {
    const f = await fixture();
    await fs.writeFile(path.join(f.scope.storageRoot, "shared.png"), Buffer.alloc(16));
    for (const id of ["legacy-a", "legacy-b"]) await f.scope.db.productAsset.create({ data: { id, projectId: "project", type: "MAIN", fileName: "shared.png", filePath: "shared.png", mimeType: "image/png", metadata: { bytes: 999999 } } });
    const maxStoredBytes = f.sourceInput.source.length + 16 + f.input.psd.length + f.input.preview.length;
    const saved = await savePsdVersion({ ...f.scope, maxStoredBytes }, f.session.id, f.input);
    expect(await readPsdVersionFile(f.scope, f.session.id, saved.id, "psd")).toEqual(f.input.psd);
    expect(await f.scope.db.productAsset.count()).toBe(5);
});

test("unreadable registered files stop quota validation without exposing paths or writing records", async () => {
    const f = await fixture();
    await f.scope.db.productAsset.create({ data: { id: "missing", projectId: "project", type: "MAIN", fileName: "missing.png", filePath: "missing.png", mimeType: "image/png" } });
    try { await savePsdVersion(f.scope, f.session.id, f.input); throw new Error("Unexpected success"); }
    catch (error) {
        expect((error as { reason?: string }).reason).toBe("storage_inspection_failed");
        expect((error as Error).message).not.toContain(f.scope.storageRoot);
    }
    expect(await f.scope.db.sectionVersion.count()).toBe(0);
    expect(await f.scope.db.productAsset.count()).toBe(2);
});

test("distinct concurrent PSD saves cannot consume the same remaining process-local quota", async () => {
    const f = await fixture();
    const scope = { ...f.scope, maxStoredBytes: f.sourceInput.source.length + f.input.psd.length + f.input.preview.length };
    const results = await Promise.allSettled([savePsdVersion(scope, f.session.id, f.input), savePsdVersion(scope, f.session.id, { ...f.input, requestId: crypto.randomUUID() })]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((item) => item.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason.reason).toBe("storage_quota_exceeded");
    expect(await f.scope.db.sectionVersion.count()).toBe(1);
    expect(await f.scope.db.productAsset.count()).toBe(3);
});

test("formal save atomically activates preview and retains immutable PSD and original", async () => {
    const f = await fixture();
    const input = { ...f.input, activate: { expectedAssetId: f.session.id } };
    const first = await savePsdVersion(f.scope, f.session.id, input);
    expect((await f.scope.db.pageSection.findUnique({ where: { id: "module" } }))?.currentImageAssetId).toBe(first.previewAssetId);
    expect((await f.scope.db.sectionVersion.findUnique({ where: { id: first.id } }))?.isActive).toBe(true);
    expect(await readPsdSourceFile(f.scope, f.session.id)).toEqual(f.sourceInput.source);
    expect((await savePsdVersion(f.scope, f.session.id, input)).id).toBe(first.id);
    const next = await savePsdVersion(f.scope, f.session.id, { ...input, requestId: crypto.randomUUID(), parentVersionId: first.id, activate: { expectedAssetId: first.previewAssetId } });
    expect((await f.scope.db.sectionVersion.findUnique({ where: { id: first.id } }))?.isActive).toBe(false);
    expect((await f.scope.db.pageSection.findUnique({ where: { id: "module" } }))?.currentImageAssetId).toBe(next.previewAssetId);
    expect(await readPsdVersionFile(f.scope, f.session.id, first.id, "psd")).toEqual(input.psd);
});

test("module entry validates source and ownership then resumes the current saved PSD", async () => {
    const f = await fixture();
    await f.scope.db.pageSection.create({ data: { id: "other-module", projectId: "project", sectionKey: "detail", type: "HERO", title: "其他模块", goal: "test", copy: "", visualPrompt: "", order: 1, currentImageAssetId: f.session.id } });
    await expect(modulePsdSession(f.scope, "project", "other-module", { requestId: crypto.randomUUID(), expectedAssetId: f.session.id })).rejects.toThrow("不存在");
    await expect(modulePsdSession(f.scope, "other-project", "module", { requestId: crypto.randomUUID(), expectedAssetId: f.session.id })).rejects.toThrow("不存在");
    await expect(modulePsdSession(f.scope, "project", "module", { requestId: crypto.randomUUID(), expectedAssetId: "stale" })).rejects.toThrow("已变化");
    await expect(verifyModulePsdSession(f.scope, "other-project", "module", f.session.id)).rejects.toThrow("不属于");
    const opened = await modulePsdSession(f.scope, "project", "module", { requestId: crypto.randomUUID(), expectedAssetId: f.session.id });
    expect(opened.session.origin?.sourceAssetId).toBe(f.session.id);
    expect(opened.versionId).toBe(null);
    const saved = await savePsdVersion(f.scope, opened.session.id, { ...f.input, activate: { expectedAssetId: f.session.id } });
    const resumed = await modulePsdSession(f.scope, "project", "module", { requestId: crypto.randomUUID(), expectedAssetId: saved.previewAssetId });
    expect(resumed.session.id).toBe(opened.session.id);
    expect(resumed.versionId).toBe(saved.id);
    expect(resumed.versions).toHaveLength(1);
    await expect(verifyModulePsdSession({ ...f.scope, userId: "foreign" }, "project", "module", opened.session.id)).rejects.toThrow("不属于");
});

test("formal save rejects a changed preview or running generation without leaving version records", async () => {
    for (const generating of [false, true]) {
        const f = await fixture();
        await f.scope.db.pageSection.update({ where: { id: "module" }, data: generating ? { status: "GENERATING" } : { currentImageAssetId: null } });
        await expect(savePsdVersion(f.scope, f.session.id, { ...f.input, activate: { expectedAssetId: f.session.id } })).rejects.toThrow("已变化或正在生成");
        expect(await f.scope.db.sectionVersion.count()).toBe(0);
        expect(await f.scope.db.productAsset.count()).toBe(1);
    }
});

test("imported PSD keeps the module unchanged until save and retains original file and provenance", async () => {
    const f = await fixture();
    const input = { requestId: crypto.randomUUID(), expectedAssetId: f.session.id, file: { name: "my-template.psd", source: f.input.psd } };
    const imported = await modulePsdSession(f.scope, "project", "module", input);
    expect(imported.session.sourceFormat).toBe("psd");
    expect(imported.session.fileName).toBe("my-template.psd");
    expect(imported.session.origin?.sourceAssetId).toBe(f.session.id);
    expect(await readPsdSourceFile(f.scope, imported.session.id)).toEqual(f.input.psd);
    expect((await f.scope.db.pageSection.findUnique({ where: { id: "module" } }))?.currentImageAssetId).toBe(f.session.id);
    expect((await modulePsdSession(f.scope, "project", "module", input)).session.id).toBe(imported.session.id);
    const count = await f.scope.db.productAsset.count();
    await expect(modulePsdSession(f.scope, "project", "module", { ...input, requestId: crypto.randomUUID(), file: { ...input.file, source: f.input.preview } })).rejects.toThrow("PSD");
    await expect(modulePsdSession(f.scope, "project", "module", { ...input, requestId: crypto.randomUUID(), expectedAssetId: "stale" })).rejects.toThrow("已变化");
    expect(await f.scope.db.productAsset.count()).toBe(count);
    const saved = await savePsdVersion(f.scope, imported.session.id, { ...f.input, activate: { expectedAssetId: f.session.id } });
    expect((await f.scope.db.pageSection.findUnique({ where: { id: "module" } }))?.currentImageAssetId).toBe(saved.previewAssetId);
    expect(await readPsdSourceFile(f.scope, imported.session.id)).toEqual(f.input.psd);
    expect(await readPsdSourceFile(f.scope, f.session.id)).toEqual(f.sourceInput.source);
});

test("a real WebP module opens as lossless PNG while preserving source bytes and ownership", async () => {
    const f = await fixture();
    const webp = await sharp({ create: { width: 32, height: 40, channels: 4, background: { r: 55, g: 130, b: 200, alpha: 0.5 } } }).webp({ lossless: true }).toBuffer();
    await fs.writeFile(path.join(f.scope.storageRoot, "original.webp"), webp);
    await f.scope.db.productAsset.create({ data: { id: "webp-source", projectId: "project", sectionId: "module", type: "GENERATED", fileName: "original.webp", filePath: "original.webp", mimeType: "image/webp" } });
    await f.scope.db.pageSection.update({ where: { id: "module" }, data: { currentImageAssetId: "webp-source" } });
    const opened = await modulePsdSession(f.scope, "project", "module", { requestId: crypto.randomUUID(), expectedAssetId: "webp-source" });
    if (!opened.session) throw new Error("Unexpected recovery");
    expect(opened.session.sourceFormat).toBe("png");
    expect(opened.session.fileName).toBe("original.png");
    expect(opened.session.origin?.sourceAssetId).toBe("webp-source");
    const png = await readPsdSourceFile(f.scope, opened.session.id);
    const info = await sharp(png).metadata();
    expect([info.format, info.width, info.height, info.hasAlpha]).toEqual(["png", 32, 40, true]);
    expect(await sharp(png).raw().toBuffer()).toEqual(await sharp(webp).raw().toBuffer());
    expect(await fs.readFile(path.join(f.scope.storageRoot, "original.webp"))).toEqual(webp);
    expect((await f.scope.db.pageSection.findUnique({ where: { id: "module" } }))?.currentImageAssetId).toBe("webp-source");
    const before = await f.scope.db.productAsset.count();
    await fs.writeFile(path.join(f.scope.storageRoot, "original.webp"), Buffer.from("RIFFxxxxWEBPbroken"));
    await expect(modulePsdSession(f.scope, "project", "module", { requestId: crypto.randomUUID(), expectedAssetId: "webp-source" })).rejects.toThrow("无法解码");
    expect(await f.scope.db.productAsset.count()).toBe(before);
});

test("returning to the original image offers only saved PSDs from that exact source", async () => {
    const f = await fixture();
    const saved = await savePsdVersion(f.scope, f.session.id, { ...f.input, activate: { expectedAssetId: f.session.id } });
    // A session without provenance cannot be offered as a match.
    await f.scope.db.pageSection.update({ where: { id: "module" }, data: { currentImageAssetId: f.session.id } });
    const first = await modulePsdSession(f.scope, "project", "module", { requestId: crypto.randomUUID(), expectedAssetId: f.session.id });
    expect("recovery" in first).toBe(false);
    if ("recovery" in first) throw new Error("Unexpected recovery");
    const version = await savePsdVersion(f.scope, first.session.id, { ...f.input, requestId: crypto.randomUUID(), activate: { expectedAssetId: f.session.id } });
    await f.scope.db.pageSection.update({ where: { id: "module" }, data: { currentImageAssetId: f.session.id } });
    const input = { requestId: crypto.randomUUID(), expectedAssetId: f.session.id };
    const assetsBefore = await f.scope.db.productAsset.count();
    const offer = await modulePsdSession(f.scope, "project", "module", input);
    expect("recovery" in offer).toBe(true);
    if (!("recovery" in offer) || !offer.recovery) throw new Error("Missing recovery");
    expect(offer.recovery.versionId).toBe(version.id);
    expect(await f.scope.db.productAsset.count()).toBe(assetsBefore);
    await expect(modulePsdSession(f.scope, "project", "module", { ...input, recoveryMode: "resume", recoveryVersionId: saved.id })).rejects.toThrow("已变化");
    const resumed = await modulePsdSession(f.scope, "project", "module", { ...input, recoveryMode: "resume", recoveryVersionId: version.id });
    expect(resumed.session?.id).toBe(first.session.id);
    expect(resumed.versionId).toBe(version.id);
    expect((await f.scope.db.pageSection.findUnique({ where: { id: "module" } }))?.currentImageAssetId).toBe(f.session.id);
    const fresh = await modulePsdSession(f.scope, "project", "module", { ...input, recoveryMode: "new" });
    expect(fresh.session?.id).not.toBe(first.session.id);
    expect(fresh.versionId).toBe(null);
    expect(await readPsdVersionFile(f.scope, first.session.id, version.id, "psd")).toEqual(f.input.psd);
    await f.scope.db.pageSection.update({ where: { id: "module" }, data: { currentImageAssetId: null } });
    await expect(modulePsdSession(f.scope, "project", "module", { ...input, recoveryMode: "resume", recoveryVersionId: version.id })).rejects.toThrow("不存在");
});

test("preserves immutable versions, parent lineage, and recovery after client restart", async () => {
    const f = await fixture();
    const first = await savePsdVersion(f.scope, f.session.id, f.input);
    const changed = Buffer.from(f.input.psd); changed[6] = 1;
    const second = await savePsdVersion(f.scope, f.session.id, { ...f.input, requestId: crypto.randomUUID(), parentVersionId: first.id, psd: changed });
    const db = new Client({ datasources: { db: { url: f.databaseUrl } } }); clients.push(db);
    const restarted = { ...f.scope, db };
    const versions = await listPsdVersions(restarted, f.session.id);
    expect(versions.map((v) => v.id)).toEqual([second.id, first.id]);
    expect(versions[0].parentVersionId).toBe(first.id);
    expect(await readPsdVersionFile(restarted, f.session.id, first.id, "psd")).toEqual(f.input.psd);
});

test("rejects foreign scope, foreign parent, conflicting idempotency content, and quota exhaustion", async () => {
    const f = await fixture();
    await expect(getPsdSession({ ...f.scope, userId: "other-user" }, f.session.id)).rejects.toThrow("不属于");
    await expect(savePsdVersion(f.scope, f.session.id, { ...f.input, parentVersionId: "foreign-version" })).rejects.toThrow("父版本");
    await expect(savePsdVersion({ ...f.scope, maxStoredBytes: 1 }, f.session.id, f.input)).rejects.toThrow("额度");
    await savePsdVersion(f.scope, f.session.id, f.input);
    const changed = Buffer.from(f.input.psd); changed[6] = 2;
    await expect(savePsdVersion(f.scope, f.session.id, { ...f.input, psd: changed })).rejects.toThrow("不同内容");
    expect(await f.scope.db.sectionVersion.count()).toBe(1);
});

test("transaction failure rolls back version/assets and compensates only newly written files", async () => {
    const f = await fixture();
    const failingDb = new Proxy(f.scope.db, { get(target, key) {
        if (key === "$transaction") return (action: (tx: unknown) => Promise<unknown>) => target.$transaction(async (tx) => { await action(tx); throw new Error("forced rollback"); });
        const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    await expect(savePsdVersion({ ...f.scope, db: failingDb }, f.session.id, f.input)).rejects.toThrow("forced rollback");
    expect(await f.scope.db.sectionVersion.count()).toBe(0);
    expect(await f.scope.db.productAsset.count()).toBe(1);
    expect(await fs.readdir(path.join(f.scope.storageRoot, "exports", "project", "module"))).toEqual([]);
    expect(await fs.readdir(path.join(f.scope.storageRoot, "generated", "project", "module"))).toEqual([]);
    expect((await fs.readdir(path.join(f.scope.storageRoot, "uploads", "project"))).length).toBe(1);
});

test("rejects mismatched previews and detects modified stored files before recovery", async () => {
    const f = await fixture();
    const changed = Buffer.from(f.input.psd); changed.writeUInt32BE(33, 18);
    await expect(savePsdVersion(f.scope, f.session.id, { ...f.input, psd: changed })).rejects.toThrow("尺寸");
    const version = await savePsdVersion(f.scope, f.session.id, f.input);
    const asset = await f.scope.db.productAsset.findUniqueOrThrow({ where: { id: version.psdAssetId } });
    await fs.writeFile(path.join(f.scope.storageRoot, asset.filePath), "corrupted");
    await expect(readPsdVersionFile(f.scope, f.session.id, version.id, "psd")).rejects.toThrow("校验失败");
});

test("retry after a committed transaction loses its acknowledgement reuses the durable version", async () => {
    const f = await fixture();
    const lostReplyDb = new Proxy(f.scope.db, { get(target, key) {
        if (key === "$transaction") return async (action: (tx: unknown) => Promise<unknown>) => { await target.$transaction((tx) => action(tx)); throw new Error("simulated lost acknowledgement"); };
        const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    await expect(savePsdVersion({ ...f.scope, db: lostReplyDb }, f.session.id, f.input)).rejects.toThrow("lost acknowledgement");
    const retried = await savePsdVersion(f.scope, f.session.id, f.input);
    expect(await f.scope.db.sectionVersion.count()).toBe(1);
    expect(await f.scope.db.productAsset.count()).toBe(3);
    expect(await readPsdVersionFile(f.scope, f.session.id, retried.id, "psd")).toEqual(f.input.psd);
    expect(await readPsdVersionFile(f.scope, f.session.id, retried.id, "png")).toEqual(f.input.preview);
});

test("restoring v1 then saving creates a branch without rewriting v1 or v2", async () => {
    const f = await fixture();
    const first = await savePsdVersion(f.scope, f.session.id, f.input);
    const second = await savePsdVersion(f.scope, f.session.id, { ...f.input, requestId: crypto.randomUUID(), parentVersionId: first.id });
    const branch = await savePsdVersion(f.scope, f.session.id, { ...f.input, requestId: crypto.randomUUID(), parentVersionId: first.id });
    expect(branch.versionNumber).toBe(3);
    expect(branch.parentVersionId).toBe(first.id);
    expect((await listPsdVersions(f.scope, f.session.id)).map((version) => version.id)).toEqual([branch.id, second.id, first.id]);
    expect(await readPsdVersionFile(f.scope, f.session.id, first.id, "psd")).toEqual(f.input.psd);
    expect(await readPsdVersionFile(f.scope, f.session.id, second.id, "psd")).toEqual(f.input.psd);
});

test("foreign users cannot list or download a known session's PSD or preview", async () => {
    const f = await fixture();
    const version = await savePsdVersion(f.scope, f.session.id, f.input);
    const foreign = { ...f.scope, userId: "test-user-b" };
    await expect(listPsdVersions(foreign, f.session.id)).rejects.toThrow("不属于");
    await expect(readPsdVersionFile(foreign, f.session.id, version.id, "psd")).rejects.toThrow("不属于");
    await expect(readPsdVersionFile(foreign, f.session.id, version.id, "png")).rejects.toThrow("不属于");
});

test("persists real-product provenance on the isolated session and immutable version", async () => {
    const f = await fixture();
    const origin = { projectId: "real-product", moduleId: "real-module", sourceAssetId: "real-image", sourceVersionId: "real-generation-version", projectName: "来源商品", moduleName: "来源主图" };
    const sourceInput = { ...f.sourceInput, requestId: crypto.randomUUID(), origin };
    const session = await createPsdSession(f.scope, sourceInput);
    const version = await savePsdVersion(f.scope, session.id, f.input);
    expect((await getPsdSession(f.scope, session.id)).origin).toEqual(origin);
    expect((await listPsdVersions(f.scope, session.id))[0].origin).toEqual(origin);
    expect(version.origin).toEqual(origin);
    const changed = Buffer.from(f.input.psd); changed[6] = 2;
    const second = await savePsdVersion(f.scope, session.id, { ...f.input, requestId: crypto.randomUUID(), parentVersionId: version.id, psd: changed });
    const db = new Client({ datasources: { db: { url: f.databaseUrl } } }); clients.push(db);
    const restarted = { ...f.scope, db };
    expect((await getPsdSession(restarted, session.id)).origin).toEqual(origin);
    const restored = await readPsdVersionFile(restarted, session.id, version.id, "psd");
    const branch = await savePsdVersion(restarted, session.id, { ...f.input, requestId: crypto.randomUUID(), parentVersionId: version.id, psd: restored });
    const versions = await listPsdVersions(restarted, session.id);
    expect(versions.map((item) => item.id)).toEqual([branch.id, second.id, version.id]);
    expect(versions.map((item) => item.origin)).toEqual([origin, origin, origin]);
    expect(branch.parentVersionId).toBe(version.id);
    expect(await readPsdVersionFile(restarted, session.id, second.id, "psd")).toEqual(changed);
    expect(await readPsdVersionFile(restarted, session.id, branch.id, "psd")).toEqual(f.input.psd);
    expect(await readPsdSourceFile(f.scope, session.id)).toEqual(f.sourceInput.source);
    const fromOriginal = await savePsdVersion(restarted, session.id, { ...f.input, requestId: crypto.randomUUID(), parentVersionId: null });
    expect(fromOriginal.parentVersionId).toBeNull();
    expect(fromOriginal.origin).toEqual(origin);
    expect((await listPsdVersions(restarted, session.id)).length).toBe(4);
    expect(await readPsdSourceFile(restarted, session.id)).toEqual(f.sourceInput.source);
    expect(await readPsdVersionFile(restarted, session.id, second.id, "psd")).toEqual(changed);
    await expect(createPsdSession(f.scope, { ...sourceInput, origin: { ...origin, sourceAssetId: "different-image" } })).rejects.toThrow("不同内容");
    await expect(readPsdSourceFile({ ...f.scope, userId: "other-user" }, session.id)).rejects.toThrow("不属于");
    expect((await f.scope.db.pageSection.findUnique({ where: { id: "module" } }))?.currentImageAssetId).toBe(f.session.id);
});
