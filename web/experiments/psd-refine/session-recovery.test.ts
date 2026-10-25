import { expect, spyOn, test } from "bun:test";
import { http } from "../../src/services/api/request";
import { findSavedModuleVersion } from "./psd-api";

const origin = { projectId: "product", moduleId: "module", sourceAssetId: "image" };

test("recovery matches the exact product/module/image and skips unsaved sessions", async () => {
    const calls: string[] = [];
    const signal = new AbortController().signal;
    const get = spyOn(http, "get").mockImplementation(async (url, options) => {
        calls.push(url); expect(options?.signal).toBe(signal);
        if (url.endsWith("/sessions")) return { sessions: [
            { id: "local-file" },
            { id: "other-product", origin: { ...origin, projectId: "other" } },
            { id: "other-module", origin: { ...origin, moduleId: "other" } },
            { id: "old-image", origin: { ...origin, sourceAssetId: "old" } },
            { id: "unsaved", origin }, { id: "saved", origin },
        ] } as never;
        return { versions: url.includes("/unsaved/") ? [] : [{ id: "v2" }, { id: "v1" }] } as never;
    });
    try {
        expect(await findSavedModuleVersion("product", "module", "image", signal)).toMatchObject({ session: { id: "saved" }, version: { id: "v2" } });
        expect(calls).toEqual(["/psd-lab/sessions", "/psd-lab/sessions/unsaved/versions", "/psd-lab/sessions/saved/versions"]);
    } finally { get.mockRestore(); }
});

test("no matching source does not propose an unrelated saved document", async () => {
    const get = spyOn(http, "get").mockResolvedValue({ sessions: [{ id: "old", origin: { ...origin, sourceAssetId: "old-image" } }] } as never);
    try { expect(await findSavedModuleVersion("product", "module", "image")).toBeNull(); expect(get).toHaveBeenCalledTimes(1); }
    finally { get.mockRestore(); }
});

test("lookup failure is not treated as permission to silently create another session", async () => {
    const get = spyOn(http, "get").mockRejectedValue(new Error("读取失败"));
    try { await expect(findSavedModuleVersion("product", "module", "image")).rejects.toThrow("读取失败"); }
    finally { get.mockRestore(); }
});
