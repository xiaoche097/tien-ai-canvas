import { ProjectCreator } from "@/components/projects/project-creator";
import { PageHeader } from "@/components/shared/page-header";

export default function NewProjectPage() {
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="高级创建"
        description="设置项目风格，按主图、角度和细节分类准备素材。"
      />
      <ProjectCreator />
    </div>
  );
}
