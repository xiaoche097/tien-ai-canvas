import { validatePsdLayerBundle, type PsdLayerBundle } from "./layer-contract";

export const PHOTOPEA_ORIGIN = "https://www.photopea.com";
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export type Format = "psd" | "png" | "jpg";
export type EditorState = "initializing" | "ready" | "busy" | "exporting" | "error" | "disposed";
export interface DocumentInfo { name: string; width: number; height: number; layers: number; text: string[] }

export function fileFormat(buffer: ArrayBuffer): Format | null {
    const bytes = new Uint8Array(buffer);
    if (bytes.length >= 26 && bytes[0] === 56 && bytes[1] === 66 && bytes[2] === 80 && bytes[3] === 83 && bytes[4] === 0 && bytes[5] === 1) return "psd";
    if (bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)) return "png";
    if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217) return "jpg";
    return null;
}

export function validateFile(buffer: ArrayBuffer, expected?: Format): Format {
    if (!buffer.byteLength || buffer.byteLength > MAX_FILE_BYTES) throw new Error("文件须大于 0 且不超过 50 MB。");
    const format = fileFormat(buffer);
    if (!format || (expected && expected !== format)) throw new Error("文件内容与要求的 PSD / PNG / JPG 格式不符。");
    return format;
}

interface Pending {
    id: string;
    tagged: boolean;
    acknowledged: boolean;
    format?: Format;
    buffer?: ArrayBuffer;
    result?: string;
    error?: string;
    resolve: (value: { buffer?: ArrayBuffer; result?: string }) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

// Photopea has no command IDs for binary opens. Serialize commands; a timeout poisons
// this frame so a late response can never be assigned to a subsequent operation.
export class PhotopeaBridge {
    state: EditorState = "initializing";
    private pending?: Pending;
    private tail: Promise<unknown> = Promise.resolve();
    private initialTimer: ReturnType<typeof setTimeout>;
    private session = crypto.randomUUID();
    private sequence = 0;
    private currentSource?: string;

    constructor(private host: Window, private frame: Window, private onState: (state: EditorState, error?: string) => void, private timeout = 45000) {
        host.addEventListener("message", this.receive);
        this.initialTimer = setTimeout(() => this.fail("Photopea 加载超时，请检查网络后重新连接。"), 90000);
    }

    private setState(state: EditorState, error?: string) {
        this.state = state;
        this.onState(state, error);
    }

    private receive = (event: MessageEvent) => {
        if (event.origin !== PHOTOPEA_ORIGIN || event.source !== this.frame || this.state === "disposed" || this.state === "error") return;
        const data: unknown = event.data;
        if (this.state === "initializing") {
            if (data === "done") { clearTimeout(this.initialTimer); this.setState("ready"); }
            return;
        }
        const pending = this.pending;
        if (!pending) return;
        if (data instanceof ArrayBuffer && pending.format) {
            if (pending.buffer) return this.fail("收到重复文件，已停止通信。请重新连接。");
            try { validateFile(data, pending.format); pending.buffer = data; }
            catch (error) { this.fail((error as Error).message); }
        } else if (typeof data === "string" && data.startsWith(pending.id + ":")) {
            pending.acknowledged = true;
            const response = data.slice(pending.id.length + 1);
            if (response.startsWith("error:")) pending.error = response.includes("PSD_DOCUMENT_CHANGED")
                ? "当前标签不是本页打开的来源文档，请切回原文档，或通过本页重新导入后保存。"
                : "Photopea 无法执行此操作，请确认已有打开的文档。";
            else pending.result = response;
        } else if (data === "done" && (!pending.tagged || pending.acknowledged)) {
            if (pending.format && !pending.buffer && !pending.error) return this.fail("导出结束但未收到完整文件，请重新连接。");
            clearTimeout(pending.timer);
            this.pending = undefined;
            this.setState("ready");
            if (pending.error) pending.reject(new Error(pending.error));
            else pending.resolve({ buffer: pending.buffer, result: pending.result });
        }
    };

