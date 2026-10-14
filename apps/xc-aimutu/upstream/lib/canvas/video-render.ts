import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { headers } from "next/headers";
import { canvasFile, canvasRequest } from "@/lib/canvas/backend";
import { canvasUserDirectory } from "@/lib/canvas/scope";
import { motuFileUrl } from "@/lib/utils/public-url";

type Scene = { index: number; duration: number; copy?: string };
type CanvasTask = { id: string; type: string; status: string; progress: number; stage: string; error?: string; resultJson?: string };
type Metadata = { taskId: string; voiceFile?: string; bgmFile?: string; transition?: string; sceneEnds: number[] };

function videoDir() { return path.join(canvasUserDirectory(), "storage", "videos"); }
function validTaskId(id: string) { if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error("视频任务 ID 无效"); return id; }
function backendPath(pathname: string) { return `/api/${pathname}`; }

export async function getCanvasVideoTask(id: string) {
  const task = await canvasRequest<CanvasTask>(backendPath(`tasks/${encodeURIComponent(validTaskId(id))}`));
  if (task.type !== "timeline_render") throw new Error("视频任务类型无效");
  return task;
}

function imageBuffer(raw: string) {
  const base64 = raw.replace(/^data:image\/[^;]+;base64,/, "");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 16 || bytes.length > 20 * 1024 * 1024) throw new Error("场景图片大小无效");
  const mime = bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg"
    : bytes[0] === 0x89 && bytes[1] === 0x50 ? "image/png"
    : bytes.subarray(0, 4).toString() === "RIFF" ? "image/webp" : "";
  if (!mime) throw new Error("场景图片格式不支持");
  return { bytes, mime, extension: mime.split("/")[1] };
}

async function uploadImage(raw: string, index: number) {
  const { bytes, mime, extension } = imageBuffer(raw);
  const form = new FormData();
  form.append("kind", "image");
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), `motu-scene-${index}.${extension}`);
  const result = await canvasRequest<{ resource: { id: string } }>(backendPath("resources"), { method: "POST", body: form });
  return result.resource.id;
}

