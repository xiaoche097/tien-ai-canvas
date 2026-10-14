"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { ModelAssignments, ModelRole, SelectableModel } from "@/lib/canvas/model-settings";

const groups: Array<{ title: string; roles: Array<{ key: ModelRole; label: string; description: string }> }> = [
  { title: "商品详情页", roles: [
    { key: "analysisModelId", label: "商品分析", description: "分析卖点和图片，需支持看图" },
    { key: "planningModelId", label: "方案规划", description: "规划详情页结构与文案" },
    { key: "heroImageModelId", label: "头图生成", description: "生成商品主视觉" },
    { key: "detailImageModelId", label: "详情图生成", description: "生成详情页图片" },
    { key: "imageEditModelId", label: "图片编辑", description: "基于参考图修改图片" },
  ] },
  { title: "视频创作", roles: [
    { key: "videoScriptModelId", label: "分镜与文案", description: "根据商品图片生成分镜和脚本" },
    { key: "videoVLMModelId", label: "视频画面分析", description: "分析上传视频的关键帧" },
  ] },
];

function eligible(model: SelectableModel, role: ModelRole) {
  if (role === "imageEditModelId") return model.imageEdit;
  if (role === "heroImageModelId" || role === "detailImageModelId") return model.capability === "image";
  if (role === "analysisModelId" || role === "videoScriptModelId" || role === "videoVLMModelId") return model.capability === "text" && model.vision;
  return model.capability === "text";
}

export default function CanvasModelSettings() {
  const [models, setModels] = useState<SelectableModel[]>([]);
  const [assignments, setAssignments] = useState<ModelAssignments>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/canvas/model-settings").then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || "模型目录加载失败");
      if (active) {
        setModels(result.data.models);
        setAssignments(result.data.assignments);
      }
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "模型目录加载失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/canvas/model-settings", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(assignments),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || "保存失败");
      setAssignments(result.data.assignments);
      toast.success("功能模型已保存");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return <div className="mx-auto max-w-4xl space-y-6 py-6">
    <div>
      <h1 className="text-2xl font-semibold">AI 配置</h1>
      <p className="mt-2 text-sm text-muted-foreground">为电商设计室的各项功能选择模型。模型来自境彻当前账号可用的模型目录。</p>
    </div>
    {loading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在加载模型...</div> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {!loading && !error ? <>
      {models.length === 0 ? <p role="alert" className="text-sm text-destructive">当前境彻账号的模型目录没有可用的文本或图片模型。请检查模型渠道与价格配置后刷新页面。</p> : null}
      {groups.map((group) => <Card key={group.title}>
        <CardHeader><CardTitle>{group.title}</CardTitle><CardDescription>留空时沿用当前自动选择。</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          {group.roles.map((role) => {
            const options = models.filter((model) => eligible(model, role.key));
            return <div key={role.key} className="grid gap-2 sm:grid-cols-[180px_1fr] sm:items-center">
              <div><Label htmlFor={role.key}>{role.label}</Label><p className="text-xs text-muted-foreground">{role.description}</p></div>
              <div><select id={role.key} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={assignments[role.key] || ""}
                onChange={(event) => setAssignments((current) => ({ ...current, [role.key]: event.target.value || undefined }))}>
                <option value="">自动选择</option>
                {assignments[role.key] && !options.some((item) => item.id === assignments[role.key]) ? <option value={assignments[role.key]}>当前模型已不可用，请重新选择</option> : null}
                {options.map((model) => <option key={model.id} value={model.id}>{model.label} ({model.id})</option>)}
              </select>{options.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">{models.length === 0 ? "模型目录为空" : "当前没有满足此功能能力要求的模型"}</p> : null}</div>
            </div>;
          })}
        </CardContent>
      </Card>)}
      <div className="flex justify-end"><Button onClick={save} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}保存配置</Button></div>
    </> : null}
  </div>;
}
