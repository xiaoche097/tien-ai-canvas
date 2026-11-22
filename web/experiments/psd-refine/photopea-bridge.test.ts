import { describe, expect, test } from "bun:test";
import { MAX_FILE_BYTES, PHOTOPEA_ORIGIN, PhotopeaBridge, validateFile } from "./photopea-bridge";

function png() { const bytes = new Uint8Array(24); bytes.set([137, 80, 78, 71, 13, 10, 26, 10]); return bytes.buffer; }
function fixture(timeout = 1000) {
    let listener: (event: MessageEvent) => void = () => {};
    const sent: { payload: string | ArrayBuffer; origin: string }[] = [];
    const host = { addEventListener: (_: string, fn: typeof listener) => { listener = fn; }, removeEventListener: () => { listener = () => {}; } } as unknown as Window;
    const frame = { postMessage: (payload: string | ArrayBuffer, origin: string) => sent.push({ payload, origin }) } as unknown as Window;
    const adapter = new PhotopeaBridge(host, frame, () => {}, timeout);
    const emit = (data: unknown, origin = PHOTOPEA_ORIGIN, source: Window = frame) => listener({ data, origin, source } as MessageEvent);
    const ack = (index: number, value = "ok") => {
        const payload = sent[index].payload as string;
        const prefix = JSON.parse(payload.match(/app\.echoToOE\(("[^"\n]+:")/)![1]);
        emit(prefix + value);
    };
    return { adapter, sent, emit, ack };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

for (const loseText of [false, true]) test(`native assembly verifies reopened editable text (loss=${loseText})`, async () => {
    const f = fixture();
    const buffer = new ArrayBuffer(33), view = new DataView(buffer); new Uint8Array(buffer).set([137,80,78,71,13,10,26,10]); view.setUint32(12,0x49484452); view.setUint32(16,32); view.setUint32(20,40);
    const psd = new ArrayBuffer(26), header = new DataView(psd); new Uint8Array(psd).set([56,66,80,83]); header.setUint16(4,1); header.setUint32(14,40); header.setUint32(18,32);
    let done = false, error: unknown, infoCalls = 0;
    try {
        f.emit("done");
        const run = f.adapter.assembleLayers({ version: 1, width: 32, height: 40, rasters: [{ name: "背景", buffer }, { name: "商品", buffer: buffer.slice(0) }], texts: [{ text: '可编辑 "文案"\n第二行', bbox: [10,10,900,500], fontSize: 35, color: "#112233", bold: false, align: "right", rotation: 12 }] }).then(() => { done = true; }, (cause) => { error = cause; done = true; });
        let index = 0;
        for (let attempts = 0; !done && attempts < 80; attempts++) {
            await tick();
            while (index < f.sent.length) {
                const payload = f.sent[index].payload;
                if (typeof payload !== "string") f.emit("done");
                else {
                    if (payload.includes('saveToOE("psd")')) f.emit(psd);
                    if (payload.includes("function scan(ls)")) { infoCalls++; f.ack(index, JSON.stringify({ name: "layered", width: 32, height: 40, layers: infoCalls === 1 ? 1 : 3, text: infoCalls === 1 || (loseText && infoCalls === 3) ? [] : ['可编辑 "文案"\r第二行'] })); }
                    else f.ack(index);
                    f.emit("done");
                }
                index++;
            }
        }
        await run; if (loseText) expect((error as Error).message).toContain("往返校验失败"); else expect(error).toBeUndefined(); expect(infoCalls).toBe(3);
        expect(f.sent.some((item) => typeof item.payload === "string" && item.payload.includes("target.activeLayer=copied"))).toBe(true);
        expect(f.sent.some((item) => typeof item.payload === "string" && item.payload.includes("LayerKind.TEXT"))).toBe(true);
        const textScript = f.sent.find((item) => typeof item.payload === "string" && item.payload.includes("t.kind=TextType.PARAGRAPHTEXT"))?.payload as string;
        for (const setting of ['t.position=[0.32,0.4]', 't.width=28.48', 't.height=19.6', 't.size=1.4', 't.font="ArialMT"', 'color.rgb.hexValue="112233"', 't.justification=Justification.RIGHT', 'l.rotate(12)']) expect(textScript).toContain(setting);
    } finally { f.adapter.dispose(); }
});

describe("Phase 0 file validation", () => {
    test("rejects empty, oversize, disguised and mismatched files", () => {
        expect(() => validateFile(new ArrayBuffer(0))).toThrow();
        expect(() => validateFile(new ArrayBuffer(MAX_FILE_BYTES + 1))).toThrow();
        expect(() => validateFile(new TextEncoder().encode("not a PSD").buffer)).toThrow();
        expect(() => validateFile(png(), "psd")).toThrow();
        expect(validateFile(png(), "png")).toBe("png");
    });
});

describe("Photopea command lifecycle", () => {
    test("binds imported document and rejects saving a different native tab", async () => {
        const f = fixture();
        try {
            f.emit("done"); const opened = f.adapter.open(png()); await tick();
            f.emit("done"); await tick();
            expect(f.sent[1].payload).toContain("app.activeDocument.source =");
            f.ack(1); f.emit("done"); await tick();
            f.ack(2, JSON.stringify({ name: "sample", width: 900, height: 1100, layers: 1, text: [] })); f.emit("done"); await opened;
            const pending = f.adapter.export("psd"); await tick();
            expect(f.sent[3].payload).toContain("PSD_DOCUMENT_CHANGED");
            f.ack(3, "error:Error: PSD_DOCUMENT_CHANGED"); f.emit("done");
            await expect(pending).rejects.toThrow("当前标签");
            expect(f.adapter.state).toBe("ready");
        } finally { f.adapter.dispose(); }
    });
    test("repeated load probes preserve a responsive editor instead of disposing it", async () => {
        const f = fixture();
        try {
            await f.adapter.checkConnection(); expect(f.sent.length).toBe(0);
            f.emit("done");
            for (let i = 0; i < 2; i++) {
                const probe = f.adapter.checkConnection();
                await tick(); f.ack(i, "connected"); f.emit("done"); await probe;
                expect(f.adapter.state).toBe("ready");
            }
            const pending = f.adapter.export("png");
            await tick();
            await f.adapter.checkConnection(); expect(f.sent.length).toBe(3);
            f.emit(png()); f.ack(2); f.emit("done");
            expect((await pending).byteLength).toBe(24);
        } finally { f.adapter.dispose(); }
    });
    test("view controls use serialized commands without changing document content", async () => {
        const f = fixture();
        try {
            f.emit("done");
            const fit = f.adapter.fitView(); const pan = f.adapter.panVertical(1);
            await tick(); expect(f.sent.length).toBe(1);
            expect(f.sent[0].payload).toContain("app.UI.fitTheArea()");
            f.ack(0); f.emit("done"); await fit; await tick();
            expect(f.sent[1].payload).toContain("app.UI.scroll(0, 240)");
            f.ack(1); f.emit("done"); await pan;
            expect(f.adapter.state).toBe("ready");
        } finally { f.adapter.dispose(); }
    });
    test("ignores messages from other origins/windows and rejects commands before ready", async () => {
        const f = fixture();
        try {
            f.emit("done", "https://example.com"); f.emit("done", PHOTOPEA_ORIGIN, {} as Window);
            expect(f.adapter.state).toBe("initializing");
            await expect(f.adapter.export("png")).rejects.toThrow("尚未就绪");
            f.emit("done"); expect(f.adapter.state).toBe("ready");
        } finally { f.adapter.dispose(); }
    });
    test("serializes exports, requires correlated acknowledgement and binary data", async () => {
        const f = fixture();
        try {
            f.emit("done");
            const first = f.adapter.export("png"); const second = f.adapter.export("png");
            await tick(); expect(f.sent.length).toBe(1); expect(f.sent[0].origin).toBe(PHOTOPEA_ORIGIN);
            f.emit("done"); expect(f.adapter.state).toBe("exporting");
            f.emit(png()); f.ack(0); f.emit("done"); await first; await tick();
            expect(f.sent.length).toBe(2);
            f.ack(0); f.emit("done"); expect(f.adapter.state).toBe("exporting");
            f.emit(png()); f.ack(1); f.emit("done"); expect((await second).byteLength).toBe(24);
        } finally { f.adapter.dispose(); }
    });
    test("done without a file cannot be treated as a successful export", async () => {
        const f = fixture();
        try {
            f.emit("done"); const result = f.adapter.export("png");
            await tick(); f.ack(0); f.emit("done");
            await expect(result).rejects.toThrow("未收到完整文件"); expect(f.adapter.state).toBe("error");
        } finally { f.adapter.dispose(); }
    });
    test("timeout poisons session; late response cannot complete a queued command", async () => {
        const f = fixture(15);
        try {
            f.emit("done"); const first = f.adapter.export("png");
            const rejected = expect(first).rejects.toThrow("操作超时");
            const second = f.adapter.export("png"); const nextRejected = expect(second).rejects.toThrow("尚未就绪");
            await rejected; await nextRejected;
            f.emit(png()); f.ack(0); f.emit("done");
            expect(f.adapter.state).toBe("error"); expect(f.sent.length).toBe(1);
        } finally { f.adapter.dispose(); }
    });
    test("disposal rejects pending command and removes message listener", async () => {
        const f = fixture(); f.emit("done"); const pending = f.adapter.export("png");
        await tick(); f.adapter.dispose();
        await expect(pending).rejects.toThrow("会话已关闭"); f.emit("done");
        expect(f.adapter.state).toBe("disposed");
    });
    test("script error rejects operation without claiming export success", async () => {
        const f = fixture();
        try {
            f.emit("done"); const pending = f.adapter.export("png");
            await tick(); f.ack(0, "error:no document"); f.emit("done");
            await expect(pending).rejects.toThrow("无法执行"); expect(f.adapter.state).toBe("ready");
        } finally { f.adapter.dispose(); }
    });
});
