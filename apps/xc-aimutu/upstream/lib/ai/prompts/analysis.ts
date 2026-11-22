import { renderEcommercePrompt, type EcommercePromptTemplates } from "@/lib/ai/prompts/ecommerce-templates";
import type { ProductAsset } from "@prisma/client";
import { buildAdLawPromptSection } from "@/lib/ai/ad-law-guard";

const requiredJsonShape = `{
  "productName": "string",
  "category": "string",
  "subcategory": "string",
  "material": "string",
  "color": "string",
  "detectedStyle": "string (e.g. 温暖养生·中式食补·现代简约, 科技极简, 奢华高端, 极简北欧)",
  "styleTags": ["string"],
  "targetAudience": ["string"],
  "usageScenarios": ["string"],
  "coreSellingPoints": ["string"],
  "differentiationPoints": ["string"],
  "userConcerns": ["string"],
  "recommendedFocusPoints": ["string"],
  "suggestedSectionPlan": [
    {
      "type": "hero | selling_points | scenario | detail_closeup | specs | material | comparison | gift_scene | brand_trust | summary",
      "title": "string",
      "goal": "string"
    }
  ],
  "adLawCategory": "string (e.g. food, cosmetic, health_food, baby, textile, digital, home, general)",
  "adLawRisks": [
    {
      "field": "string (which field has risk, e.g. coreSellingPoints)",
      "risk": "string (the problematic word or phrase)",
      "suggestion": "string (safer alternative wording)"
    }
  ],
  "nutritionFacts": {
    "热量": "string (e.g. 约XXX大卡/100g)",
    "蛋白质": "string",
    "脂肪": "string",
    "碳水化合物": "string",
    "膳食纤维": "string",
    "钠": "string",
    "其他": "string (any other nutrients)"
  }
}`;

const supportedSectionTypes = [
  "hero",
  "selling_points",
  "scenario",
  "detail_closeup",
  "specs",
  "material",
  "comparison",
  "gift_scene",
  "brand_trust",
  "summary",
].join(", ");

export function buildProductAnalysisPrompt(assets: ProductAsset[],
  templates?: EcommercePromptTemplates,
) {
  const assetSummary = assets
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(
      (asset, index) =>
        `${index + 1}. type=${asset.type}; file=${asset.fileName}; isMain=${asset.isMain ? "yes" : "no"}`,
    )
    .join("\n");

  return renderEcommercePrompt("ecommerce_workflow_analysis_image", {
    "素材摘要": assetSummary || "No uploaded assets.",
    "支持的模块类型": supportedSectionTypes,
    "输出JSON结构": requiredJsonShape,
  }, templates);
}

export function buildTextAnalysisPrompt(productInfo: {
  name?: string | null;
  description?: string | null;
  category?: string | null;
  sellingPoints?: string | null;
  targetAudience?: string | null;
},
  templates?: EcommercePromptTemplates,
) {
  const adLawSection = buildAdLawPromptSection(
    productInfo.category || "general",
    productInfo.name || "",
  );

  return renderEcommercePrompt("ecommerce_workflow_analysis_text", {
    "商品名称": productInfo.name || "Not specified",
    "商品描述": productInfo.description || "Not specified",
    "商品分类": productInfo.category || "Not specified",
    "商品卖点": productInfo.sellingPoints || "Not specified",
    "目标人群": productInfo.targetAudience || "Not specified",
    "支持的模块类型": supportedSectionTypes,
    "广告法提示": adLawSection,
    "输出JSON结构": requiredJsonShape,
  }, templates);
}

export function buildProductAnalysisRepairPrompt(raw: string,
  templates?: EcommercePromptTemplates,
) {
  return renderEcommercePrompt("ecommerce_workflow_analysis_repair", {
    "支持的模块类型": supportedSectionTypes,
    "输出JSON结构": requiredJsonShape,
    "待修复内容": raw,
  }, templates);
}
