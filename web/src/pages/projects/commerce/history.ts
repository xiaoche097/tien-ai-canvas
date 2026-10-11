import localforage from "localforage";
import type { CommerceDraft } from "./draft";
import type { PlatformRule } from "./platform-standards";
import type { TaskStatus } from "@/services/api/task-center";
import type { CommercePlanning } from "./design-plan";

export type CommerceSession = { taskId: string; rule: PlatformRule; size: string; prompt: string; tasks?: { taskId: string; title: string }[]; expectedCount?: number };
export type CommerceRecord = CommerceSession & { draft: CommerceDraft; createdAt: string; status: TaskStatus };
export type CommerceEditingTask = { id: string; draft: CommerceDraft; session?: CommerceRecord; planning?: CommercePlanning };
export const commerceSessions = localforage.createInstance({ name: "yingce", storeName: "commerce_generation", driver: localforage.INDEXEDDB });
export const commerceSessionKey = (userId: string) => `main-image:user:${userId}`;
const records = localforage.createInstance({ name: "yingce", storeName: "commerce_history", driver: localforage.INDEXEDDB });
export const commerceHistory = {
    read: async (userId: string) => (await records.getItem<CommerceRecord[]>(commerceSessionKey(userId))) || [],
    save: (userId: string, value: CommerceRecord[]) => records.setItem(commerceSessionKey(userId), value),
};
const workspace = localforage.createInstance({ name: "yingce", storeName: "commerce_workspace", driver: localforage.INDEXEDDB });
export const commerceWorkspace = {
    read: (userId: string) => workspace.getItem<{ tasks: CommerceEditingTask[]; activeId: string }>(commerceSessionKey(userId)),
    save: (userId: string, tasks: CommerceEditingTask[], activeId: string) => workspace.setItem(commerceSessionKey(userId), { tasks, activeId }),
};
