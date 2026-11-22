"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, User } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motuFileUrl } from "@/lib/utils/public-url";

interface ModelTemplate {
  id: string;
  name: string;
  description: string | null;
  bodyType: string | null;
  frontViewPath: string;
  _count: { outfits: number };
  createdAt: string;
}

export default function ModelsPage() {
  const [models, setModels] = useState<ModelTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setModels(data.data);
      })
      .catch(() => toast.error("加载模特库失败"))
      .finally(() => setLoading(false));
  }, []);

  const bodyTypeLabels: Record<string, string> = {
    slim: "纤瘦",
    average: "标准",
    plus: "丰满",
    athletic: "运动",
  };

  return (
    <div className="space-y-6">
      <PageHeader title="模特库" description="管理模特三视图，为商品复用人物与试衣形象。" actions={
        <Link href="/models/new" className={buttonVariants()}>
            <Plus className="h-4 w-4" />
            新建模特
        </Link>
      } />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-80 rounded-lg bg-muted animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
      ) : models.length === 0 ? (
        <div className="motu-empty-state">
          <User className="h-8 w-8 text-muted-foreground" aria-hidden />
          <h3 className="text-base font-semibold">还没有模特模板</h3>
          <p className="text-sm text-muted-foreground">
            创建模特并生成三视图后，即可开始试衣。
          </p>
          <Link href="/models/new" className={buttonVariants({ variant: "outline" })}>
              <Plus className="h-4 w-4" />
              创建模特
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {models.map((model) => (
            <Link key={model.id} href={`/models/${model.id}`}>
              <div className="group relative overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-input">
                <div className="aspect-[3/4] overflow-hidden bg-muted">
                  {model.frontViewPath ? (
                    <img
                      src={motuFileUrl(model.frontViewPath)}
                      alt={model.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <User className="h-16 w-16 text-slate-300" />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900 dark:text-white">{model.name}</h3>
                    {model.bodyType && (
                      <Badge variant="outline" className="rounded-full text-[10px]">
                        {bodyTypeLabels[model.bodyType] || model.bodyType}
                      </Badge>
                    )}
                  </div>
                  {model.description && (
                    <p className="mt-1 text-xs text-slate-500 line-clamp-1">{model.description}</p>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    {model._count.outfits} 次试衣 · {new Date(model.createdAt).toLocaleDateString("zh-CN")}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
