import { z } from "zod";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getProviderAdapter } from "@/lib/services/provider-service";

const scene = z.object({
  index: z.number().int(),
  type: z.string(),
  duration: z.number().positive(),
  visual_desc: z.string().min(1),
  copy: z.string(),
  camera: z.string(),
  product_image_index: z.number().int().nullable().optional(),
  material_search_terms: z.array(z.string()).nullable().optional(),
  ai_video_prompt: z.string().nullable().optional(),
});

export const storyboard = z.object({
  title: z.string().min(1),
  hook: scene,
  scenes: z.array(scene),
  cta: scene,
  total_duration: z.number().positive(),
  bgm_mood: z.string().nullable().optional(),
  style_notes: z.string().nullable().optional(),
  video_aspect: z.string().nullable().optional(),
});

export function imageDataUrl(raw: string) {
  if (raw.startsWith("data:image/")) return raw;
  const bytes = Buffer.from(raw, "base64");
  const mime = bytes[0] === 0x89 && bytes[1] === 0x50 ? "image/png" : bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg" : "image/webp";
  return `data:${mime};base64,${raw}`;
}

async function visionTextModel(role: "script" | "vision") {
  const context = await getProviderAdapter("text");
  const model = context.provider.models.find((item) => item.capabilities.vision && (role === "script" ? item.isDefaultVideoScript : item.isDefaultVideoVLM))
    ?? context.provider.models.find((item) => item.capabilities.vision);
  if (!model) throw new Error("境彻当前没有可用的看图文本模型");
  return { adapter: context.adapter, model };
}

function modelImages(model: Awaited<ReturnType<typeof visionTextModel>>["model"], images: string[]) {
  const limit = Number(model.capabilities.max_images ?? 0);
  if (images.length > limit) throw new Error(`当前看图模型最多支持 ${limit} 张图片`);
  return images.map(imageDataUrl);
}

export async function createCanvasStoryboards(input: {
  productImages: string[];
  prompt: string;
  targetDuration: number;
  style: string;
  videoAspect: string;
  videoCount: number;
}) {
  const { adapter, model } = await visionTextModel("script");
  const images = modelImages(model, input.productImages);
  const boards = [];
  for (let index = 0; index < input.videoCount; index++) {
    const result = await adapter.generateStructured({
      model: model.modelId,
      schema: z.object({ storyboard }),
      systemPrompt: "你是电商短视频分镜师。依据商品图片和卖点生成可拍摄的中文分镜，只输出符合要求的 JSON。hook 为开场，scenes 为中间镜头，cta 为结尾；每个镜头的 index 从 0 递增，duration 单位为秒。",
      userPrompt: `卖点：${input.prompt}\n风格：${input.style}\n目标时长：${input.targetDuration} 秒\n画幅：${input.videoAspect}\n方案序号：${index + 1}/${input.videoCount}。请输出 {"storyboard":{...}}，包含 title、hook、scenes、cta、total_duration、video_aspect；每个镜头包含 index、type、duration、visual_desc、copy、camera。`,
      images,
      timeoutMs: 120000,
    });
    boards.push(result.parsed.storyboard);
  }
  return boards;
}

export async function adaptCanvasStoryboard(input: {
  analysis: unknown;
  productImages: string[];
  replacementPrompt: string;
}) {
  const { adapter, model } = await visionTextModel("script");
  const result = await adapter.generateStructured({
    model: model.modelId,
    schema: z.object({ storyboard }),
    systemPrompt: "你是电商短视频分镜师。保留原视频节奏和镜头结构，将商品和文案替换为新商品。只输出 JSON。",
    userPrompt: `原视频分析：${JSON.stringify(input.analysis)}\n新商品卖点：${input.replacementPrompt}\n输出 {"storyboard":{...}}，格式沿用原分镜。`,
    images: modelImages(model, input.productImages),
    timeoutMs: 120000,
  });
  return result.parsed.storyboard;
}

export async function analyzeCanvasVideo(file: Buffer) {
  const { adapter, model } = await visionTextModel("vision");
  const limit = Math.min(4, Number(model.capabilities.max_images ?? 0));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "motu-video-"));
  const video = path.join(directory, "reference.mp4");
  const frames: string[] = [];
  try {
    fs.writeFileSync(video, file);
    const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", video], { timeout: 15000 }).toString().trim());
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("参考视频无法读取");
    for (let index = 0; index < limit; index++) {
      const frame = path.join(directory, `frame-${index}.jpg`);
      const at = Math.max(0, Math.min(duration - 0.1, duration * (index + 0.5) / limit));
      execFileSync("ffmpeg", ["-nostdin", "-v", "error", "-ss", at.toFixed(2), "-i", video, "-frames:v", "1", "-vf", "scale=512:-2", frame], { timeout: 30000, stdio: "ignore" });
      frames.push(frame);
    }
    const images = frames.map((frame) => `data:image/jpeg;base64,${fs.readFileSync(frame).toString("base64")}`);
    const result = await adapter.generateStructured({
      model: model.modelId,
      schema: z.object({ analysis: z.object({
        original_duration: z.number().positive(),
        original_script: z.string(),
        storyboard,
        hook_type: z.string().nullable().optional(),
        pacing: z.string().nullable().optional(),
        bgm_description: z.string().nullable().optional(),
        color_grade: z.string().nullable().optional(),
      }) }),
      systemPrompt: "你是电商短视频分析师。根据按时间顺序提供的关键画面分析原视频结构。只输出 JSON，不要声称看到了未提供的画面或听到了音频。",
      userPrompt: `视频总时长 ${duration.toFixed(1)} 秒。输出 {"analysis":{...}}，其中包含 original_duration、original_script、storyboard；storyboard 包含 title、hook、scenes、cta、total_duration；每个镜头包含 index、type、duration、visual_desc、copy、camera。无法从画面判断的原音频内容在 original_script 中明确写“音频未分析”。`,
      images,
      timeoutMs: 120000,
    });
    return result.parsed;
  } finally {
    for (const frame of frames) fs.rmSync(frame, { force: true });
    fs.rmSync(video, { force: true });
    fs.rmdirSync(directory);
  }
}
