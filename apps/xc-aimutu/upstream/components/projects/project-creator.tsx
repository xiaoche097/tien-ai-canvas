"use client";

import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UploadCloud } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "@/components/shared/image-upload";
import { fileToBase64Payload } from "@/lib/utils/base64-upload";
import { assetTypeLabels, platformLabels, platformOptions, styleLabels, styleOptions } from "@/types/domain";
import { projectCreateSchema } from "@/lib/validations/project";

type ProjectCreateValues = z.input<typeof projectCreateSchema>;
type UploadBucketKey = "MAIN" | "ANGLE" | "DETAIL" | "REFERENCE" | "PACKAGING" | "NUTRITION" | "INGREDIENT";
type UploadBuckets = Record<UploadBucketKey, File[]>;

export function ProjectCreator() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [activeBucket, setActiveBucket] = useState<UploadBucketKey>("MAIN");
  const [uploads, setUploads] = useState<UploadBuckets>({
    MAIN: [],
    ANGLE: [],
    DETAIL: [],
    REFERENCE: [],
    PACKAGING: [],
    NUTRITION: [],
    INGREDIENT: [],
  });

  const form = useForm<ProjectCreateValues>({
    resolver: zodResolver(projectCreateSchema),
    defaultValues: {
      name: "",
      platform: "general_ecommerce",
      style: "generic_clean",
      description: "",
      productInfo: "",
      category: "",
      sellingPoints: "",
      targetAudience: "",
    },
  });

  const assetGroups = useMemo(
    () =>
      [
        {
          type: "MAIN" as const,
          label: assetTypeLabels.MAIN,
          hint: "商品正面或整体实物图。尽量保持主体完整、清晰，避免混入不同款式。",
          multiple: false,
          required: false,
        },
        {
          type: "ANGLE" as const,
          label: assetTypeLabels.ANGLE,
          hint: "同一商品的侧面、背面等角度，可连续添加多张。",
          multiple: true,
          required: false,
        },
        {
          type: "DETAIL" as const,
          label: assetTypeLabels.DETAIL,
          hint: "材质、工艺和功能特写，用于展示商品细节。",
          multiple: true,
          required: false,
        },
        {
          type: "REFERENCE" as const,
          label: assetTypeLabels.REFERENCE,
          hint: "希望参考的视觉风格或构图，商品本身仍以实物图为准。",
          multiple: true,
          required: false,
        },
        {
          type: "PACKAGING" as const,
          label: assetTypeLabels.PACKAGING,
          hint: "外包装及品牌标识，帮助保留实际包装样式。",
          multiple: true,
          required: false,
        },
        {
          type: "NUTRITION" as const,
          label: assetTypeLabels.NUTRITION,
          hint: "清晰的营养成分表，便于提取准确的规格数据。",
          multiple: false,
          required: false,
        },
        {
          type: "INGREDIENT" as const,
          label: assetTypeLabels.INGREDIENT,
          hint: "清晰的配料表，便于准确描述商品成分。",
          multiple: false,
          required: false,
        },
      ],
    [],
  );

  const updateBucket = (type: UploadBucketKey, files: File[]) => {
    setUploads((current) => ({
      ...current,
      [type]: files,
    }));
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      const accessKey = typeof window !== "undefined" ? localStorage.getItem("bm_access_key") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessKey) headers["x-access-key"] = accessKey;

      const createResponse = await fetch("/api/projects", {
        method: "POST",
        headers,
        body: JSON.stringify(values),
      });
      const createdPayload = await createResponse.json();
      if (!createdPayload.success) throw new Error(createdPayload.error?.message ?? "创建项目失败");

      const projectId = createdPayload.data.id as string;

      for (const [type, files] of Object.entries(uploads) as Array<[UploadBucketKey, File[]]>) {
        for (const file of files) {
          const base64Payload = await fileToBase64Payload(file);
          const uploadResponse = await fetch(`/api/projects/${projectId}/assets/upload`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type,
              ...base64Payload,
            }),
          });
          const uploadPayload = await uploadResponse.json();
          if (!uploadPayload.success) {
            throw new Error(uploadPayload.error?.message ?? `${file.name} 上传失败`);
          }
        }
      }

      toast.success("项目已创建");
      router.push(`/projects/${projectId}/analysis`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建项目失败");
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <div className="motu-project-creator">
      <div className="motu-creator-layout">
      <fieldset disabled={submitting} className="motu-creator-fields">
        <legend className="sr-only">项目与商品资料</legend>
        <div className="motu-section-heading"><h2>项目设定</h2><span>名称、平台与视觉风格</span></div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="project-name">项目名称</Label>
            <Input id="project-name" {...form.register("name")} aria-invalid={!!form.formState.errors.name} aria-describedby={form.formState.errors.name ? "project-name-error" : undefined} placeholder="例如：蕉感绒毛毯 · 春季主推款" />
            {form.formState.errors.name && <p id="project-name-error" role="alert" className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-platform">销售平台</Label>
            <select id="project-platform" className="flex h-10 w-full border border-input bg-card px-3 text-sm" {...form.register("platform")}>
              {platformOptions.map((option) => (
                <option key={option} value={option}>
                  {platformLabels[option]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-style">视觉风格</Label>
            <select id="project-style" className="flex h-10 w-full border border-input bg-card px-3 text-sm" {...form.register("style")}>
              {styleOptions.map((option) => (
                <option key={option} value={option}>
                  {styleLabels[option]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="motu-section-heading motu-section-divider"><h2>商品资料</h2><span>用于分析与文案规划</span></div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="project-product-info">产品信息</Label>
            <Textarea id="project-product-info" {...form.register("productInfo")} placeholder="商品名称、材质、规格，以及需要展示的细节" rows={3} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-category">品类</Label>
            <Input id="project-category" {...form.register("category")} placeholder="如：食品、服装、数码配件" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-audience">目标人群</Label>
            <Input id="project-audience" {...form.register("targetAudience")} placeholder="主要使用或购买这款商品的人群" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="project-selling-points">核心卖点</Label>
            <Textarea id="project-selling-points" {...form.register("sellingPoints")} placeholder="列出需要重点呈现的卖点，建议每行一条" rows={3} />
          </div>
        </div>
        <details className="motu-project-notes">
          <summary>补充备注 <span className="text-muted-foreground">选填</span></summary>
          <Label htmlFor="project-description" className="sr-only">补充备注</Label>
          <Textarea id="project-description" className="mt-3" {...form.register("description")} placeholder="补充平台策略、投放目标或其他要求" />
        </details>
      </fieldset>

        <aside className="motu-creator-assets" aria-label="分类商品素材">
          <div className="motu-section-heading"><h2>商品素材</h2><span>{Object.values(uploads).reduce((count, files) => count + files.length, 0)} 张</span></div>
          <p className="mb-5 text-xs leading-5 text-muted-foreground">按用途归类，便于在生成时准确引用。所有类别均为选填。</p>
          <div className="motu-asset-categories" role="group" aria-label="素材类别">
            {assetGroups.map(group => (
              <button key={group.type} id={`asset-category-${group.type}`} type="button" aria-pressed={activeBucket === group.type} aria-controls={`asset-panel-${group.type}`} disabled={submitting} onClick={() => setActiveBucket(group.type)}>
                {group.label}{uploads[group.type].length > 0 && <span aria-label={`${uploads[group.type].length} 张图片`}>{uploads[group.type].length}</span>}
              </button>
            ))}
          </div>
          {assetGroups.map((group) => (
            <section key={group.type} id={`asset-panel-${group.type}`} hidden={activeBucket !== group.type} aria-labelledby={`asset-category-${group.type}`} className="motu-asset-panel min-w-0">
              <ImageUpload
                id={`project-upload-${group.type}`}
                label={group.label}
                description={group.hint}
                files={uploads[group.type]}
                multiple={group.multiple}
                disabled={submitting}
                onChange={files => updateBucket(group.type, files)}
              />
            </section>
          ))}
        </aside>
      </div>

      <div className="motu-creator-actions" aria-busy={submitting}>
        <p className="text-xs text-muted-foreground" role="status">{submitting ? "正在创建项目并上传素材，请稍候…" : "创建后进入分析，继续确认卖点与详情页规划。"}</p>
        <Button className="motu-studio-primary" onClick={onSubmit} disabled={submitting}>
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
          创建项目并上传素材
        </Button>
      </div>
    </div>
  );
}
