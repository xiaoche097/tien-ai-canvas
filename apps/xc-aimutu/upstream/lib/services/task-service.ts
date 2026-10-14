import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

const taskControllerStore = globalThis as typeof globalThis & { motuTaskControllers?: Map<string, AbortController> };
const taskControllers = taskControllerStore.motuTaskControllers ??= new Map<string, AbortController>();

export function registerTaskAbort(taskId: string) {
  const controller = new AbortController();
  taskControllers.set(taskId, controller);
  return controller.signal;
}

export function unregisterTaskAbort(taskId: string) {
  taskControllers.delete(taskId);
}

export async function cancelSectionImageTask(projectId: string, sectionId: string) {
  const task = await prisma.generationTask.findFirst({
    where: { projectId, sectionId, taskType: { in: ["GENERATE", "REGENERATE"] }, status: "RUNNING" },
    orderBy: { startedAt: "desc" },
  });
  if (!task) return false;

  taskControllers.get(task.id)?.abort();
  const updated = await prisma.generationTask.updateMany({
    where: { id: task.id, status: "RUNNING" },
    data: { status: "FAILED", completedAt: new Date(), errorMessage: "用户已取消" },
  });
  if (updated.count) {
    const section = await prisma.pageSection.findUnique({ where: { id: sectionId }, select: { currentImageAssetId: true } });
    await prisma.pageSection.updateMany({
      where: { id: sectionId, projectId, status: "GENERATING" },
      data: { status: section?.currentImageAssetId ? "SUCCESS" : "IDLE" },
    });
  }
  return updated.count > 0;
}

export async function createTask(input: {
  projectId: string;
  sectionId?: string | null;
  taskType: "ANALYZE" | "PLAN" | "GENERATE" | "REGENERATE" | "EXPORT";
  inputPayload?: unknown;
}) {
  return prisma.generationTask.create({
    data: {
      projectId: input.projectId,
      sectionId: input.sectionId ?? null,
      taskType: input.taskType,
      status: "RUNNING",
      startedAt: new Date(),
      inputPayload: (input.inputPayload ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
  });
}

export async function findRecentRunningTask(input: {
  projectId: string;
  taskType: "ANALYZE" | "PLAN" | "GENERATE" | "REGENERATE" | "EXPORT";
  sectionId?: string | null;
  maxAgeMinutes?: number;
}) {
  const maxAgeMinutes = input.maxAgeMinutes ?? 10;
  const startedAfter = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

  return prisma.generationTask.findFirst({
    where: {
      projectId: input.projectId,
      sectionId: input.sectionId ?? null,
      taskType: input.taskType,
      status: "RUNNING",
      startedAt: {
        gte: startedAfter,
      },
    },
    orderBy: {
      startedAt: "desc",
    },
  });
}

export async function completeTask(taskId: string, outputPayload?: unknown) {
  const result = await prisma.generationTask.updateMany({
    where: { id: taskId, status: "RUNNING" },
    data: {
      status: "SUCCESS",
      completedAt: new Date(),
      outputPayload: (outputPayload ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
  });
  if (!result.count) throw new Error("任务已取消或结束");
  return result;
}

export async function failTask(taskId: string, errorMessage: string) {
  return prisma.generationTask.updateMany({
    where: { id: taskId, status: "RUNNING" },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      errorMessage,
    },
  });
}