async function generateNarration(text: string, voice: string, speed: number) {
  const catalog = await canvasRequest<{ channels: Array<{ id: string; models: Array<{ modelKey: string; capability: string; protocol: string; available: boolean }> }> }>(backendPath("model-catalog"));
  const channel = catalog.channels.find((item) => item.models.some((model) => model.available && model.capability === "audio" && model.protocol === "openai-audio"));
  const model = channel?.models.find((item) => item.available && item.capability === "audio" && item.protocol === "openai-audio");
  if (!channel || !model) throw new Error("境彻当前没有可用的配音模型（需要 OpenAI Audio 协议）");
  const base = process.env.CANVAS_BACKEND_INTERNAL_URL;
  if (!base) throw new Error("境彻服务地址未配置");
  const response = await fetch(new URL(`/api/ai/system/${encodeURIComponent(channel.id)}/audio/speech`, base), {
    method: "POST",
    headers: { Cookie: headers().get("cookie") ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({ model: model.modelKey, input: text, voice, speed, response_format: "mp3" }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`境彻配音生成失败 (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error("配音生成结果为空");
  return bytes;
}

export async function submitCanvasVideo(input: {
  storyboard: { title?: string; hook: Scene; scenes: Scene[]; cta: Scene; video_aspect?: string | null };
  sceneImages: Record<string, string>;
  voiceName: string; voiceRate: number; transitionMode?: string | null;
  bgmBase64?: string | null; bgmFileName?: string | null;
}) {
  const scenes = [input.storyboard.hook, ...input.storyboard.scenes, input.storyboard.cta];
  if (scenes.length < 2 || scenes.length > 40) throw new Error("分镜数量无效");
  if (!scenes.every((scene) => Number.isFinite(scene.duration) && scene.duration > 0 && input.sceneImages[String(scene.index)])) {
    throw new Error("每个分镜都需要有效时长和图片");
  }
  if (Object.values(input.sceneImages).reduce((size, image) => size + image.length, 0) > 80 * 1024 * 1024) {
    throw new Error("场景图片总大小不能超过 64MB");
  }
  const narration = scenes.map((scene) => scene.copy?.trim()).filter(Boolean).join("。 ");
  const voice = narration ? await generateNarration(narration, input.voiceName, input.voiceRate) : undefined;
  let bgm: Buffer | undefined;
  if (input.bgmBase64) {
    bgm = Buffer.from(input.bgmBase64, "base64");
    if (bgm.length === 0 || bgm.length > 20 * 1024 * 1024) throw new Error("背景音乐大小无效");
  }
  const project = await canvasRequest<{ project: { id: string } }>(backendPath("projects"), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: `电商设计室视频 ${new Date().toISOString()}`, type: "video", aspectRatio: input.storyboard.video_aspect || "9:16" }),
  });
  const clips = [];
  let startMs = 0;
  for (const scene of scenes) {
    const resourceId = await uploadImage(input.sceneImages[String(scene.index)], scene.index);
    const durationMs = Math.round(scene.duration * 1000);
    clips.push({ id: `scene-${clips.length}`, kind: "image", trackId: "motu-video", startMs, durationMs,
      directMedia: { id: resourceId, kind: "image", storageKey: `resource:${resourceId}` } });
    startMs += durationMs;
  }
  const task = await canvasRequest<CanvasTask>(backendPath("timeline/renders"), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: project.project.id, timeline: { version: 2, aspectRatio: input.storyboard.video_aspect || "9:16", tracks: [{ id: "motu-video", kind: "video", visible: true }], clips, durationMs: startMs } }),
  });
  validTaskId(task.id);
  const dir = videoDir();
  await fs.mkdir(dir, { recursive: true });
  const metadata: Metadata = { taskId: task.id, transition: input.transitionMode || undefined,
    sceneEnds: clips.map((clip) => clip.startMs + clip.durationMs).slice(0, -1) };
  if (voice) { metadata.voiceFile = `${task.id}-voice.mp3`; await fs.writeFile(path.join(dir, metadata.voiceFile), voice); }
  if (bgm) { metadata.bgmFile = `${task.id}-bgm`; await fs.writeFile(path.join(dir, metadata.bgmFile), bgm); }
  await fs.writeFile(path.join(dir, `${task.id}.json`), JSON.stringify(metadata));
  return task.id;
}

export async function downloadCanvasVideo(id: string) {
  const task = await getCanvasVideoTask(id);
  if (task.status !== "succeeded") throw new Error("视频任务尚未完成");
  const result = JSON.parse(task.resultJson || "{}");
  if (typeof result.resourceId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(result.resourceId)) throw new Error("视频任务结果无效");
  const dir = videoDir();
  const metadata = JSON.parse(await fs.readFile(path.join(dir, `${id}.json`), "utf8")) as Metadata;
  if (metadata.taskId !== id) throw new Error("视频任务数据无效");
  const fileName = `${id}.mp4`;
  const target = path.join(dir, fileName);
  try {
    const existing = await fs.stat(target);
    return { url: motuFileUrl(`videos/${fileName}`), fileName, size: existing.size };
  } catch { /* first download */ }
  const source = path.join(dir, `${id}-source.mp4`);
  const tmp = path.join(dir, `${id}-output.mp4`);
  try {
    await fs.writeFile(source, await canvasFile(backendPath(`resources/${encodeURIComponent(result.resourceId)}/file`)));
    const args = ["-nostdin", "-y", "-i", source];
    if (metadata.voiceFile) args.push("-i", path.join(dir, metadata.voiceFile));
    if (metadata.bgmFile) args.push("-stream_loop", "-1", "-i", path.join(dir, metadata.bgmFile));
    const filters: string[] = [];
    if (metadata.transition === "fade_in") filters.push("fade=t=in:st=0:d=0.5");
    if (metadata.transition === "fade_out") filters.push(`fade=t=out:st=${Math.max(0, Number(result.durationMs || 0) / 1000 - 0.5)}:d=0.5`);
    if (metadata.transition === "shuffle") {
      for (const endMs of metadata.sceneEnds) {
        const at = endMs / 1000;
        filters.push(`fade=t=out:st=${Math.max(0, at - 0.2)}:d=0.2`, `fade=t=in:st=${at}:d=0.2`);
      }
    }
    if (filters.length) args.push("-vf", filters.join(","));
    const voiceInput = metadata.voiceFile ? 1 : -1;
    const bgmInput = metadata.bgmFile ? (metadata.voiceFile ? 2 : 1) : -1;
    if (voiceInput >= 0 && bgmInput >= 0) {
      args.push("-filter_complex", `[${voiceInput}:a]volume=1[voice];[${bgmInput}:a]volume=0.2[bgm];[voice][bgm]amix=inputs=2:duration=longest[aout]`, "-map", "0:v", "-map", "[aout]");
    } else if (voiceInput >= 0 || bgmInput >= 0) {
      args.push("-map", "0:v", "-map", `${voiceInput >= 0 ? voiceInput : bgmInput}:a`);
    } else args.push("-map", "0:v", "-map", "0:a?");
    args.push("-t", String(Number(result.durationMs || 0) / 1000), "-c:v", filters.length ? "libx264" : "copy", "-c:a", "aac", "-movflags", "+faststart", tmp);
    execFileSync("ffmpeg", args, { timeout: 300000, stdio: "ignore" });
    await fs.rename(tmp, target);
    const stat = await fs.stat(target);
    return { url: motuFileUrl(`videos/${fileName}`), fileName, size: stat.size };
  } finally {
    await fs.rm(source, { force: true });
    await fs.rm(tmp, { force: true });
  }
}

export async function canvasVideoHistory() {
  const dir = videoDir();
  try {
    const files = await fs.readdir(dir);
    const videos = await Promise.all(files.filter((name) => /^[a-zA-Z0-9_-]+\.mp4$/.test(name)).map(async (fileName) => {
      const stat = await fs.stat(path.join(dir, fileName));
      return { fileName, url: motuFileUrl(`videos/${fileName}`), size: stat.size, createdAt: stat.birthtime.toISOString() };
    }));
    return videos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
