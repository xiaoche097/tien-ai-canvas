"use client";

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ImageUpload } from "@/components/shared/image-upload";
import { fileToBase64Payload } from "@/lib/utils/base64-upload";
import { useAuthStore } from "@/hooks/use-auth-store";
import { getAuthHeaders } from "@/lib/utils/auth-client";
import { platformOptions, platformLabels, type PlatformOption } from "@/types/domain";
import { contentLanguageOptions, contentLanguageLabels, projectContentLanguage, type ContentLanguage } from "@/lib/utils/content-language";

function buildDraftProjectName() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ];
  return `未命名商品项目-${parts.join("")}`;
}

export function QuickStartWorkspace() {
  const router = useRouter();
  const { keyInfo } = useAuthStore();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [productInfo, setProductInfo] = useState("");
  const [category, setCategory] = useState("");
  const [sellingPoints, setSellingPoints] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [platform, setPlatform] = useState<PlatformOption>("general_ecommerce");
  const [contentLanguage, setContentLanguage] = useState<ContentLanguage>("zh-CN");

  const isPerUseExhausted = keyInfo?.type === "PER_USE" && (keyInfo.usedCount ?? 0) >= 1;

  const handleStart = async () => {
    if (!productInfo.trim() && !file) {
      toast.error("请至少填写产品信息或上传一张图片");
      return;
    }

    // 实时查询最新激活码信息（避免 store 缓存旧数据）
    let currentKey = keyInfo?.key ?? null;
    let currentKeyType = keyInfo?.type ?? null;
    if (typeof window !== "undefined" && currentKey) {
      try {
        const platform = (window as any).electronAPI ? "desktop" : "web";
        const meRes = await fetch(`/api/auth/me?key=${encodeURIComponent(currentKey)}&platform=${platform}`);
        const meData = await meRes.json();
        if (meData.success) {
          currentKeyType = meData.data.type;
        }
      } catch {
        // 查询失败时继续使用缓存的 keyInfo
      }
    }

    // Consume PER_USE key before creating project
    if (currentKeyType === "PER_USE" && currentKey) {
      const machineId = typeof window !== "undefined" ? localStorage.getItem("bm_machine_id") : null;
      const consumeRes = await fetch("/api/auth/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: currentKey, machineId }),
      });
      const consumeData = await consumeRes.json();
      if (!consumeData.success) {
        toast.error(consumeData.error?.message ?? "次卡已用完");
        return;
      }
    }

    setSubmitting(true);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (keyInfo?.key) {
        headers["x-access-key"] = keyInfo.key;
      }

      const createResponse = await fetch("/api/projects", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: buildDraftProjectName(),
          platform,
          contentLanguage,
          style: "generic_clean",
          description: productInfo,
          productInfo,
          category,
          sellingPoints,
          targetAudience,
        }),
      });
      const createdPayload = await createResponse.json();
      if (!createdPayload.success) {
        throw new Error(createdPayload.error?.message ?? "创建项目失败");
      }

      const projectId = createdPayload.data.id as string;

      if (file) {
        const base64Payload = await fileToBase64Payload(file);
        const uploadResponse = await fetch(`/api/projects/${projectId}/assets/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "MAIN",
            ...base64Payload,
          }),
        });
        const uploadPayload = await uploadResponse.json();
        if (!uploadPayload.success) {
          throw new Error(uploadPayload.error?.message ?? "主商品图上传失败");
        }
      }

      const analyzeResponse = await fetch(`/api/projects/${projectId}/analyze`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: "{}",
      });
      const analyzePayload = await analyzeResponse.json();

      if (!analyzePayload.success) {
        const rawErrorCode = String(analyzePayload.error?.code ?? "");
        const shouldAutoRetry = rawErrorCode === "PROVIDER_TIMEOUT";
        const errorCode = encodeURIComponent(rawErrorCode);
        const errorMessage = encodeURIComponent(
          String(analyzePayload.error?.message ?? "自动分析未完成。"),
        );

        toast.warning(
          shouldAutoRetry
            ? "正在为你跳转到分析页继续自动重试。"
            : "已为你跳转到分析页继续处理。",
        );

        router.push(
          `/projects/${projectId}/analysis?source=quick-start${shouldAutoRetry ? "&autoRun=1" : ""}&analysisErrorCode=${errorCode}&analysisErrorMessage=${errorMessage}`,
        );
        return;
      }

      toast.success("AI 已自动完成首轮分析。");
      router.push(`/projects/${projectId}/analysis`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "快速开始失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="motu-quick-start min-w-0">
      <header className="motu-page-header">
        <h1 className="text-2xl font-semibold tracking-tight">创建商品详情页</h1>
        <p className="mt-2 text-sm text-muted-foreground">添加商品图片与资料，开始分析和规划。</p>
      </header>

      <div className="motu-quick-layout">
        <aside className="motu-quick-material" aria-label="产品素材">
          <h2 className="mb-4 text-sm font-semibold">商品图片</h2>
          <ImageUpload
            id="quick-start-file"
            label="添加商品图片"
            files={file ? [file] : []}
            onChange={files => setFile(files[0] ?? null)}
            disabled={submitting}
            description="使用同一款商品的清晰实物图；不同颜色、扣具请分开创建。也可以只填写商品资料。"
          />
        </aside>

        <div className="motu-quick-details min-w-0">
          <h2 className="mb-4 text-sm font-semibold">商品资料</h2>
          <fieldset disabled={submitting}>
            <legend className="sr-only">商品信息</legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="quick-start-platform">销售平台</Label>
                <select id="quick-start-platform" className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm" disabled={submitting} value={platform} onChange={(event) => { const next = event.target.value as PlatformOption; setPlatform(next); setContentLanguage(projectContentLanguage(next)); }}>
                  {platformOptions.map((option) => <option key={option} value={option}>{platformLabels[option]}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-start-language">图片与文案语言</Label>
                <select id="quick-start-language" className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm" disabled={submitting} value={contentLanguage} onChange={(event) => setContentLanguage(event.target.value as ContentLanguage)}>
                  {contentLanguageOptions.map((option) => <option key={option} value={option}>{contentLanguageLabels[option]}</option>)}
                </select>
              </div>
              {platform === "amazon" && <p className="text-sm leading-6 text-muted-foreground sm:col-span-2">Amazon 默认英语和 16:9 横版详情图，可在输出配置改为 21:9。第一张头图作为白底无额外文字的主图，其余为附图；主图生成需上传真实商品参考图，生成后仍需核对类目规范。</p>}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="quick-start-product-info">产品信息</Label>
                <Textarea id="quick-start-product-info" value={productInfo} onChange={event => setProductInfo(event.target.value)} placeholder="商品名称、材质、规格，以及需要展示的细节" rows={4} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-start-category">品类</Label>
                <Input id="quick-start-category" value={category} onChange={event => setCategory(event.target.value)} placeholder="如：食品、服装、数码配件" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-start-audience">目标人群</Label>
                <Input id="quick-start-audience" value={targetAudience} onChange={event => setTargetAudience(event.target.value)} placeholder="主要使用或购买这款商品的人群" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="quick-start-selling-points">核心卖点</Label>
                <Textarea id="quick-start-selling-points" value={sellingPoints} onChange={event => setSellingPoints(event.target.value)} placeholder="列出需要重点呈现的卖点，建议每行一条" rows={3} />
              </div>
            </div>
          </fieldset>
          <div className="motu-studio-actions mt-6 flex flex-wrap items-center gap-4 border-t border-border pt-5" aria-busy={submitting}>
            <Button onClick={handleStart} disabled={submitting || (!productInfo.trim() && !file) || isPerUseExhausted} className="motu-studio-primary w-full px-5 sm:w-auto">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {submitting ? "正在分析产品…" : isPerUseExhausted ? "次卡已用完" : "开始生成详情页方案"}
              {!submitting && <ArrowRight className="h-4 w-4" aria-hidden />}
            </Button>
            <p className="text-xs leading-5 text-muted-foreground" role="status">{submitting ? "正在提交资料，请稍候…" : "分析完成后，可继续确认规划。"}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
