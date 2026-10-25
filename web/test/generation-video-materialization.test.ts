import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Run the production materialization path with isolated storage/transport,
// without process-wide module mocks affecting other suites.
const dir = mkdtempSync(join(tmpdir(), "generation-video-materialization-"));
const dependencyPath = join(dir, "dependencies.ts");
const source = readFileSync(new URL("../src/services/project-asset-sync.ts", import.meta.url), "utf8");
const names = new Set<string>();
const isolated = source.replace(/import\s+(type\s+)?\{([^}]+)\}\s+from\s+"[^"]+";/g, (statement, typeOnly, bindings: string) => {
    if (typeOnly) return "";
    const runtime = bindings.split(",").map((name) => name.trim()).filter((name) => !name.startsWith("type "));
    for (const name of runtime) names.add(name);
    return `import { ${runtime.join(", ")} } from ${JSON.stringify(dependencyPath)};`;
});
const implementations: Record<string, string> = {
    createIdempotentMaterializeOutput: "input => input",
    parseBackendGenerationResult: "task => JSON.parse(task.resultJson)",
    resolveMediaUrl: "async (key) => { fixture.accesses.push(key); return 'https://storage.example/saved.mp4'; }",
    canvasVideoAssetPreviewUrl: "() => ''",
};
writeFileSync(dependencyPath, `export const fixture = { accesses: [] };\n` + [...names].map((name) => `export const ${name} = ${implementations[name] || `() => { throw new Error('Unexpected dependency: ${name}'); }`};`).join("\n"));
writeFileSync(join(dir, "materialize.ts"), isolated + "\nexport { generationOutputAsset };\n");
const { generationOutputAsset } = await import(join(dir, "materialize.ts"));
const { fixture } = await import(dependencyPath);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("云端视频登记素材不下载视频字节，保存原任务和稳定资源引用", async () => {
    const input = {
        task: { id: "existing-task", resultJson: JSON.stringify({ video: { storageKey: "resource:saved", width: 720, height: 1280, bytes: 321, durationMs: 15000, mimeType: "video/mp4" } }) },
        output: { mediaType: "video", outputIndex: 0 }, effectKey: "materialize:existing-task:0",
    };
    const fetcher = globalThis.fetch;
    let downloads = 0;
    globalThis.fetch = (async () => { downloads++; throw new TypeError("Failed to fetch: CORS"); }) as typeof fetch;
    try {
        const asset = await generationOutputAsset(input, "test-user");
        expect(asset).toMatchObject({ kind: "video", metadata: { taskId: "existing-task" }, data: { storageKey: "resource:saved", url: "https://storage.example/saved.mp4", bytes: 321, durationMs: 15000 } });
        expect(fixture.accesses).toEqual(["resource:saved"]);
        expect(downloads).toBe(0);
        const controller = new AbortController(); controller.abort();
        await expect(generationOutputAsset({ ...input, signal: controller.signal }, "test-user")).rejects.toMatchObject({ name: "AbortError" });
    } finally { globalThis.fetch = fetcher; }
});
