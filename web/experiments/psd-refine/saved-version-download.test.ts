import { expect, spyOn, test } from "bun:test";
import { http } from "../../src/services/api/request";
import { savedVersionFile } from "./psd-api";

test("saved downloads request the chosen immutable version and format with cancellation", async () => {
    const bytes = new ArrayBuffer(32);
    const signal = new AbortController().signal;
    const raw = spyOn(http, "raw").mockResolvedValue({ data: bytes } as never);
    try {
        for (const format of ["psd", "png"] as const) {
            expect(await savedVersionFile("session-a", "version-2", format, signal)).toBe(bytes);
            expect(raw).toHaveBeenLastCalledWith({ url: `/psd-lab/sessions/session-a/versions/version-2/${format}`, method: "GET", responseType: "arraybuffer", timeout: 60000, signal });
        }
    } finally { raw.mockRestore(); }
});

test("file failures and cancellation remain failures rather than empty successful downloads", async () => {
    const raw = spyOn(http, "raw").mockRejectedValue(new Error("文件校验失败"));
    try {
        await expect(savedVersionFile("session", "version", "png")).rejects.toThrow("文件校验失败");
        const cancelled = new DOMException("Cancelled", "AbortError"); raw.mockRejectedValue(cancelled);
        await expect(savedVersionFile("session", "version", "psd")).rejects.toBe(cancelled);
    } finally { raw.mockRestore(); }
});
