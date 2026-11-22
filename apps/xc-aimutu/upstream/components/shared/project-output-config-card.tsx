"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { TemplateStyleSummary } from "./template-style-summary";
import { platformLabels, platformOptions } from "@/types/domain";
import { detailAspectRatios, normalizeDetailAspectRatio, type DetailAspectRatio } from "@/lib/utils/section-aspect-ratio";
import {
  contentLanguageLabels,
  contentLanguageOptions,
  normalizeContentLanguage,
  projectContentLanguage,
  type ContentLanguage,
} from "@/lib/utils/content-language";

type PreviewConfig = {
  platform: (typeof platformOptions)[number];
  heroImageCount: number;
  heroAspectRatio: "1:1" | "3:4";
  detailSectionCount: number;
  imageAspectRatio: DetailAspectRatio;
  contentLanguage: ContentLanguage;
};

type ProjectConfigCardProject = {
  id: string;
  platform?: string;
  modelSnapshot: unknown;
} | null;

function normalizePreviewConfig(snapshot: unknown, platform?: string): PreviewConfig {
  const data = (snapshot as Record<string, unknown> | null) ?? {};
  const previewConfig = (data.previewConfig as Record<string, unknown> | null) ?? {};

  return {
    platform: platformOptions.find((option) => option === platform) ?? "general_ecommerce",
    heroImageCount: Math.min(5, Math.max(3, Number(previewConfig.heroImageCount ?? 4))),
    heroAspectRatio: previewConfig.heroAspectRatio === "3:4" ? "3:4" : "1:1",
    detailSectionCount: Math.min(10, Math.max(4, Number(previewConfig.detailSectionCount ?? 6))),
    imageAspectRatio: normalizeDetailAspectRatio(previewConfig.imageAspectRatio, platform),
    contentLanguage: projectContentLanguage(platform, previewConfig.contentLanguage),
  };
}

function OutputConfigSummary({ config }: { config: PreviewConfig }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge variant="outline">平台：{platformLabels[config.platform]}</Badge>
        <Badge variant="default">
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-slate-500" />
          内容语言：{contentLanguageLabels[config.contentLanguage]}
        </Badge>
        <Badge variant="success">
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
          头图：{config.heroImageCount} 张（{config.heroAspectRatio}）
        </Badge>
        <Badge variant="warning">
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
          详情页：{config.detailSectionCount} 张
        </Badge>
        <Badge variant="outline">
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-sky-500" />
          详情图比例：{config.imageAspectRatio}
        </Badge>
      </div>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-sky-500" />
        这份配置会同时影响页面规划文案、图像中的文字语言，以及后续导出结果。
      </p>
    </div>
  );
}

