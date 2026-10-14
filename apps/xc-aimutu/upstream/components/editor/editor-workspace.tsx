"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ImageLightbox } from "@/components/shared/image-lightbox";
import { useEditorStore } from "@/hooks/use-editor-store";
import { useAuthStore } from "@/hooks/use-auth-store";
import { getAuthHeaders } from "@/lib/utils/auth-client";
import { ModuleTreePanel } from "./module-tree-panel";
import { PhonePreviewPanel } from "./phone-preview-panel";
import { EditorPanel } from "./editor-panel";

interface EditorWorkspaceProps {
  project: any;
}

export function EditorWorkspace({ project: initialProject }: EditorWorkspaceProps) {
  const [project, setProject] = useState(initialProject);
  const [checkedReferences, setCheckedReferences] = useState<string[]>([]);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [cancellingGeneration, setCancellingGeneration] = useState(false);
  const [selectedHeroIndex, setSelectedHeroIndex] = useState(0);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const { selectedSectionId, setSelectedSectionId } = useEditorStore();

  const selectedSection = useMemo(
    () => project.sections.find((section: any) => section.id === selectedSectionId) ?? project.sections[0] ?? null,
    [project.sections, selectedSectionId]
  );

  useEffect(() => {
    setCheckedReferences([]);
  }, [selectedSectionId]);

  useEffect(() => {
    if (!runningAction) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [runningAction]);

  useEffect(() => {
    if (!selectedSectionId && initialProject.sections[0]) {
      setSelectedSectionId(initialProject.sections[0].id);
    }
  }, [initialProject.sections, selectedSectionId, setSelectedSectionId]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_CANVAS_INTEGRATION !== "1" || !initialProject.assets.some((asset: any) =>
      asset.type === "GENERATED" && asset.metadata?.canvasSyncStatus !== "synced")) return;
    void fetch(`/api/projects/${initialProject.id}/sync-assets`, { method: "POST" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error?.message || "同步失败");
      if (payload.data.synced > 0) toast.success(`已将 ${payload.data.synced} 张既有图片同步到境彻资产`);
      if (payload.data.failed > 0) toast.warning(`${payload.data.failed} 张图片暂未同步，重新进入项目时会重试`);
    }).catch(() => toast.warning("既有图片暂未同步到境彻资产，重新进入项目时会重试"));
  }, [initialProject.id]);

  const refreshProject = useCallback(async () => {
    const response = await fetch(`/api/projects/${project.id}`);
    const payload = await response.json();
    if (payload.success) {
      setProject(payload.data);
    }
  }, [project.id]);

  const refreshGenerationStatus = useCallback(async () => {
    const response = await fetch(`/api/projects/${project.id}`);
    const payload = await response.json();
    if (!payload.success) return;
    setProject((current: any) => ({
      ...current,
      assets: payload.data.assets,
      tasks: payload.data.tasks,
      sections: current.sections.map((section: any) => {
        const latest = payload.data.sections.find((item: any) => item.id === section.id);
        return latest ? {
          ...section,
          status: latest.status,
          imageUrl: latest.imageUrl,
          currentImageAssetId: latest.currentImageAssetId,
          versions: latest.versions,
        } : section;
      }),
    }));
  }, [project.id]);

  useEffect(() => {
    if (!runningAction && !project.sections.some((section: any) => section.status === "GENERATING")) return;
    const timer = window.setInterval(() => { void refreshGenerationStatus(); }, 5000);
    return () => window.clearInterval(timer);
  }, [project.sections, runningAction, refreshGenerationStatus]);

  const saveSection = useCallback(async () => {
    if (!selectedSection) return;
    const response = await fetch(`/api/projects/${project.id}/sections/${selectedSection.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: String(selectedSection.type).toLowerCase(),
        title: selectedSection.title,
        goal: selectedSection.goal,
        copy: selectedSection.copy,
        visualPrompt: selectedSection.visualPrompt,
        editableData: selectedSection.editableData ?? {},
      }),
    });
    const payload = await response.json();
    if (!payload.success) {
      toast.error(payload.error?.message ?? "模块保存失败");
      return;
    }
    toast.success("模块已保存");
    await refreshProject();
  }, [project.id, selectedSection, refreshProject]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void saveSection();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveSection]);

  const uploadSectionReference = useCallback(
    async (file: File) => {
      if (!selectedSection) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const res = await fetch(`/api/projects/${project.id}/sections/${selectedSection.id}/upload-reference`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, mimeType: file.type, base64Data: base64 }),
        });
        if (!res.ok) {
          toast.error("上传参考图失败");
          return;
        }
        toast.success("专属参考图已上传");
        await refreshProject();
      };
      reader.readAsDataURL(file);
    },
    [project.id, selectedSection, refreshProject]
  );

  const removeSectionReference = useCallback(
    async (assetId: string) => {
      if (!selectedSection) return;
      const res = await fetch(`/api/projects/${project.id}/sections/${selectedSection.id}/remove-reference`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId }),
      });
      if (!res.ok) {
        toast.error("删除参考图失败");
        return;
      }
      toast.success("专属参考图已删除");
      await refreshProject();
    },
    [project.id, selectedSection, refreshProject]
  );

  const runGeneration = useCallback(
    async (kind: "generate" | "regenerate") => {
      if (!selectedSection) return;
      const { keyInfo } = useAuthStore.getState();
      if (keyInfo?.type === "PER_USE") {
        toast.error("次卡不支持重新生成图片");
        return;
      }
      setRunningAction(kind);
      try {
        const response = await fetch(`/api/projects/${project.id}/sections/${selectedSection.id}/${kind}`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ referenceAssetIds: checkedReferences }),
        });
        const payload = await response.json();
        if (!payload.success) {
          const message = payload.error?.message ?? "图像生成失败";
          if (!message.includes("取消")) toast.error(message);
          return;
        }
        if (payload.data?.generationMode === "svg_fallback") {
          toast.warning("当前 Provider 没有可用真实图片端点，本次结果为 SVG 兜底预览，不是最终 AI 真图。");
        } else {
          toast.success(kind === "generate" ? "模块图已生成并自动保存到当前项目" : "模块图已重新生成并自动保存到版本历史");
        }
        if (payload.data?.imageAsset?.canvasSyncWarning) toast.warning(payload.data.imageAsset.canvasSyncWarning);
        await refreshProject();
      } finally {
        setRunningAction(null);
      }
    },
    [project.id, selectedSection, checkedReferences, refreshProject]
  );

  const cancelGeneration = useCallback(async () => {
    if (!selectedSection) return;
    setCancellingGeneration(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/sections/${selectedSection.id}/cancel`, { method: "POST" });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.error?.message ?? "取消生成失败");
      toast.info(payload.data.cancelled ? "已取消本次生成" : "当前没有运行中的生成任务");
      setRunningAction(null);
      await refreshProject();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "取消生成失败");
    } finally {
      setCancellingGeneration(false);
    }
  }, [project.id, selectedSection, refreshProject]);

  const runImageEdit = useCallback(
    async (editMode: "repaint" | "enhance") => {
      if (!selectedSection) return;
      const { keyInfo } = useAuthStore.getState();
      if (keyInfo?.type === "PER_USE") {
        toast.error("次卡不支持图片编辑");
        return;
      }
      setRunningAction(editMode);
      try {
        const response = await fetch(`/api/projects/${project.id}/sections/${selectedSection.id}/edit`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ referenceAssetIds: checkedReferences, editMode }),
        });
        const payload = await response.json();
        if (!payload.success) {
          toast.error(payload.error?.message ?? "基于当前图编辑失败");
          return;
        }
        if (payload.data?.generationMode === "svg_fallback") {
          toast.warning("当前 Provider 没有可用真实图片编辑端点，本次结果为 SVG 兜底预览。");
        } else {
          toast.success(editMode === "repaint" ? "已基于当前图完成重绘，并自动保存新版本" : "已基于当前图完成增强，并自动保存新版本");
        }
        if (payload.data?.imageAsset?.canvasSyncWarning) toast.warning(payload.data.imageAsset.canvasSyncWarning);
        await refreshProject();
      } finally {
        setRunningAction(null);
      }
    },
    [project.id, selectedSection, checkedReferences, refreshProject]
  );

  const activateVersion = useCallback(
    async (versionId: string) => {
      if (!selectedSection) return;
      const response = await fetch(`/api/projects/${project.id}/sections/${selectedSection.id}/versions/${versionId}/activate`, { method: "PATCH" });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error?.message ?? "版本切换失败");
        return;
      }
      toast.success("已切换到所选版本");
      await refreshProject();
    },
    [project.id, selectedSection, refreshProject]
  );

  const updateSelectedSection = useCallback(
    (key: string, value: unknown) => {
      setProject((current: any) => ({
        ...current,
        sections: current.sections.map((section: any) =>
          section.id === selectedSection?.id ? { ...section, [key]: value } : section
        ),
      }));
    },
    [selectedSection?.id]
  );

  const handleToggleReference = useCallback((assetId: string, checked: boolean) => {
    setCheckedReferences((current) => (checked ? [...current, assetId] : current.filter((id) => id !== assetId)));
  }, []);

  return (
    <div className="grid min-h-0 gap-6 xl:grid-cols-[320px_minmax(0,1fr)_380px] xl:items-stretch">
      <ModuleTreePanel
        sections={project.sections}
        selectedSectionId={selectedSectionId}
        onSelectSection={setSelectedSectionId}
      />
      <PhonePreviewPanel
        project={project}
        selectedHeroIndex={selectedHeroIndex}
        onSelectHeroIndex={setSelectedHeroIndex}
        onOpenLightbox={setLightboxSrc}
      />
      <EditorPanel
        project={project}
        selectedSection={selectedSection}
        checkedReferences={checkedReferences}
        runningAction={runningAction}
        cancellingGeneration={cancellingGeneration}
        onUpdateSection={updateSelectedSection}
        onSave={saveSection}
        onRunGeneration={runGeneration}
        onCancelGeneration={cancelGeneration}
        onRunImageEdit={runImageEdit}
        onActivateVersion={activateVersion}
        onUploadReference={uploadSectionReference}
        onRemoveReference={removeSectionReference}
        onToggleReference={handleToggleReference}
      />
      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </div>
  );
}
