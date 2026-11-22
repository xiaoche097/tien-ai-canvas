import { expect, test } from "bun:test";
import { psdRecoveryBatches, psdRecoveryImages, psdTaskImages, type PsdRecoveryBatch } from "@/lib/psd-layer-recovery";
import type { GenerationTask } from "@/services/api/task-center";

function task(id: string, edit: string, seconds: number, batch?: string): GenerationTask {
    return { id, status: "succeeded", type: "canvas_image", prompt: "", model: "example", attempts: 1,
        createdAt: new Date(1_700_000_000_000 + seconds * 1000).toISOString(), updatedAt: "",
        inputJson: JSON.stringify({ metadata: { edit, ...(batch ? { psdBatchId: batch } : {}) } }),
        resultJson: JSON.stringify(edit === "psd-layer-extraction" ? { images: [{ dataUrl: "/api/resources/example/file", storageKey: "resource:example" }] } : { text: "{}" }),
    };
}
test("legacy recovery separates runs and requires one matching OCR task", () => {
    const tasks = [task("plan-a", "psd-layer-plan", 0), task("ocr-a", "psd-native-text-layout", 1), task("image-a", "psd-layer-extraction", 30),
        task("plan-b", "psd-layer-plan", 100), task("ocr-b", "psd-native-text-layout", 101), task("image-b", "psd-layer-extraction", 130)];
    expect(psdRecoveryBatches(tasks).map((batch) => [batch.id, batch.ocr.id, batch.images.map((image) => image.id), batch.legacy])).toEqual([
        ["plan-b", "ocr-b", ["image-b"], true], ["plan-a", "ocr-a", ["image-a"], true],
    ]);
    expect(psdRecoveryBatches([...tasks, task("ambiguous-ocr", "psd-native-text-layout", 2)]).map((batch) => batch.id)).toEqual(["plan-b"]);
});
test("explicit batch IDs keep concurrent workflows separate", () => {
    const tasks = [task("plan-a", "psd-layer-plan", 0, "a"), task("plan-b", "psd-layer-plan", 0, "b"),
        task("ocr-a", "psd-native-text-layout", 0, "a"), task("ocr-b", "psd-native-text-layout", 0, "b"),
        task("image-b", "psd-layer-extraction", 20, "b"), task("image-a", "psd-layer-extraction", 20, "a")];
    expect(psdRecoveryBatches(tasks).find((batch) => batch.id === "plan-a")?.images.map((image) => image.id)).toEqual(["image-a"]);
    expect(psdRecoveryBatches(tasks).every((batch) => !batch.legacy)).toBe(true);
});
test("missing, malformed and unfinished outputs do not appear as recoverable images", () => {
    const plan = task("plan", "psd-layer-plan", 0), ocr = task("ocr", "psd-native-text-layout", 1), image = task("image", "psd-layer-extraction", 20);
    expect(psdRecoveryBatches([plan, image])).toEqual([]);
    expect(psdRecoveryBatches([plan, ocr, { ...image, status: "running" }])).toEqual([]);
    expect(psdRecoveryBatches([plan, ocr, { ...image, resultJson: "invalid" }])).toEqual([]);
    expect(psdTaskImages({ ...image, resultJson: '{"images":[null,{}]}' })).toEqual([]);
});

