import { expect, test } from "bun:test";
import { http } from "@/services/api/request";
import { clearResourceAccessCache, getResourceBlob } from "@/services/api/resources";

test("processing reads explain CORS failures without retrying generation or leaking cookies to storage", async () => {
    const post = http.post, fetcher = globalThis.fetch;
    let reads = 0;
    http.post = (async (url: string, requests: Array<{ purpose: string }>) => {
        expect(url).toBe("/resources/access");
        expect(requests[0].purpose).toBe("browser-process");
        return { items: [{ access: { resourceId: "example", url: "https://storage.example/image.png", delivery: "origin", refreshAt: new Date(Date.now() + 60_000).toISOString() } }] };
    }) as typeof http.post;
    try {
        globalThis.fetch = (async (_url, init) => {
            reads++;
            expect(init?.credentials).toBe("omit");
            expect(init?.mode).toBe("cors");
            throw new TypeError("Failed to fetch");
        }) as typeof fetch;
        await expect(getResourceBlob("resource:example")).rejects.toThrow("CORS");
        expect(reads).toBe(1);
        globalThis.fetch = (async () => new Response("existing-image", { headers: { "Content-Type": "image/png" } })) as typeof fetch;
        expect(await (await getResourceBlob("resource:example"))!.text()).toBe("existing-image");
        globalThis.fetch = (async () => new Response("", { status: 403 })) as typeof fetch;
        await expect(getResourceBlob("resource:example")).rejects.toThrow("403");
    } finally { http.post = post; globalThis.fetch = fetcher; clearResourceAccessCache(); }
});
