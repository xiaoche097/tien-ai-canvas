import { renderEcommercePrompt, type EcommercePromptTemplates } from "@/lib/ai/prompts/ecommerce-templates";
import type { ProductAnalysisOutput } from "@/lib/ai/schemas/product-analysis";
import { buildAdLawPromptSection } from "@/lib/ai/ad-law-guard";
import { amazonPlanningRules } from "./amazon";
import {
  platformLabels,
  sectionTypeLabels,
  styleLabels,
  type PlatformOption,
  type StyleOption,
} from "@/types/domain";
import { contentLanguageNamesForPrompt, normalizeContentLanguage, type ContentLanguage } from "@/lib/utils/content-language";

const sectionTypeGuide = Object.entries(sectionTypeLabels)
  .map(([key, label]) => `${key}=${label}`)
  .join(", ");

function buildPlanningContext(analysis: ProductAnalysisOutput) {
  return {
    productName: analysis.productName,
    category: analysis.category,
    subcategory: analysis.subcategory,
    styleTags: analysis.styleTags.slice(0, 6),
    targetAudience: analysis.targetAudience.slice(0, 4),
    usageScenarios: analysis.usageScenarios.slice(0, 4),
    coreSellingPoints: analysis.coreSellingPoints.slice(0, 6),
    differentiationPoints: analysis.differentiationPoints.slice(0, 4),
    suggestedSectionPlan: analysis.suggestedSectionPlan.slice(0, 6),
    nutritionFacts: analysis.nutritionFacts ?? {},
  };
}

export function buildSectionPlanningPrompt(
  analysis: ProductAnalysisOutput,
  style: string,
  platform: string,
  detailSectionCount = 6,
  heroImageCount = 4,
  contentLanguage: ContentLanguage = "zh-CN",
  heroAspectRatio: "1:1" | "3:4" = "1:1",
  templates?: EcommercePromptTemplates,
) {
  const styleLabel = styleLabels[style as StyleOption] ?? style;
  const platformLabel = platformLabels[platform as PlatformOption] ?? platform;
  const targetLanguage = contentLanguageNamesForPrompt[normalizeContentLanguage(contentLanguage)];
  const totalSections = heroImageCount + detailSectionCount;

  const planningContext = buildPlanningContext(analysis);

  const adLawSection = buildAdLawPromptSection(
    analysis.adLawCategory || analysis.category,
    analysis.subcategory,
  );

  return renderEcommercePrompt("ecommerce_workflow_planning", {
    "平台名称": platformLabel,
    "风格名称": styleLabel,
    "目标语言名称": targetLanguage,
    "模块总数": totalSections,
    "头图数量": heroImageCount,
    "详情页数量": detailSectionCount,
    "头图比例": heroAspectRatio,
    "广告法提示": adLawSection,
    "商品分析上下文": JSON.stringify(planningContext),
  }, templates) + "\n\n" + renderEcommercePrompt("ecommerce_workflow_hero_planning", { 头图比例: heroAspectRatio }, templates) + (platform === "amazon" ? "\n\n" + amazonPlanningRules(contentLanguage) : "");
}

export function buildClothingPlanningPrompt(
  analysis: ProductAnalysisOutput,
  style: string,
  platform: string,
  heroImageCount = 4,
  contentLanguage: ContentLanguage = "zh-CN",
  heroAspectRatio: "1:1" | "3:4" = "1:1",
  templates?: EcommercePromptTemplates,
) {
  const styleLabel = styleLabels[style as StyleOption] ?? style;
  const platformLabel = platformLabels[platform as PlatformOption] ?? platform;
  const targetLanguage = contentLanguageNamesForPrompt[normalizeContentLanguage(contentLanguage)];
  const totalSections = heroImageCount + 10;

  const planningContext = buildPlanningContext(analysis);

  const adLawSection = buildAdLawPromptSection(
    analysis.adLawCategory || analysis.category,
    analysis.subcategory,
  );

  const fixedModules = [
    { type: "scenario", title: "模特全身展示", desc: "模特站立全身照，展示整体穿搭效果" },
    { type: "selling_points", title: "产品正反面展示", desc: "服装正面与背面平铺/挂拍展示" },
    { type: "detail_closeup", title: "设计细节展示", desc: "领口、袖口、纽扣、缝线等工艺特写" },
    { type: "material", title: "材质展示", desc: "面料纹理、光泽、触感等材质特写" },
    { type: "specs", title: "尺码表", desc: "尺码对照表与测量方法示意" },
    { type: "scenario", title: "模特正面展示", desc: "模特正面半身/全身照" },
    { type: "scenario", title: "模特背面展示", desc: "模特背面展示照" },
    { type: "scenario", title: "模特侧身展示", desc: "模特侧身展示照，突出版型线条" },
    { type: "detail_closeup", title: "产品正面大图", desc: "服装正面高清全貌图" },
    { type: "detail_closeup", title: "产品背面大图", desc: "服装背面高清全貌图" },
    { type: "detail_closeup", title: "产品细节大图", desc: "关键细节部位高清大图" },
  ];

  return renderEcommercePrompt("ecommerce_workflow_planning_clothing", {
    "平台名称": platformLabel,
    "风格名称": styleLabel,
    "目标语言名称": targetLanguage,
    "模块总数": totalSections,
    "头图数量": heroImageCount,
    "服装模块列表": (fixedModules.map((m, i) => `${i + 1}. type=${m.type} | title must include '${m.title}' | purpose: ${m.desc}`)).join("\n"),
    "头图构图要求": heroAspectRatio === "1:1" ? "正方形 1:1 构图 / square 1:1 composition" : "竖版 3:4 构图 / vertical 3:4 composition",
    "广告法提示": adLawSection,
    "商品分析上下文": JSON.stringify(planningContext),
  }, templates) + "\n\n" + renderEcommercePrompt("ecommerce_workflow_hero_planning", { 头图比例: heroAspectRatio }, templates) + (platform === "amazon" ? "\n\n" + amazonPlanningRules(contentLanguage) : "");
}

export function buildPreviewDecisionPrompt(analysis: Record<string, unknown>, contentLanguage: ContentLanguage,
  templates?: EcommercePromptTemplates,
) {
  const context = {
    productName: analysis.productName,
    category: analysis.category,
    subcategory: analysis.subcategory,
    styleTags: Array.isArray(analysis.styleTags) ? analysis.styleTags.slice(0, 6) : [],
    usageScenarios: Array.isArray(analysis.usageScenarios) ? analysis.usageScenarios.slice(0, 6) : [],
    coreSellingPoints: Array.isArray(analysis.coreSellingPoints) ? analysis.coreSellingPoints.slice(0, 8) : [],
    differentiationPoints: Array.isArray(analysis.differentiationPoints)
      ? analysis.differentiationPoints.slice(0, 6)
      : [],
    suggestedSectionPlan: Array.isArray(analysis.suggestedSectionPlan) ? analysis.suggestedSectionPlan.slice(0, 8) : [],
  };

  return renderEcommercePrompt("ecommerce_workflow_counts", {
    "内容语言": contentLanguage,
    "商品分析上下文": JSON.stringify(context, null, 2),
  }, templates);
}
