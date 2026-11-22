import { z } from "zod";

import { platformOptions, styleOptions } from "@/types/domain";
import { detailAspectRatios } from "@/lib/utils/section-aspect-ratio";

export const projectCreateSchema = z.object({
  name: z.string().trim().min(2, "项目名称至少 2 个字符"),
  platform: z.enum(platformOptions),
  contentLanguage: z.enum(["zh-CN", "en-US", "ja-JP", "ko-KR"]).optional(),
  style: z.enum(styleOptions),
  description: z.string().trim().optional().nullable(),
  productInfo: z.string().trim().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  sellingPoints: z.string().trim().optional().nullable(),
  targetAudience: z.string().trim().optional().nullable(),
});

export const projectUpdateSchema = projectCreateSchema.partial().extend({
  contentLanguage: z.never().optional(),
  style: z.string().trim().min(1, "风格不能为空").optional(),
  status: z
    .enum(["DRAFT", "ANALYZED", "PLANNED", "EDITING", "COMPLETED"])
    .optional(),
  modelSnapshot: z.record(z.string(), z.any()).refine(
    (snapshot) => snapshot.previewConfig?.heroAspectRatio === undefined || ["1:1", "3:4"].includes(snapshot.previewConfig.heroAspectRatio),
    { message: "头图比例仅支持 1:1 或 3:4" },
  ).refine(
    (snapshot) => snapshot.previewConfig?.imageAspectRatio === undefined || detailAspectRatios.includes(snapshot.previewConfig.imageAspectRatio),
    { message: "详情图比例仅支持 3:4、9:16、16:9 或 21:9" },
  ).optional(),
});