export function ProjectOutputConfigCard({
  project,
  editable = false,
}: {
  project: ProjectConfigCardProject;
  editable?: boolean;
}) {
  const router = useRouter();
  const initialConfig = useMemo(() => normalizePreviewConfig(project?.modelSnapshot, project?.platform), [project?.modelSnapshot, project?.platform]);
  const [formState, setFormState] = useState<PreviewConfig>(initialConfig);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setFormState(initialConfig); }, [initialConfig, project?.id]);

  if (!project) {
    return null;
  }

  const hasChanges =
    formState.platform !== initialConfig.platform ||
    formState.heroImageCount !== initialConfig.heroImageCount ||
    formState.heroAspectRatio !== initialConfig.heroAspectRatio ||
    formState.detailSectionCount !== initialConfig.detailSectionCount ||
    formState.imageAspectRatio !== initialConfig.imageAspectRatio ||
    formState.contentLanguage !== initialConfig.contentLanguage;

  const saveConfig = async () => {
    try {
      setSaving(true);
      const snapshot = ((project.modelSnapshot as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: formState.platform,
          modelSnapshot: {
            ...snapshot,
            previewConfig: {
              ...((snapshot.previewConfig as Record<string, unknown> | null) ?? {}),
              heroImageCount: formState.heroImageCount,
              heroAspectRatio: formState.heroAspectRatio,
              detailSectionCount: formState.detailSectionCount,
              imageAspectRatio: formState.imageAspectRatio,
              contentLanguage: formState.contentLanguage,
            },
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error?.message ?? "输出配置保存失败");
      }

      toast.success("输出配置已保存");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "输出配置保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (!editable) {
    return (
      <Card className="border-dashed bg-muted/30 dark:bg-white/[0.03]">
        <CardContent className="space-y-3 p-4">
          <TemplateStyleSummary snapshot={project.modelSnapshot} />
          <OutputConfigSummary config={initialConfig} />
        </CardContent>
      </Card>
    );
  }

  return (
      <Card className="border-dashed bg-muted/30 dark:bg-white/[0.03]">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="h-4 w-4 text-sky-600" />
          输出配置
        </CardTitle>
        <CardDescription>这里调整的语言、头图数量与比例、详情页数量与比例，会直接影响后续规划、生成与导出。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <TemplateStyleSummary snapshot={project.modelSnapshot} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <div className="space-y-2">
            <Label htmlFor="output-platform">平台</Label>
            <select id="output-platform" className="flex h-10 w-full rounded-xl border border-input bg-card px-3 text-sm" value={formState.platform} onChange={(event) => setFormState((current) => ({ ...current, platform: event.target.value as PreviewConfig["platform"], contentLanguage: projectContentLanguage(event.target.value), imageAspectRatio: normalizeDetailAspectRatio(undefined, event.target.value) }))}>
              {platformOptions.map((option) => <option key={option} value={option}>{platformLabels[option]}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>内容语言</Label>
            <select
              className="flex h-10 w-full rounded-xl border border-input bg-white px-3 text-sm dark:bg-black/30 dark:text-slate-100"
              value={formState.contentLanguage}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  contentLanguage: normalizeContentLanguage(event.target.value),
                }))
              }
            >
              {contentLanguageOptions.map((option) => (
                <option key={option} value={option}>
                  {contentLanguageLabels[option]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>头图数量</Label>
            <select
              className="flex h-10 w-full rounded-xl border border-input bg-white px-3 text-sm dark:bg-black/30 dark:text-slate-100"
              value={String(formState.heroImageCount)}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  heroImageCount: Math.min(5, Math.max(3, Number(event.target.value))),
                }))
              }
            >
              {[3, 4, 5].map((count) => (
                <option key={count} value={count}>
                  {count} 张
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="output-hero-aspect-ratio">头图比例</Label>
            <select
              id="output-hero-aspect-ratio"
              className="flex h-10 w-full rounded-xl border border-input bg-white px-3 text-sm dark:bg-black/30 dark:text-slate-100"
              value={formState.heroAspectRatio}
              onChange={(event) => setFormState((current) => ({ ...current, heroAspectRatio: event.target.value === "3:4" ? "3:4" : "1:1" }))}
            >
              <option value="1:1">1:1 · 正方形</option>
              <option value="3:4">3:4 · 竖版</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>详情页数量</Label>
            <select
              className="flex h-10 w-full rounded-xl border border-input bg-white px-3 text-sm dark:bg-black/30 dark:text-slate-100"
              value={String(formState.detailSectionCount)}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  detailSectionCount: Math.min(10, Math.max(4, Number(event.target.value))),
                }))
              }
            >
              {[4, 5, 6, 7, 8, 9, 10].map((count) => (
                <option key={count} value={count}>
                  {count} 张
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="output-detail-aspect-ratio">详情图比例</Label>
            <select
              id="output-detail-aspect-ratio"
              className="flex h-10 w-full rounded-xl border border-input bg-white px-3 text-sm dark:bg-black/30 dark:text-slate-100"
              value={formState.imageAspectRatio}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  imageAspectRatio: normalizeDetailAspectRatio(event.target.value),
                }))
              }
            >
              {detailAspectRatios.map((ratio) => <option key={ratio} value={ratio}>{ratio}{ratio === "16:9" ? " · 横版" : ratio === "21:9" ? " · 宽屏横版" : " · 竖版"}</option>)}
            </select>
          </div>
        </div>

        <OutputConfigSummary config={formState} />

        <div className="flex justify-end">
          <Button onClick={saveConfig} disabled={saving || !hasChanges} className="rounded-xl">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            保存输出配置
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
