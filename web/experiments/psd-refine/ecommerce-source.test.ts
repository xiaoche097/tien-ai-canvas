import { expect, spyOn, test } from "bun:test";
import { ecommerceFilePath, moduleList, projectList, readEcommerceJson, readEcommerceSource, resolveModuleSource } from "./ecommerce-source";

function project() {
    return { id: "product-a", name: "验收商品", tasks: [{ internalField: "not-returned" }], sections: [{ id: "module-a", projectId: "product-a", title: "商品主图", currentImageAssetId: "image-a",
        currentImageAsset: { id: "image-a", projectId: "product-a", sectionId: "module-a", fileName: "hero.png", filePath: "generated/product-a/module-a/hero.png" },
        versions: [{ id: "version-b", sectionId: "module-a", imageAssetId: "image-b", isActive: true }, { id: "version-a", sectionId: "module-a", imageAssetId: "image-a", isActive: false }] }] };
}
test("exposes only project labels and resolves the actual current image version", () => {
    const value = project();
    expect(projectList([value])).toEqual([{ id: "product-a", name: "验收商品" }]);
    expect(moduleList(value, "product-a")[0]).toEqual({ id: "module-a", title: "商品主图", assetId: "image-a", sourceVersionId: "version-a" });
    const selected = resolveModuleSource(value, "product-a", "module-a", "image-a");
    expect(selected.origin).toMatchObject({ projectId: "product-a", moduleId: "module-a", sourceAssetId: "image-a", sourceVersionId: "version-a" });
});
test("rejects stale source and cross-project or cross-module asset references", () => {
    const value = project();
    expect(() => resolveModuleSource(value, "product-a", "module-a", "old-image")).toThrow("已变化");
    value.sections[0].currentImageAsset.projectId = "product-b";
    expect(() => resolveModuleSource(value, "product-a", "module-a", "image-a")).toThrow("不属于");
    value.sections[0].currentImageAsset.projectId = "product-a"; value.sections[0].currentImageAsset.sectionId = "module-b";
    expect(() => resolveModuleSource(value, "product-a", "module-a", "image-a")).toThrow("不属于");
    expect(() => resolveModuleSource(value, "product-a", "foreign-module", "image-a")).toThrow("不属于");
});
test("does not fabricate generation version IDs or images for empty modules", () => {
    const value = project(); value.sections[0].versions = [];
    expect(moduleList(value, "product-a")[0].sourceVersionId).toBeNull();
    value.sections[0].currentImageAssetId = "";
    expect(moduleList(value, "product-a")[0].assetId).toBeNull();
    expect(() => resolveModuleSource(value, "product-a", "module-a", "image-a")).toThrow("尚无");
});
test("only builds local authenticated file paths and rejects traversal or external URLs", () => {
    expect(ecommerceFilePath("generated\\product-a\\主图.png")).toBe("/motu/api/files/generated/product-a/%E4%B8%BB%E5%9B%BE.png");
    for (const value of ["../private", "/absolute", "https://example.com/image.png", "generated/../private", "//example.com/image.png"]) expect(() => ecommerceFilePath(value)).toThrow("路径");
});
test("reads only fixed local endpoints without forwarding credentials in URLs", async () => {
    const png = Buffer.alloc(33); png.set([137, 80, 78, 71, 13, 10, 26, 10]); png.write("IHDR", 12);
    const calls: string[] = [];
    const mocked = spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input); calls.push(url);
        expect(new Headers(init?.headers).get("cookie")).toBe("test-cookie=value");
        expect(init?.redirect).toBe("error");
        return url.includes("/files/") ? new Response(png) : Response.json({ success: true, data: [project()] });
    });
    try {
        expect(projectList(await readEcommerceJson("/motu/api/projects", "test-cookie=value")).length).toBe(1);
        expect((await readEcommerceSource("generated/product-a/hero.png", "test-cookie=value")).format).toBe("png");
        expect(calls.every((url) => url.startsWith("http://127.0.0.1:3000/motu/api/") && !url.includes("test-cookie"))).toBe(true);
    } finally { mocked.mockRestore(); }
});
test("upstream failures and unsupported bitmap formats do not become successful imports", async () => {
    const mocked = spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 403 }));
    try {
        await expect(readEcommerceJson("/motu/api/projects", "")).rejects.toMatchObject({ status: 403 });
        mocked.mockResolvedValue(new Response("RIFF-test"));
        await expect(readEcommerceSource("generated/test.webp", "")).rejects.toMatchObject({ reason: "unsupported_source_format" });
    } finally { mocked.mockRestore(); }
});
