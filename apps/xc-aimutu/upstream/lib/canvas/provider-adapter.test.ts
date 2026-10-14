import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { CanvasProviderAdapter } from "./provider-adapter";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function envelope(data: unknown) {
  return Response.json({ code: 0, data, msg: "ok" });
}

test("non-OpenAI text protocol creates a Canvas task with the selected channel", async () => {
  const calls: Array<{ path: string; body?: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    calls.push({ path, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    if (path === "/api/tasks" && init?.method === "POST") return envelope({ id: "task-1" });
    if (path === "/api/tasks/task-1") return envelope({ status: "succeeded", resultJson: JSON.stringify({ text: "完成" }) });
    throw new Error(`unexpected request: ${path}`);
  };
  const adapter = new CanvasProviderAdapter(new Map([["deepseek-flash", {
    channelId: "text-channel", modelKey: "deepseek-flash", protocol: "deepseek-chat",
  }]]), "http://canvas.test", "session=test");
  assert.deepEqual(await adapter.generateText({ model: "deepseek-flash", userPrompt: "写文案" }), { text: "完成" });
  assert.deepEqual(calls.map((call) => call.path), ["/api/tasks", "/api/tasks/task-1"]);
  assert.deepEqual((calls[0].body?.input as { config: unknown }).config, { channelId: "text-channel", model: "deepseek-flash" });
});

test("Gemini image protocol uploads references and reads the owned task resource", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    calls.push(path);
    if (path === "/api/resources" && init?.method === "POST") return envelope({ resource: { id: "reference-1" } });
    if (path === "/api/tasks" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      assert.deepEqual(body.input.referenceImages, [{ storageKey: "resource:reference-1" }]);
      assert.deepEqual(body.input.config, { channelId: "image-channel", model: "nano-banana2" });
      return envelope({ id: "task-2" });
    }
    if (path === "/api/tasks/task-2") return envelope({ status: "succeeded", resultJson: JSON.stringify({ images: [{ storageKey: "resource:result-1" }] }) });
    if (path === "/api/resources/result-1/file") return new Response(Buffer.from("image-bytes"));
    throw new Error(`unexpected request: ${path}`);
  };
  const adapter = new CanvasProviderAdapter(new Map([["nano-banana2", {
    channelId: "image-channel", modelKey: "nano-banana2", protocol: "gemini-image",
  }]]), "http://canvas.test", "session=test");
  const result = await adapter.generateImage({ model: "nano-banana2", prompt: "商品主图", referenceImages: ["data:image/png;base64,c21va2U="] });
  assert.equal(Buffer.from(result.b64Json || "", "base64").toString(), "image-bytes");
  assert.equal(result.canvasResourceId, "result-1");
  assert.deepEqual(calls, ["/api/resources", "/api/tasks", "/api/tasks/task-2", "/api/resources/result-1/file"]);
});
