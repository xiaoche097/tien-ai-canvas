"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ImageLightbox } from "@/components/shared/image-lightbox";
import { useEditorStore } from "@/hooks/use-editor-store";
import { useAuthStore } from "@/hooks/use-auth-store";
import { getAuthHeaders } from "@/lib/utils/auth-client";
import { ModuleTreePanel } from "./module-tree-panel";
import { ProductPreviewPanel } from "./product-preview-panel";
import { EditorPanel } from "./editor-panel";
import { WorkbenchLayout } from "./workbench-layout";
import { PsdEditorPanel } from "./psd-editor-panel";
import { isModuleReference, referenceMetadata } from "@/lib/ai/module-reference";
import { buildGalleryImages, getPreviewConfig } from "./editor-utils";

interface EditorWorkspaceProps {
  project: any;
}

export function EditorWorkspace({ project: initialProject }: EditorWorkspaceProps) {
  const [project, setProject] = useState(initialProject);
  const [checkedReferences, setCheckedReferences] = useState<string[]>([]);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [cancellingGeneration, setCancellingGeneration] = useState(false);
  const [selectedHeroIndex, setSelectedHeroIndex] = useState(0);
  const [previewSelection, setPreviewSelection] = useState<{ sectionId: string; revision: number } | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [psdTarget, setPsdTarget] = useState<{ sectionId: string; assetId: string; title: string } | null>(null);
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

  const receiveReferenceAsset = useCallback((asset: any) => {
    setProject((current: any) => ({ ...current, assets: [...current.assets.filter((item: any) => item.id !== asset.id), asset] }));
  }, []);
  const adoptReference = useCallback((sectionId: string, asset: any) => {
    setProject((current: any) => ({ ...current, sections: current.sections.map((section: any) => section.id !== sectionId ? section : {
      ...section, editableData: { ...section.editableData, referenceAssetIds: [...new Set([...(section.editableData?.referenceAssetIds ?? []), asset.metadata.sourceAssetId, asset.id])] },
    }) }));
    toast.success("参考图和产品原图已加入此模块草稿，请保存模块。");
  }, []);
  const referenceBusy = useCallback((busy: boolean) => setRunningAction(busy ? "reference" : null), []);
  const rewriteSaved = useCallback((sectionId: string, value: { copy: string; visualPrompt: string }) => {
    setProject((current: any) => ({ ...current, sections: current.sections.map((section: any) => section.id === sectionId ? { ...section, copy: value.copy, visualPrompt: value.visualPrompt } : section) }));
  }, []);

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
          currentImageAsset: latest.currentImageAsset,
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
    if (!selectedSection) return false;
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
    if (!response.ok || !payload.success) {
      toast.error(payload.error?.message ?? "模块保存失败");
      return false;
    }
    toast.success("模块已保存");
    await refreshProject();
    return true;
  }, [project.id, selectedSection, refreshProject]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (psdTarget) return;
        void saveSection();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveSection, psdTarget]);

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
      const asset = project.assets.find((item: any) => item.id === assetId);
      const isReferenceSource = project.assets.some((item: any) => isModuleReference(item) && referenceMetadata(item).sourceAssetId === assetId);
      if (asset && (isModuleReference(asset) || isReferenceSource)) {
        setProject((current: any) => ({ ...current, sections: current.sections.map((section: any) => section.id !== selectedSection.id ? section : {
          ...section, editableData: { ...section.editableData, referenceAssetIds: (section.editableData?.referenceAssetIds ?? []).filter((id: string) => id !== assetId) },
        }) }));
        toast.success("已从模块草稿移除引用，图片仍保留，请保存模块。");
        return;
      }
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
    [project.id, project.assets, selectedSection, refreshProject]
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
        if (!(await saveSection())) return;
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
    [project.id, selectedSection, checkedReferences, refreshProject, saveSection]
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
        if (!(await saveSection())) return;
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
    [project.id, selectedSection, checkedReferences, refreshProject, saveSection]
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

  const handleToggleReference = useCallback(async (assetId: string, checked: boolean) => {
    const targetId = selectedSection?.id;
    const asset = project.assets.find((item: any) => item.id === assetId);
    if (checked && asset && isModuleReference(asset) && (!referenceMetadata(asset).referenceApproved || referenceMetadata(asset).referenceScope !== "project")) {
      try {
        const response = await fetch(`/api/projects/${project.id}/sections/${targetId}/reference-images`, { method: "POST", headers: getAuthHeaders(), body: JSON.stringify({ action: "approve", assetId }) });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.error?.message || "确认参考图失败");
        receiveReferenceAsset(payload.data.asset);
        if ((useEditorStore.getState().selectedSectionId ?? project.sections[0]?.id) !== targetId) return;
      } catch (error) { toast.error(error instanceof Error ? error.message : "确认参考图失败"); return; }
    }
    setCheckedReferences((current) => checked ? [...new Set([...current, assetId])] : current.filter(id => id !== assetId));
  }, [project.id, project.assets, project.sections, selectedSection?.id, receiveReferenceAsset]);

  return (
    <>
    <div className={`${psdTarget ? "hidden" : "flex"} min-h-0 flex-1 flex-col`}>
    {project.modelSnapshot?.templateApplication?.name && <p className="pb-2 text-xs text-muted-foreground">当前套版：{project.modelSnapshot.templateApplication.name}</p>}
    <WorkbenchLayout expanded={previewExpanded} left={
      <ModuleTreePanel
        sections={project.sections}
        selectedSectionId={selectedSectionId}
        onSelectSection={(id) => {
          setSelectedSectionId(id);
          const section = project.sections.find((item: any) => item.id === id);
          if (section?.type === "HERO" && section.imageUrl) {
            const images = buildGalleryImages(project, getPreviewConfig(project).heroImageCount);
            const index = images.findIndex((image) => image.id === id || image.url === section.imageUrl);
            if (index >= 0) setSelectedHeroIndex(index);
          }
          setPreviewSelection((current) => ({ sectionId: id, revision: (current?.revision ?? 0) + 1 }));
        }}
      />
    } preview={
      <ProductPreviewPanel
        project={project}
        expanded={previewExpanded}
        onToggleExpanded={() => setPreviewExpanded((value) => !value)}
        selectedHeroIndex={selectedHeroIndex}
        previewSelection={previewSelection}
        onSelectHeroIndex={(index) => { setSelectedHeroIndex(index); setPreviewSelection(null); }}
        onOpenLightbox={setLightboxSrc}
      />
    } right={
      <EditorPanel
        project={project}
        selectedSection={selectedSection}
        checkedReferences={checkedReferences}
        onReferenceAsset={receiveReferenceAsset}
        onAdoptReference={adoptReference}
        onReferenceBusy={referenceBusy}
        onRewriteSaved={rewriteSaved}
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
        onOpenPsd={() => {
          if (selectedSection?.currentImageAssetId && !runningAction && selectedSection.status !== "GENERATING") setPsdTarget({ sectionId: selectedSection.id, assetId: selectedSection.currentImageAssetId, title: selectedSection.title });
        }}
      />
    }>
      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </WorkbenchLayout>
    </div>
    {psdTarget && <PsdEditorPanel projectId={project.id} sectionId={psdTarget.sectionId} assetId={psdTarget.assetId} title={psdTarget.title} onSaved={refreshGenerationStatus} onClose={() => { setPsdTarget(null); void refreshGenerationStatus(); }} />}
    </>
  );
}