function image(id: string, index: number, stage?: string, batch = "run") {
    const value = task(id, "psd-layer-extraction", 20, batch);
    value.inputJson = JSON.stringify({ metadata: { edit: "psd-layer-extraction", psdBatchId: batch, layerIndex: index, ...(stage ? { layerStage: stage } : {}) } });
    value.resultJson = JSON.stringify({ images: [{ dataUrl: `/saved-${id}.png` }] });
    return value;
}
function batch(images: GenerationTask[]): PsdRecoveryBatch {
    return { id: "plan", createdAt: "", plan: task("plan", "psd-layer-plan", 0, "run"), ocr: task("ocr", "psd-native-text-layout", 1, "run"), images, legacy: false };
}
test("recovery restores local crop layers without requiring a paid task for them", () => {
    expect(psdRecoveryImages(batch([image("background", 0)]), ["generate", "source-region"])).toEqual([{ dataUrl: "/saved-background.png" }, null]);
    expect(() => psdRecoveryImages(batch([image("background", 0), image("unexpected", 1)]), ["generate", "source-region"])).toThrow("冲突");
});
test("recovery orders generated layers and prefers one completed removal after extraction", () => {
    const images = [image("foreground", 1, "extract"), image("background", 0, "extract"), image("transparent", 1, "remove-background")];
    expect(psdRecoveryImages(batch(images), ["generate", "generate"]).map((item) => item?.dataUrl)).toEqual(["/saved-background.png", "/saved-transparent.png"]);
    expect(() => psdRecoveryImages(batch([...images, image("duplicate-removal", 1, "remove-background")]), ["generate", "generate"])).toThrow("多个候选");
});
test("missing, duplicate, foreign and invalid task results cannot silently assemble", () => {
    for (const images of [
        [image("background", 0)],
        [image("background", 0), image("first", 1), image("duplicate", 1)],
        [image("background", 0), image("foreign", 1, "extract", "other-run")],
        [image("background", 0), image("wrong-index", 3)],
        [image("background", 0), image("wrong-stage", 1, "unknown")],
        [image("background", 0), { ...image("not-complete", 1), status: "running" as const }],
    ]) expect(() => psdRecoveryImages(batch(images), ["generate", "generate"])).toThrow();
});
test("dedicated decomposition must be a single complete result with no mixed tasks", () => {
    const dedicated = task("dedicated", "psd-layer-decomposition", 20, "run");
    dedicated.resultJson = JSON.stringify({ images: [{ dataUrl: "/background.png" }, { dataUrl: "/foreground.png" }] });
    expect(psdRecoveryImages(batch([dedicated]), ["generate", "generate"])).toHaveLength(2);
    expect(() => psdRecoveryImages(batch([dedicated, image("extra", 1)]), ["generate", "generate"])).toThrow("多个拆层结果");
    expect(() => psdRecoveryImages(batch([dedicated]), ["generate"])).toThrow("数量");
    dedicated.resultJson = '{"images":[{"dataUrl":"/ok.png"},{}]}';
    expect(psdTaskImages(dedicated)).toEqual([]);
});
test("failed plans still bound legacy runs so later outputs cannot join an older plan", () => {
    const tasks = [task("old-plan", "psd-layer-plan", 0), task("old-ocr", "psd-native-text-layout", 1),
        task("old-image", "psd-layer-extraction", 20), { ...task("failed-plan", "psd-layer-plan", 40), status: "failed" as const }, task("later-image", "psd-layer-extraction", 60)];
    expect(psdRecoveryBatches(tasks)[0]?.images.map((item) => item.id)).toEqual(["old-image"]);
});

test("bound recovery lists only the current product/module/session/version and rejects mixed origins", () => {
    const source = { projectId: "project", sectionId: "module", sessionId: "session", versionId: null };
    const bind = (value: GenerationTask, psdSource: unknown) => ({ ...value, inputJson: JSON.stringify({ metadata: { ...JSON.parse(value.inputJson!).metadata, psdSource } }) });
    const current = batch([image("background", 0), image("foreground", 1)]);
    const tasks = [current.plan, current.ocr, ...current.images].map((value) => bind(value, source));
    expect(psdRecoveryBatches(tasks, source)).toHaveLength(1);
    for (const changed of [{ projectId: "other" }, { sectionId: "other" }, { sessionId: "other" }, { versionId: "new-version" }]) expect(psdRecoveryBatches(tasks, { ...source, ...changed })).toEqual([]);
    expect(psdRecoveryBatches(tasks)).toEqual([]);
    expect(psdRecoveryImages({ ...current, plan: tasks[0], ocr: tasks[1], images: tasks.slice(2) }, ["generate", "generate"])).toHaveLength(2);
    expect(() => psdRecoveryImages({ ...current, plan: tasks[0], ocr: tasks[1], images: [tasks[2], bind(tasks[3], { ...source, sectionId: "other" })] }, ["generate", "generate"])).toThrow("其他商品模块");
    expect(() => psdRecoveryImages({ ...current, images: [bind(current.images[0], source), current.images[1]] }, ["generate", "generate"])).toThrow("其他商品模块");
});
