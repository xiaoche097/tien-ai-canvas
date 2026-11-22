"use client";

import { create } from "zustand";
import type { PreviewDevice } from "@/components/editor/preview-state";

interface EditorStoreState {
  selectedSectionId: string | null;
  setSelectedSectionId: (sectionId: string | null) => void;
  previewDevices: Record<string, { platform: string; device: PreviewDevice }>;
  setPreviewDevice: (projectId: string, platform: string, device: PreviewDevice) => void;
}

export const useEditorStore = create<EditorStoreState>((set) => ({
  selectedSectionId: null,
  setSelectedSectionId: (selectedSectionId) => set({ selectedSectionId }),
  previewDevices: {},
  setPreviewDevice: (projectId, platform, device) => set((current) => ({ previewDevices: { ...current.previewDevices, [projectId]: { platform, device } } })),
}));
