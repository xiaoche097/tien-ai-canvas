import type {
  AiMonitorContext,
  ImageEditRequest,
  ImageGenerationRequest,
  ProviderAdapter,
  StructuredRequest,
  TextRequest,
} from "@/lib/ai/provider-client";
import { OpenAICompatibleAdapter } from "@/lib/ai/adapters/openai-compatible";

export type CanvasCatalogModel = {
  id: string;
  modelKey: string;
  displayName: string;
  capability: string;
  protocol: string;
  available: boolean;
  capabilityConfig?: { text?: { references?: { maxImages?: number } }; image?: { references?: { maxImages?: number } } };
};

export type CanvasCatalogChannel = { id: string; models: CanvasCatalogModel[] };

type ModelRoute = { channelId: string; modelKey: string; protocol: string };
type CanvasTask = { id: string; status: string; error?: string; resultJson?: string };

function jsonText(raw: string) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

export class CanvasProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly routes: Map<string, ModelRoute>,
    private readonly backendURL: string,
    private readonly cookie: string,
  ) {}

  private adapterFor(model: string) {
    const route = this.routes.get(model);
    if (!route) throw new Error("境彻模型不可用");
    const baseURL = new URL(`/api/ai/system/${encodeURIComponent(route.channelId)}`, this.backendURL);
    return { adapter: new OpenAICompatibleAdapter(baseURL.toString(), "canvas", { Cookie: this.cookie }), route };
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(new URL(path, this.backendURL), {
      ...init,
      headers: { ...Object.fromEntries(new Headers(init.headers)), Cookie: this.cookie },
      cache: "no-store",
    });
    const envelope = await response.json();
    if (!response.ok || envelope?.code !== 0) throw new Error(envelope?.msg || `境彻请求失败 (${response.status})`);
    return envelope.data as T;
  }

  private async uploadImage(raw: string, signal?: AbortSignal) {
    if (/^https?:\/\//i.test(raw)) {
      const imported = await this.request<{ resource: { id: string } }>("/api/resources/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: raw, kind: "image" }), signal,
      });
      return { storageKey: `resource:${imported.resource.id}` };
    }
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(raw);
    if (!match) throw new Error("参考图片格式不支持，请使用 PNG、JPEG 或 WebP 图片");
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length) throw new Error("参考图片为空");
    const form = new FormData();
    form.append("kind", "image");
    form.append("file", new Blob([new Uint8Array(bytes)], { type: match[1] }), `motu-reference.${match[1].split("/")[1]}`);
    const uploaded = await this.request<{ resource: { id: string } }>("/api/resources", { method: "POST", body: form, signal });
    return { storageKey: `resource:${uploaded.resource.id}` };
  }

  private async runTask(input: {
    route: ModelRoute; mode: "text" | "image"; prompt: string; systemPrompt?: string;
    images?: string[]; mask?: string; monitor?: AiMonitorContext; timeoutMs?: number;
  }) {
    const signal = input.monitor?.signal;
    const referenceImages = await Promise.all((input.images ?? []).map((image) => this.uploadImage(image, signal)));
    const mask = input.mask ? await this.uploadImage(input.mask, signal) : undefined;
    const task = await this.request<CanvasTask>("/api/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal,
      body: JSON.stringify({
        type: `canvas_${input.mode}`, operation: input.mode, prompt: input.prompt, model: input.route.modelKey,
        input: {
          mode: input.mode, prompt: input.prompt,
          config: { channelId: input.route.channelId, model: input.route.modelKey, ...(input.systemPrompt ? { systemPrompt: input.systemPrompt } : {}) },
          ...(input.mode === "text" ? { textOptions: { stream: false } } : {}),
          referenceImages, ...(mask ? { mask } : {}),
        },
      }),
    });
    const deadline = Date.now() + (input.timeoutMs ?? (input.mode === "text" ? 180000 : 360000));
    try {
      while (true) {
        signal?.throwIfAborted();
        const current = await this.request<CanvasTask>(`/api/tasks/${encodeURIComponent(task.id)}`, { signal });
        if (current.status === "succeeded") {
          if (!current.resultJson) throw new Error("境彻任务没有返回结果");
          return JSON.parse(current.resultJson) as { text?: unknown; images?: Array<{ storageKey?: string; dataUrl?: string }> };
        }
        if (current.status === "failed" || current.status === "cancelled") throw new Error(current.error || "境彻生成任务失败");
        if (Date.now() >= deadline) throw new Error("境彻生成任务等待超时");
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, 1200);
          const onAbort = () => { clearTimeout(timer); reject(signal?.reason ?? new Error("生成已取消")); };
          signal?.addEventListener("abort", onAbort, { once: true });
        });
      }
    } catch (error) {
      await this.request(`/api/tasks/${encodeURIComponent(task.id)}/cancel`, { method: "POST" }).catch(() => undefined);
      throw error;
    }
  }

  private async taskImage(input: ImageGenerationRequest, route: ModelRoute, images: string[], mask?: string) {
    const result = await this.runTask({ route, mode: "image", prompt: input.prompt, images, mask, monitor: input.monitor });
    const image = result.images?.[0];
    if (!image) throw new Error("境彻任务没有返回图片");
    if (image.storageKey?.startsWith("resource:")) {
      const id = image.storageKey.slice("resource:".length);
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("境彻图片资源 ID 无效");
      const response = await fetch(new URL(`/api/resources/${encodeURIComponent(id)}/file`, this.backendURL), {
        headers: { Cookie: this.cookie }, cache: "no-store", signal: input.monitor?.signal,
      });
      if (!response.ok) throw new Error(`境彻图片读取失败 (${response.status})`);
      return { b64Json: Buffer.from(await response.arrayBuffer()).toString("base64"), canvasResourceId: id };
    }
    if (image.dataUrl?.startsWith("data:image/")) return { b64Json: image.dataUrl.split(",", 2)[1] };
    throw new Error("境彻任务返回的图片资源无效");
  }

  async testConnection() {
    return { ok: this.routes.size > 0, providerLabel: "境彻模型" };
  }

  async listModels() {
    return [...this.routes.keys()].map((id) => ({ id, label: id }));
  }

  async generateText(input: TextRequest) {
    const { adapter, route } = this.adapterFor(input.model);
    if (route.protocol === "chat-completion") return adapter.generateText({ ...input, model: route.modelKey });
    const result = await this.runTask({ route, mode: "text", prompt: input.userPrompt, systemPrompt: input.systemPrompt,
      images: input.images, timeoutMs: input.timeoutMs, monitor: input.monitor });
    if (typeof result.text !== "string" || !result.text) throw new Error("境彻任务没有返回文本");
    return { text: result.text };
  }

  async generateStructured<T>(input: StructuredRequest<T>) {
    const { adapter, route } = this.adapterFor(input.model);
    if (route.protocol === "chat-completion") return adapter.generateStructured({ ...input, model: route.modelKey });
    const result = await this.generateText({ ...input, systemPrompt: `${input.systemPrompt || ""}\nReturn one strict JSON object only. No markdown.` });
    return { parsed: input.schema.parse(JSON.parse(jsonText(result.text))), raw: result.text };
  }

  generateImage(input: ImageGenerationRequest) {
    const { adapter, route } = this.adapterFor(input.model);
    if (["openai-image", "grok-image", "volcengine-ark-image"].includes(route.protocol)) {
      return adapter.generateImage({ ...input, model: route.modelKey });
    }
    return this.taskImage(input, route, input.referenceImages ?? []);
  }

  editImage(input: ImageEditRequest) {
    const { adapter, route } = this.adapterFor(input.model);
    if (["openai-image", "grok-image"].includes(route.protocol)) return adapter.editImage({ ...input, model: route.modelKey });
    return this.taskImage(input, route, [input.image, ...(input.referenceImages ?? [])], input.mask);
  }
}