    private execute(payload: ArrayBuffer | string, format?: Format) {
        const operation = this.tail.then(() => {
            if (this.state !== "ready") throw new Error("编辑器尚未就绪，请等待或重新连接。");
            const id = `${this.session}-${++this.sequence}`;
            return new Promise<{ buffer?: ArrayBuffer; result?: string }>((resolve, reject) => {
                this.pending = { id, tagged: typeof payload === "string", acknowledged: false, format, resolve, reject,
                    timer: setTimeout(() => this.fail("操作超时。为避免响应错配，请重新连接后导入本地文件。"), this.timeout) };
                this.setState(format ? "exporting" : "busy");
                const message = typeof payload === "string"
                    ? `try { ${payload}; app.echoToOE(${JSON.stringify(id + ":")} + result); } catch(e) { app.echoToOE(${JSON.stringify(id + ":error:")} + String(e)); }`
                    : payload;
                try { this.frame.postMessage(message, PHOTOPEA_ORIGIN); }
                catch { this.fail("文件发送失败，请重新连接。"); }
            });
        });
        this.tail = operation.catch(() => undefined);
        return operation;
    }

    async open(buffer: ArrayBuffer) {
        validateFile(buffer); await this.execute(buffer);
        const source = `psd-lab:${crypto.randomUUID()}`;
        await this.execute(`app.activeDocument.source = ${JSON.stringify(source)}; var result = "ok"`);
        this.currentSource = source;
        return this.info();
    }
    async checkConnection() {
        // A frame load event alone does not prove that the editor lost its session.
        // Probe idle frames with a correlated, document-independent response instead.
        if (this.state !== "ready") return;
        await this.execute('var result = "connected"');
    }
    async fitView() { await this.execute('app.UI.fitTheArea(); var result = "ok"'); }
    async panVertical(direction: -1 | 1) {
        if (direction !== -1 && direction !== 1) throw new Error("无效的画布平移方向。");
        await this.execute(`app.UI.scroll(0, ${direction * 240}); var result = "ok"`);
    }
    async export(format: Format) {
        if (!["psd", "png", "jpg"].includes(format)) throw new Error("不支持的导出格式。");
        const sourceGuard = this.currentSource ? `if(app.activeDocument.source !== ${JSON.stringify(this.currentSource)}) throw new Error("PSD_DOCUMENT_CHANGED");` : "";
        const response = await this.execute(`${sourceGuard} app.activeDocument.saveToOE(${JSON.stringify(format)}); var result = "ok"`, format);
        return response.buffer!;
    }
    async info(): Promise<DocumentInfo> {
        const response = await this.execute('var d = app.activeDocument; var texts = []; function scan(ls) { for(var i=0;i<ls.length;i++){ var l=ls[i]; if(l.typename==="LayerSet") scan(l.layers); else if(l.kind===LayerKind.TEXT) texts.push(String(l.textItem.contents)); } } scan(d.layers); var result = JSON.stringify({name:d.name,width:Number(d.width),height:Number(d.height),layers:d.layers.length,text:texts})');
        const info = JSON.parse(response.result ?? "null");
        if (!info || typeof info.name !== "string" || !Number.isFinite(info.width) || !Number.isFinite(info.height) || !Number.isInteger(info.layers) || !Array.isArray(info.text) || !info.text.every((item: unknown) => typeof item === "string")) throw new Error("文档信息响应无效。");
        return info;
    }
    async addTestText() {
        await this.execute('var l=app.activeDocument.artLayers.add(); l.kind=LayerKind.TEXT; l.name="PHASE0_EDITABLE_TEXT"; l.textItem.contents="PSD ROUNDTRIP"; l.textItem.size=32; l.textItem.position=[64,100]; var result="ok"');
        return this.info();
    }
    async assembleLayers(bundle: PsdLayerBundle) {
        validatePsdLayerBundle(bundle);
        const previousSource = this.currentSource;
        try {
            await this.open(bundle.rasters[0].buffer);
            const targetSource = this.currentSource!;
            await this.execute(`app.activeDocument.activeLayer.name=${JSON.stringify(bundle.rasters[0].name)}; var result="ok"`);
            for (const layer of bundle.rasters.slice(1)) {
                await this.execute(layer.buffer);
                await this.execute(`var imported=app.activeDocument; var target=null; for(var i=0;i<app.documents.length;i++){if(app.documents[i].source===${JSON.stringify(targetSource)})target=app.documents[i];} if(!target || target===imported)throw new Error("PSD_DOCUMENT_CHANGED"); var copied=imported.activeLayer.duplicate(target,ElementPlacement.PLACEATBEGINNING); imported.close(SaveOptions.DONOTSAVECHANGES); app.activeDocument=target; target.activeLayer=copied; copied.name=${JSON.stringify(layer.name)}; var result="ok"`);
            }
            for (const text of bundle.texts) {
                const [left, top, right, bottom] = text.bbox.map((n) => n / 1000);
                await this.execute(`if(app.activeDocument.source!==${JSON.stringify(targetSource)})throw new Error("PSD_DOCUMENT_CHANGED"); var l=app.activeDocument.artLayers.add(); l.kind=LayerKind.TEXT; l.name=${JSON.stringify(text.text.slice(0,80))}; var t=l.textItem; t.kind=TextType.PARAGRAPHTEXT; t.position=[${left * bundle.width},${top * bundle.height}]; t.width=${(right-left)*bundle.width}; t.height=${(bottom-top)*bundle.height}; t.size=${text.fontSize*bundle.height/1000}; t.font=${JSON.stringify(text.bold ? "Arial-BoldMT" : "ArialMT")}; t.contents=${JSON.stringify(text.text)}; var color=new SolidColor(); color.rgb.hexValue=${JSON.stringify(text.color.slice(1))}; t.color=color; t.justification=Justification.${text.align.toUpperCase()}; ${text.rotation ? `l.rotate(${text.rotation});` : ""} var result="ok"`);
            }
            const verify = (info: DocumentInfo) => {
                const texts = info.text.map((text) => text.replace(/\r\n?/g, "\n"));
                const matched = bundle.texts.every((line) => { const index = texts.indexOf(line.text.replace(/\r\n?/g, "\n")); if (index < 0) return false; texts.splice(index, 1); return true; });
                if (info.width !== bundle.width || info.height !== bundle.height || info.layers < bundle.rasters.length + bundle.texts.length || !matched) throw new Error("PSD 图层或文字往返校验失败，请保留原文档并重试");
            };
            verify(await this.info());
            const psd = await this.export("psd");
            verify(await this.open(psd));
            await this.fitView();
        } catch (error) {
            if (previousSource && this.state === "ready") {
                await this.execute(`for(var i=0;i<app.documents.length;i++){if(app.documents[i].source===${JSON.stringify(previousSource)}){app.activeDocument=app.documents[i];break;}} var result="ok"`);
                this.currentSource = previousSource;
            }
            throw error;
        }
    }
    async updateTestText() {
        await this.execute('var l=app.activeDocument.layers.getByName("PHASE0_EDITABLE_TEXT"); l.textItem.contents="PSD EDIT VERIFIED"; var result="ok"');
        return this.info();
    }
    private fail(message: string) {
        clearTimeout(this.initialTimer);
        if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(new Error(message)); this.pending = undefined; }
        this.setState("error", message);
    }
    dispose() {
        clearTimeout(this.initialTimer);
        this.host.removeEventListener("message", this.receive);
        if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(new Error("编辑会话已关闭。")); this.pending = undefined; }
        this.setState("disposed");
    }
}
