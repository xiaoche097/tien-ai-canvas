import { expect, test } from "bun:test";
import { buildGenerationConfig } from "@/lib/canvas/canvas-project-generation";
import { createCanvasNode } from "@/lib/canvas/canvas-project-domain";
import { specFromConfig, generationSpecMetadata, synchronizeGenerationSpec } from "@/lib/canvas/generation-contract";
import { defaultModelCapabilityConfig } from "@/lib/model-capabilities";
import { projectImageParameters } from "@/lib/image-parameters";
import { backendProviderConfig, prepareBackendGenerationTask } from "@/services/api/generation-task";
import { defaultConfig, type AiConfig } from "@/stores/use-config-store";
import { CanvasNodeType } from "@/types/canvas";
import { prepareCanvasBatchTableGeneration } from "@/lib/canvas/canvas-batch-table-state";

test("batch output persists resolution and image parameters before queueing", () => {
    const input = createCanvasNode(CanvasNodeType.Image, { x: 0, y: 0 }, { content: "/api/resources/input/file", storageKey: "resource:input" });
    const row = { id: "row", enabled: true, inputNodeIds: [input.id], prompt: "batch prompt" };
    const source = createCanvasNode(CanvasNodeType.BatchTable, { x: 400, y: 0 }, { batchTable: { operation: "creative", concurrency: 1, rows: [row] } });
    const result = prepareCanvasBatchTableGeneration({ nodes: [source, input], connections: [], sourceNodeId: source.id, rows: [row], config: defaultConfig, settings: { ...defaultConfig, imageResolution: "4k", imageParameters: '{"detail":"high"}', size: "3:4" }, assets: [] });
    const output = result.nodes.find((node) => node.id === result.targets[0].nodeId)!;
    expect(output.metadata).toMatchObject({ imageResolution: "4k", imageParameters: '{"detail":"high"}', size: "3:4" });
    expect(result.targets[0].inputSnapshot).toBeDefined();
});

for (const retry of [false, true]) {
    test.each(["1k", "2k", "4k"])(`batch %s settings survive node configuration and backend serialization (retry=${retry})`, async (resolution) => {
        const capabilityConfig = defaultModelCapabilityConfig();
        capabilityConfig.image = projectImageParameters(capabilityConfig.image!, [
            { name: "size", label: "画幅", type: "string", encoding: "ratio", enabled: true, values: ["1:1", "3:4"], default: "1:1" },
            { name: "imageResolution", label: "分辨率", type: "string", enabled: true, values: ["1k", "2k", "4k"], default: "1k" },
        ]);
        const globalConfig: AiConfig = {
            ...defaultConfig,
            model: "batch::image-model",
            imageModel: "batch::image-model",
            imageResolution: "1k",
            imageParameters: "{}",
            size: "1:1",
            channels: [{
                id: "batch", name: "Batch", baseUrl: "/api", apiKey: "", apiFormat: "openai", interfaceType: "openai-image", scope: "user",
                models: ["image-model"], modelCosts: [{ model: "image-model", capability: "image", capabilityConfig }],
            }],
        };
        const node = createCanvasNode(CanvasNodeType.Image, { x: 0, y: 0 }, retry
            ? generationSpecMetadata(specFromConfig("image", "old prompt", globalConfig))
            : {});
        const output = synchronizeGenerationSpec(node, {
            model: globalConfig.model, composerContent: "batch prompt", size: "3:4",
            imageResolution: resolution, imageParameters: "{}", count: 1,
        });
        const config = buildGenerationConfig(globalConfig, output, "image");
        expect(config.imageResolution).toBe(resolution);
        expect(config.size).toBe("3:4");
        expect(output.metadata?.generationSpec?.prompt).toBe("batch prompt");
        expect(backendProviderConfig(config)).toMatchObject({
            imageResolution: resolution, size: "3:4", imageParameters: { size: "3:4", imageResolution: resolution },
        });
        const task = await prepareBackendGenerationTask({ mode: "image", prompt: "batch prompt", config });
        expect(task.input.config).toMatchObject({
            imageResolution: resolution, size: "3:4", imageParameters: { size: "3:4", imageResolution: resolution },
        });
    });
}
