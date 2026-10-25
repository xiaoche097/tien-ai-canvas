import { validateFile, type DocumentInfo, type Format, type PhotopeaBridge } from "./photopea-bridge";

export interface VerificationStep { label: string; status: "running" | "passed" | "failed"; error?: string }
export interface VerificationReport {
    schemaVersion: 1;
    scope: "controlled-sample-only";
    startedAt: string;
    finishedAt?: string;
    status: "running" | "passed" | "failed";
    steps: VerificationStep[];
    files: { name: string; bytes: number; sha256: string }[];
}
type VerificationEditor = Pick<PhotopeaBridge, "open" | "export" | "addTestText" | "updateTestText">;

function assertDocument(info: DocumentInfo, text?: string) {
    if (info.width !== 900 || info.height !== 1100) throw new Error("文档尺寸与 900 × 1100 测试样本不一致。");
    if (text && (info.layers < 2 || !info.text.includes(text))) throw new Error("PSD 未保留预期的可编辑文字图层。");
}

async function assertRaster(buffer: ArrayBuffer, format: "png" | "jpg") {
    validateFile(buffer, format);
    const bitmap = await createImageBitmap(new Blob([buffer], { type: format === "png" ? "image/png" : "image/jpeg" }));
    try {
        if (bitmap.width !== 900 || bitmap.height !== 1100) throw new Error("导出图片解码后的尺寸与测试样本不一致。");
    } finally { bitmap.close(); }
}

// Operates only on the generated sample. Reports describe this browser run, never
// product persistence or compatibility of arbitrary user PSDs.
export async function verifyRoundtrip(
    editor: VerificationEditor,
    source: ArrayBuffer,
    onStep: (steps: VerificationStep[]) => void,
    onArtifact: (buffer: ArrayBuffer, format: Format, name: string) => void,
) {
    const report: VerificationReport = { schemaVersion: 1, scope: "controlled-sample-only", startedAt: new Date().toISOString(), status: "running", steps: [], files: [] };
    let document: DocumentInfo | undefined;
    async function step<T>(label: string, action: () => Promise<T>) {
        const entry: VerificationStep = { label, status: "running" };
        report.steps.push(entry); onStep(report.steps.map((item) => ({ ...item })));
        try {
            const value = await action(); entry.status = "passed"; return value;
        } catch (cause) {
            entry.status = "failed";
            entry.error = cause instanceof Error ? cause.message : "验收操作失败。";
            throw cause;
        } finally { onStep(report.steps.map((item) => ({ ...item }))); }
    }
    async function artifact(buffer: ArrayBuffer, format: Format, name: string) {
        validateFile(buffer, format);
        const digest = await crypto.subtle.digest("SHA-256", buffer);
        report.files.push({ name, bytes: buffer.byteLength, sha256: Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("") });
        onArtifact(buffer, format, name);
    }
    try {
        await step("PNG 导入并核对 900 × 1100 尺寸", async () => {
            await artifact(source, "png", "phase0-source.png");
            document = await editor.open(source); assertDocument(document);
        });
        await step("新增并读取真实文字图层", async () => {
            document = await editor.addTestText(); assertDocument(document, "PSD ROUNDTRIP");
        });
        const originalPsd = await step("导出初始分层 PSD", async () => {
            const buffer = await editor.export("psd"); await artifact(buffer, "psd", "phase0-original.psd"); return buffer;
        });
        await step("重新导入 PSD 并核对文字图层", async () => {
            document = await editor.open(originalPsd); assertDocument(document, "PSD ROUNDTRIP");
        });
        await step("修改重新导入的 PSD 文字", async () => {
            document = await editor.updateTestText(); assertDocument(document, "PSD EDIT VERIFIED");
        });
        const editedPsd = await step("将修改后的文字再次导出为 PSD", async () => {
            const buffer = await editor.export("psd"); await artifact(buffer, "psd", "phase0-edited.psd"); return buffer;
        });
        await step("再次导入并确认文字修改已写入文件", async () => {
            document = await editor.open(editedPsd); assertDocument(document, "PSD EDIT VERIFIED");
        });
        await step("导出 PNG 并实际解码核对尺寸", async () => {
            const buffer = await editor.export("png"); await assertRaster(buffer, "png"); await artifact(buffer, "png", "phase0-result.png");
        });
        await step("导出 JPG、解码并重新导入", async () => {
            const buffer = await editor.export("jpg"); await assertRaster(buffer, "jpg"); await artifact(buffer, "jpg", "phase0-result.jpg");
            document = await editor.open(buffer); assertDocument(document);
        });
        await step("恢复已验证的修改后分层 PSD", async () => {
            document = await editor.open(editedPsd); assertDocument(document, "PSD EDIT VERIFIED");
        });
        report.status = "passed";
    } catch { report.status = "failed"; }
    report.finishedAt = new Date().toISOString();
    return { report, document };
}
