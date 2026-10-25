"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Loader2,
  Wand2,
  Save,
  Trash2,
  ArrowRight,
  ImageIcon,
  Layers,
  Palette,
  LayoutTemplate,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { TemplateRecord, TemplateModule } from "@/types/template";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ImageUpload } from "@/components/shared/image-upload";
import { PageHeader } from "@/components/shared/page-header";
import { platformLabels, platformOptions, type PlatformOption } from "@/types/domain";
import { detailAspectRatios, normalizeDetailAspectRatio, type DetailAspectRatio } from "@/lib/utils/section-aspect-ratio";
import { contentLanguageOptions, contentLanguageLabels, projectContentLanguage, type ContentLanguage } from "@/lib/utils/content-language";
import { fileToBase64Payload } from "@/lib/utils/base64-upload";

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [referenceImageUrl, setReferenceImageUrl] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [structure, setStructure] = useState<{
    overallStyle: string;
    colorPalette: string[];
    typography: Record<string, string>;
    modules: TemplateModule[];
  } | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [applyTarget, setApplyTarget] = useState<TemplateRecord | null>(null);
  const [applyProductName, setApplyProductName] = useState("");
  const [applyPlatform, setApplyPlatform] = useState<PlatformOption>("taobao_tmall");
  const [applyDescription, setApplyDescription] = useState("");
  const [applyFiles, setApplyFiles] = useState<File[]>([]);
  const [applyConfig, setApplyConfig] = useState({ heroImageCount: 4, heroAspectRatio: "1:1", detailSectionCount: 6, imageAspectRatio: "9:16" as DetailAspectRatio, contentLanguage: "zh-CN" as ContentLanguage });
  const [applying, setApplying] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/templates");
      const data = await res.json();
      if (data.success) {
        setTemplates(data.data.templates);
      }
    } catch {
      toast.error("加载模板列表失败");
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  async function handleAnalyze() {
    if (!description.trim() && uploadedFiles.length === 0) {
      toast.error("请上传参考图或输入描述");
      return;
    }
    setAnalyzing(true);
    try {
      let res: Response;

      if (uploadedFiles.length > 0) {
        const formData = new FormData();
        formData.append("description", description);
        uploadedFiles.forEach((file) => formData.append("images", file));
        res = await fetch("/api/templates/analyze", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("/api/templates/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description }),
        });
      }

      const data = await res.json();
      if (data.success) {
        setStructure(data.data.structure);
        setStep(2);
        toast.success("AI 分析完成");
      } else {
        throw new Error(data.error?.message ?? "分析失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "分析失败");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave() {
    if (name.trim().length < 2) {
      toast.error("请输入至少 2 个字的模板名称");
      document.getElementById("template-save-name")?.focus();
      return;
    }
    if (!structure) {
      toast.error("请先完成分析");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          referenceImageUrl: referenceImageUrl || "/window.svg",
          structureJson: structure,
          styleProfile: {
            overallStyle: structure.overallStyle,
            colorPalette: structure.colorPalette,
            typography: structure.typography,
          },
          description,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("模板保存成功");
        setShowCreate(false);
        resetForm();
        fetchTemplates();
      } else {
        throw new Error(data.error?.message ?? "保存失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setPendingDeleteId(id);
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/templates/${pendingDeleteId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success("已删除");
        fetchTemplates();
      } else {
        throw new Error(data.error?.message ?? "删除失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeleting(false);
      setPendingDeleteId(null);
    }
  }

  async function handleApply(template: TemplateRecord) {
    setApplyTarget(template);
    setApplyProductName("");
    setApplyPlatform("taobao_tmall");
    setApplyDescription("");
    setApplyFiles([]);
    setApplyConfig({ heroImageCount: 4, heroAspectRatio: "1:1", detailSectionCount: 6, imageAspectRatio: "9:16", contentLanguage: "zh-CN" });
  }

  async function confirmApply() {
    if (!applyTarget || !applyProductName.trim() || !applyDescription.trim()) return;
    setApplying(true);
    let projectId: string | null = null;
    try {
      const res = await fetch(`/api/templates/${applyTarget.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${applyProductName.trim()} 详情页`,
          platform: applyPlatform,
          productName: applyProductName.trim(),
          description: applyDescription.trim(),
          previewConfig: applyConfig,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        projectId = data.data.projectId;
        for (const file of applyFiles) {
          const upload = await fetch(`/api/projects/${projectId}/assets/upload`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "MAIN", ...await fileToBase64Payload(file) }),
          });
          const uploaded = await upload.json();
          if (!upload.ok || !uploaded.success) throw new Error(uploaded.error?.message ?? "商品图片上传失败，请在分析页补充上传后再分析");
        }
        toast.success("商品与输出配置已保存，正在进入分析；确认分析结果后进行模板风格规划。");
        setApplyTarget(null);
        router.push(`/projects/${projectId}/analysis?source=template&autoRun=1`);
      } else {
        throw new Error(data.error?.message ?? "应用失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "应用失败");
      if (projectId) {
        setApplyTarget(null);
        router.push(`/projects/${projectId}/analysis`);
      }
    } finally {
      setApplying(false);
    }
  }

  function resetForm() {
    setStep(1);
    setName("");
    setDescription("");
    setReferenceImageUrl("");
    setUploadedFiles([]);
    setStructure(null);
    setExpandedModules(new Set());
  }

  function toggleModule(index: number) {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function updateModule(index: number, field: keyof TemplateModule, value: string) {
    if (!structure) return;
    const next = { ...structure };
    next.modules = next.modules.map((m, i) =>
      i === index ? { ...m, [field]: value } : m,
    );
    setStructure(next);
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader title="套版中心" description="拆解参考页的版式与风格，保存为可复用的商品模板。" actions={
        <Button onClick={() => { resetForm(); setShowCreate(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          新建模板
        </Button>
      } />

      {showCreate && (
        <Card className="mb-8 overflow-hidden">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h3 className="font-medium">新建模板</h3>
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardContent className="p-6">
            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>模板名称</Label>
                  <Input
                    placeholder="如：POLOWALK 夹克详情页模板"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                {/* Image Upload */}
                <div className="space-y-2">
                  <ImageUpload
                    id="template-image-upload"
                    label="上传参考页长图"
                    description="支持图片上传，建议使用 JPG、PNG 完整详情页长图；支持 vision 模型直接看图分析。"
                    files={uploadedFiles}
                    onChange={setUploadedFiles}
                    multiple
                    disabled={analyzing}
                  />
                </div>

                <div className="space-y-2">
                  <Label>参考页描述（可选，辅助 AI 理解）</Label>
                  <Textarea
                    placeholder="请详细描述参考详情页的结构和风格，例如：
品牌头图是多人群像街拍，白底黑字简约风；
接下来是门店形象展示，然后是购买理由三个标签卡片；
有尺码表、真人模特试穿、多角度展示、面料卖点、平铺展示、细节特写等模块..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={6}
                  />
                  <p className="text-xs text-muted-foreground">
                    {uploadedFiles.length > 0
                      ? "已上传图片，AI 将优先看图分析。补充描述可提升准确度。"
                      : "未上传图片时，AI 将仅基于文字描述进行分析。"}
                  </p>
                </div>
                <Button
                  onClick={handleAnalyze}
                  disabled={analyzing || (!description.trim() && uploadedFiles.length === 0)}
                  className="w-full"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      AI 分析中...
                    </>
                  ) : (
                    <>
                      <Wand2 className="mr-2 h-4 w-4" />
                      {uploadedFiles.length > 0 ? "开始 AI 看图拆版" : "开始 AI 分析"}
                    </>
                  )}
                </Button>
                {structure && (
                  <Button variant="outline" onClick={() => setStep(2)} className="w-full">
                    继续编辑已有分析（不重新调用 AI）
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </div>
            )}

            {step === 2 && structure && (
              <div className="space-y-4">
                <div className="rounded-lg bg-muted p-3">
                  <div className="flex items-center gap-2">
                    <Palette className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">整体风格</span>
                  </div>
                  <p className="mt-1 text-sm">{structure.overallStyle}</p>
                  <div className="mt-2 flex gap-1">
                    {structure.colorPalette.map((c, i) => (
                      <div
                        key={i}
                        className="h-6 w-6 rounded border"
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <Layers className="h-4 w-4" />
                      模块结构（{structure.modules.length} 个）
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {structure.modules.map((mod, i) => (
                      <div key={i} className="rounded-lg border bg-card overflow-hidden">
                        <button
                          className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50"
                          onClick={() => toggleModule(i)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                              {mod.order}
                            </span>
                            <span className="text-sm font-medium">{mod.name}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {mod.type}
                            </Badge>
                          </div>
                          {expandedModules.has(i) ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                        {expandedModules.has(i) && (
                          <div className="border-t px-3 py-3 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">模块名称</Label>
                                <Input
                                  value={mod.name}
                                  onChange={(e) => updateModule(i, "name", e.target.value)}
                                  className="mt-1 h-8 text-sm"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">宽高比</Label>
                                <Input
                                  value={mod.aspectRatio}
                                  onChange={(e) => updateModule(i, "aspectRatio", e.target.value)}
                                  className="mt-1 h-8 text-sm"
                                />
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs">风格描述</Label>
                              <Textarea
                                value={mod.styleNotes}
                                onChange={(e) => updateModule(i, "styleNotes", e.target.value)}
                                className="mt-1 text-sm"
                                rows={2}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">文案排版</Label>
                              <Input
                                value={mod.textLayout}
                                onChange={(e) => updateModule(i, "textLayout", e.target.value)}
                                className="mt-1 h-8 text-sm"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                    返回修改
                  </Button>
                  <Button onClick={() => setStep(3)} className="flex-1">
                    确认保存
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="rounded-lg bg-muted p-4 text-center">
                  <LayoutTemplate className="mx-auto h-10 w-10 text-primary" />
                  <h4 className="mt-2 font-medium">确认保存模板</h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    模板名称：{name}
                    <br />
                    包含 {structure?.modules.length ?? 0} 个模块
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="template-save-name">模板名称（必填，至少 2 个字）</Label>
                  <Input
                    id="template-save-name"
                    placeholder="请输入模板名称"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    minLength={2}
                    disabled={loading}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                    返回编辑
                  </Button>
                  <Button onClick={handleSave} disabled={loading} className="flex-1">
                    {loading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    保存模板
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {templates.length === 0 ? (
        <Card className="motu-empty-state">
          <LayoutTemplate className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">暂无模板</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            点击右上角"新建模板"，分析参考详情页并保存为可复用的模板
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="group overflow-hidden">
              <div className="aspect-video bg-muted relative">
                {template.referenceImageUrl ? (
                  <img
                    src={template.referenceImageUrl}
                    alt={template.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <ImageIcon className="h-10 w-10 text-muted-foreground" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <Button variant="secondary" onClick={() => handleApply(template)}>
                    <ArrowRight className="mr-2 h-4 w-4" />
                    套用此模板
                  </Button>
                </div>
              </div>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{template.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {template.moduleCount} 个模块 · {template.category}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => handleDelete(template.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {template.description && (
                  <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                    {template.description}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-1">
                  {(template.structureJson as any)?.modules?.slice(0, 4).map((m: any, i: number) => (
                    <Badge key={i} variant="outline" className="text-[10px]">
                      {m.name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDeleteId)}
        title="删除模板"
        description="确定要删除这个模板吗？此操作不可恢复。"
        confirmText="确认删除"
        cancelText="取消"
        destructive
        loading={deleting}
        icon={<Trash2 className="h-5 w-5" />}
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={confirmDelete}
      />

      {applyTarget && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="关闭"
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => !applying && setApplyTarget(null)}
          />
          <div role="dialog" aria-modal="true" aria-label="套用模板" className="relative z-[121] max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-950 dark:text-white">套用模板</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              将「{applyTarget.name}」应用到新商品
            </p>
            <div className="mt-4 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="apply-product-name" className="text-xs">商品名称</Label>
                <Input
                  id="apply-product-name"
                  value={applyProductName}
                  onChange={(e) => setApplyProductName(e.target.value)}
                  placeholder="例如：全麦山药茯苓馒头"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="apply-product-info">新商品信息（必填）</Label>
                <Textarea id="apply-product-info" value={applyDescription} onChange={event => setApplyDescription(event.target.value)} placeholder="填写实际产品、材质、结构、卖点和目标人群；模板仅用于视觉风格，不沿用原商品内容。" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="apply-product-images">新商品图片（可多选）</Label>
                <ImageUpload id="apply-product-images" label="上传新商品图片" files={applyFiles} onChange={setApplyFiles} multiple disabled={applying} />
                <p className="text-xs text-muted-foreground">请上传新商品原图，建议包含正面、侧面与关键细节。未上传时根据产品文字分析。</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">电商平台</Label>
                <select
                  value={applyPlatform}
                  onChange={(e) => {
                    const platform = e.target.value as PlatformOption;
                    setApplyPlatform(platform);
                    setApplyConfig(current => ({ ...current, contentLanguage: projectContentLanguage(platform), imageAspectRatio: normalizeDetailAspectRatio(undefined, platform) }));
                  }}
                  className="h-10 w-full rounded-xl border border-input bg-white px-3 text-sm dark:bg-black/30 dark:text-slate-100"
                >
                  {platformOptions.map((platform) => <option key={platform} value={platform}>{platformLabels[platform]}</option>)}
                </select>
                {applyPlatform === "amazon" && <p className="text-xs text-muted-foreground">Amazon 默认英语、桌面预览和 16:9 横版详情图；可在输出配置调整为 21:9。</p>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label htmlFor="apply-hero-count">头图数量</Label><select id="apply-hero-count" className="h-10 w-full rounded-xl border border-input bg-card px-3" value={applyConfig.heroImageCount} onChange={event => setApplyConfig(current => ({ ...current, heroImageCount: Number(event.target.value) }))}>{[3,4,5].map(value => <option key={value} value={value}>{value} 张</option>)}</select></div>
                <div className="space-y-1"><Label htmlFor="apply-hero-ratio">头图比例</Label><select id="apply-hero-ratio" className="h-10 w-full rounded-xl border border-input bg-card px-3" value={applyConfig.heroAspectRatio} onChange={event => setApplyConfig(current => ({ ...current, heroAspectRatio: event.target.value }))}>{["1:1","3:4"].map(value => <option key={value} value={value}>{value}</option>)}</select></div>
                <div className="space-y-1"><Label htmlFor="apply-detail-count">详情数量</Label><select id="apply-detail-count" className="h-10 w-full rounded-xl border border-input bg-card px-3" value={applyConfig.detailSectionCount} onChange={event => setApplyConfig(current => ({ ...current, detailSectionCount: Number(event.target.value) }))}>{[4,5,6,7,8,9,10].map(value => <option key={value} value={value}>{value} 张</option>)}</select></div>
                <div className="space-y-1"><Label htmlFor="apply-detail-ratio">详情图比例</Label><select id="apply-detail-ratio" className="h-10 w-full rounded-xl border border-input bg-card px-3" value={applyConfig.imageAspectRatio} onChange={event => setApplyConfig(current => ({ ...current, imageAspectRatio: event.target.value as DetailAspectRatio }))}>{detailAspectRatios.map(value => <option key={value} value={value}>{value}</option>)}</select></div>
                <div className="space-y-1"><Label htmlFor="apply-language">文案语言</Label><select id="apply-language" className="h-10 w-full rounded-xl border border-input bg-card px-3" value={applyConfig.contentLanguage} onChange={event => setApplyConfig(current => ({ ...current, contentLanguage: event.target.value as ContentLanguage }))}>{contentLanguageOptions.map(value => <option key={value} value={value}>{contentLanguageLabels[value]}</option>)}</select></div>
              </div>
              <p className="text-xs text-muted-foreground">先分析新商品，确认结果后按所选模板风格重新规划。分析与规划使用已配置模型，按调用规则计费；不会直接生成图片。Amazon 第一张头图固定 1:1 白底，其余头图使用所选比例。</p>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setApplyTarget(null)} disabled={applying} className="rounded-xl">
                取消
              </Button>
              <Button onClick={confirmApply} disabled={applying || !applyProductName.trim() || !applyDescription.trim()} className="rounded-xl">
                {applying ? "正在创建并上传..." : "创建并分析商品"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
