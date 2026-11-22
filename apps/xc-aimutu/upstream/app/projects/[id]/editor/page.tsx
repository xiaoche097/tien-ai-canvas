import Link from "next/link";
import { notFound } from "next/navigation";

import { BatchGenerateButton } from "@/components/editor/batch-generate-button";
import { EditorWorkspace } from "@/components/editor/editor-workspace";
import { WorkbenchPageFrame } from "@/components/editor/workbench-page-frame";
import { HeroBatchGenerator } from "@/components/editor/hero-batch-generator";
import { ProjectExportButton } from "@/components/export/project-export-button";
import { PageHeader } from "@/components/shared/page-header";
import { ProjectOutputConfigCard } from "@/components/shared/project-output-config-card";
import { buttonVariants } from "@/components/ui/button";
import { getProjectDetail } from "@/lib/services/project-service";

export default async function ProjectEditorPage({ params }: { params: { id: string } }) {
  const project = await getProjectDetail(params.id);
  if (!project) notFound();

  const sections = project.sections.map((s: any) => ({
    id: s.id,
    title: s.title,
    status: s.status,
  }));

  return (
    <WorkbenchPageFrame title={project.name} header={
      <PageHeader
        eyebrow="预览与编辑"
        title={`${project.name} 的商品页工作台`}
        description="左侧选择模块，中间切换桌面或移动端商品页预览，右侧编辑标题、文案和双语视觉 Prompt，并支持生成、重绘与版本切换。"
        actions={
          <>
            <HeroBatchGenerator projectId={project.id} />
            <BatchGenerateButton projectId={project.id} sections={sections} />
            <Link href={`/projects/${project.id}/export`} className={buttonVariants({ variant: "outline" })}>
              进入导出中心
            </Link>
            <ProjectExportButton projectId={project.id}>一键导出详情页图像</ProjectExportButton>
          </>
        }
      />
    } configuration={<ProjectOutputConfigCard project={project} />}>
      <EditorWorkspace project={project} />
    </WorkbenchPageFrame>
  );
}
