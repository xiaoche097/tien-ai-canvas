import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { canvasRequest } from "@/lib/canvas/backend";
import { canvasUserDirectory } from "@/lib/canvas/scope";
import type { CanvasCatalogChannel } from "@/lib/canvas/provider-adapter";

export const modelRoles = [
  "analysisModelId", "planningModelId", "heroImageModelId", "detailImageModelId",
  "imageEditModelId", "videoScriptModelId", "videoVLMModelId",
] as const;
export type ModelRole = (typeof modelRoles)[number];
export type ModelAssignments = Partial<Record<ModelRole, string>>;

export class InvalidModelAssignmentError extends Error {}

export const modelAssignmentsSchema = z.object(Object.fromEntries(
  modelRoles.map((role) => [role, z.string().min(1).max(300).optional()]),
) as Record<ModelRole, z.ZodOptional<z.ZodString>>).strict();

export type SelectableModel = { id: string; label: string; capability: "text" | "image"; vision: boolean; maxImages: number; imageEdit: boolean };

export async function canvasModels() {
  const catalog = await canvasRequest<{ channels: CanvasCatalogChannel[] }>("/api/model-catalog");
  if (!Array.isArray(catalog.channels)) throw new Error("境彻模型目录响应无效");
  const seen = new Set<string>();
  const models: Array<SelectableModel & { channelId: string; modelKey: string; protocol: string }> = [];
  for (const channel of catalog.channels) {
    for (const model of channel.models) {
      if (!model.available || seen.has(model.modelKey)) continue;
      if (model.capability !== "text" && model.capability !== "image") continue;
      seen.add(model.modelKey);
      models.push({
        id: model.modelKey, label: model.displayName || model.modelKey,
        capability: model.capability, channelId: channel.id, modelKey: model.modelKey, protocol: model.protocol,
        vision: model.capability === "text" && (model.capabilityConfig?.text?.references?.maxImages ?? 0) > 0,
        maxImages: model.capabilityConfig?.text?.references?.maxImages ?? 0,
        imageEdit: model.capability === "image" && (model.capabilityConfig?.image?.references?.maxImages ?? 0) > 0,
      });
    }
  }
  return models;
}

export function canAssignModel(model: SelectableModel, role: ModelRole) {
  if (role === "imageEditModelId") return model.imageEdit;
  if (role === "heroImageModelId" || role === "detailImageModelId") return model.capability === "image";
  if (role === "analysisModelId" || role === "videoScriptModelId" || role === "videoVLMModelId") return model.capability === "text" && model.vision;
  return model.capability === "text";
}

function settingsPath() {
  return path.join(canvasUserDirectory(), "model-assignments.json");
}

export async function readModelAssignments(): Promise<ModelAssignments> {
  try {
    return modelAssignmentsSchema.parse(JSON.parse(await fs.readFile(settingsPath(), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function saveModelAssignments(assignments: ModelAssignments, models: SelectableModel[]) {
  const parsed = modelAssignmentsSchema.parse(assignments);
  for (const role of modelRoles) {
    const id = parsed[role];
    if (id && !models.some((model) => model.id === id && canAssignModel(model, role))) {
      throw new InvalidModelAssignmentError(`所选模型不支持 ${role}，请刷新模型目录后重试`);
    }
  }
  const file = settingsPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, JSON.stringify(parsed), { flag: "wx" });
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true });
  }
  return parsed;
}
