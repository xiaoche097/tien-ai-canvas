import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getTemplateById } from "@/lib/services/template-service";
import { handleRouteError, ok } from "@/lib/utils/route";
import { platformOptions } from "@/types/domain";
import { detailAspectRatios } from "@/lib/utils/section-aspect-ratio";

const applySchema = z.object({
  name: z.string().trim().min(2),
  platform: z.enum(platformOptions),
  productName: z.string().trim().min(1),
  description: z.string().trim().min(1, "请填写新商品信息"),
  productCategory: z.string().trim().optional(),
  sellingPoints: z.string().trim().optional(),
  targetAudience: z.string().trim().optional(),
  previewConfig: z.object({
    heroImageCount: z.number().int().min(3).max(5),
    heroAspectRatio: z.enum(["1:1", "3:4"]),
    detailSectionCount: z.number().int().min(4).max(10),
    imageAspectRatio: z.enum(detailAspectRatios),
    contentLanguage: z.enum(["zh-CN", "en-US", "ja-JP", "ko-KR"]),
  }),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = applySchema.parse(await request.json());
    const template = await getTemplateById(id);
    if (!template) return handleRouteError(new Error("模板不存在"));
    const project = await prisma.project.create({ data: {
      name: input.name,
      platform: input.platform,
      style: "generic_clean",
      description: `商品名称：${input.productName}\n${input.description}`,
      status: "DRAFT",
      modelSnapshot: {
        productInfo: input.description,
        category: input.productCategory ?? "",
        sellingPoints: input.sellingPoints ?? "",
        targetAudience: input.targetAudience ?? "",
        previewConfig: input.previewConfig,
        templateApplication: {
          id: template.id, name: template.name,
          styleProfile: template.styleProfile,
          structure: template.structureJson,
        },
      },
    } });
    return ok({ projectId: project.id });
  } catch (error) { return handleRouteError(error); }
}
