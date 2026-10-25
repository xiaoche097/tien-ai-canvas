import { renderEcommercePrompt, type EcommercePromptTemplates } from "@/lib/ai/prompts/ecommerce-templates";
import type { PageSection, ProductAsset } from "@prisma/client";
import { normalizeHeroComposition, normalizeDetailComposition } from "@/lib/utils/section-aspect-ratio";
import type { SectionImageAspectRatio } from "@/lib/utils/section-aspect-ratio";

import {
  contentLanguageNamesForPrompt,
  normalizeContentLanguage,
  type ContentLanguage,
} from "@/lib/utils/content-language";

function buildReferenceText(referenceAssets: ProductAsset[]) {
  if (!referenceAssets.length) {
    return "No reference images were provided.";
  }

  return `Reference images: ${referenceAssets.map((item) => item.fileName).join(" / ")}`;
}

function buildMainImageInstruction(referenceAssets: ProductAsset[]) {
  if (!referenceAssets.length) {
    return "If no product image reference is provided, infer the product carefully from the structured analysis and keep the same product identity across all generated sections.";
  }

  return [
    "The uploaded main product image is the source of truth for product identity.",
    "Keep the same product shape, material, color family, proportions, and key recognisable details across every generated hero image and detail image.",
    "Do not invent a different product.",
    "Use the provided image as the visual anchor, then change composition, scene, angle, crop, lighting, and selling-point emphasis according to the section goal.",
  ].join(" ");
}

function buildAspectInstruction(aspectRatio: SectionImageAspectRatio, sectionType: string) {
  if (aspectRatio === "16:9" || aspectRatio === "21:9") return `The final image must be a horizontal landscape ${aspectRatio} composition. Arrange product and copy across the wide canvas; do not create a vertical poster or rotate a portrait image.`;
  if (sectionType === "HERO") {
    return `The final image must be a ${aspectRatio === "1:1" ? "square" : "vertical"} ${aspectRatio} e-commerce product-gallery hero composition, with one dominant product and a concise cover layout.`;
  }
  if (aspectRatio === "1:1") {
    return "The final image must be a square 1:1 e-commerce hero composition, optimized for tappable product gallery covers.";
  }

  return aspectRatio === "3:4"
    ? "The final image must be a vertical 3:4 marketplace poster composition."
    : "The final image must be a vertical 9:16 long-form mobile commerce composition.";
}

function buildTargetLanguageInstruction(contentLanguage: ContentLanguage) {
  const targetLanguage = contentLanguageNamesForPrompt[normalizeContentLanguage(contentLanguage)];

  return [
    `All user-facing marketing copy that appears inside the image must be written in ${targetLanguage}.`,
    `The section title, key selling points, short supporting copy, disclaimers, and CTA should all be in ${targetLanguage} when they appear in the image.`,
    "Do not mix in Simplified Chinese unless the target language is Simplified Chinese.",
    "Keep the typography native, polished, and commercially readable for the target language.",
  ].join(" ");
}

export function buildSectionImagePrompt(
  section: PageSection,
  referenceAssets: ProductAsset[] = [],
  aspectRatio: SectionImageAspectRatio = "9:16",
  contentLanguage: ContentLanguage = "zh-CN",
  templates?: EcommercePromptTemplates,
) {
  const visualPrompt = section.type === "HERO"
    ? normalizeHeroComposition(section.visualPrompt, aspectRatio)
    : normalizeDetailComposition(section.visualPrompt, aspectRatio);
  return renderEcommercePrompt(section.type === "HERO" ? "ecommerce_workflow_hero_image" : "ecommerce_workflow_image", {
    "模块类型": section.type,
    "模块标题": section.title,
    "模块目标": section.goal,
    "模块文案": section.copy,
    "模块视觉提示词": visualPrompt,
    "参考素材说明": buildReferenceText(referenceAssets),
    "商品保真要求": buildMainImageInstruction(referenceAssets),
    "画幅要求": buildAspectInstruction(aspectRatio, section.type),
    "语言要求": buildTargetLanguageInstruction(contentLanguage),
  }, templates);
}

export function buildRegenerationPrompt(
  section: PageSection,
  referenceAssets: ProductAsset[] = [],
  aspectRatio: SectionImageAspectRatio = "9:16",
  contentLanguage: ContentLanguage = "zh-CN",
  templates?: EcommercePromptTemplates,
) {
  return renderEcommercePrompt("ecommerce_workflow_image_regenerate", {
    "基础出图提示词": buildSectionImagePrompt(section, referenceAssets, aspectRatio, contentLanguage, templates),
  }, templates);
}

export function buildImageEditPrompt(
  section: PageSection,
  referenceAssets: ProductAsset[] = [],
  mode: "repaint" | "enhance" = "repaint",
  aspectRatio: SectionImageAspectRatio = "9:16",
  contentLanguage: ContentLanguage = "zh-CN",
  templates?: EcommercePromptTemplates,
) {
  const modeInstruction =
    mode === "enhance"
      ? "This is an enhancement task. Use the current image as the base, preserve the overall framing, and improve realism, texture, lighting, clarity, edge quality, and commercial polish."
      : "This is a repaint task. Use the current image as the base, keep the same product identity, and redesign the composition, atmosphere, styling, and conversion emphasis according to the section goal.";

  return renderEcommercePrompt("ecommerce_workflow_image_edit", {
    "基础出图提示词": buildSectionImagePrompt(section, referenceAssets, aspectRatio, contentLanguage, templates),
    "编辑模式指令": modeInstruction,
  }, templates);
}

export function buildSectionSvgLayoutPrompt(
  section: PageSection,
  referenceAssets: ProductAsset[] = [],
  aspectRatio: SectionImageAspectRatio = "9:16",
  contentLanguage: ContentLanguage = "zh-CN",
  templates?: EcommercePromptTemplates,
) {
  const targetLanguage = contentLanguageNamesForPrompt[normalizeContentLanguage(contentLanguage)];

  return renderEcommercePrompt("ecommerce_workflow_svg_layout", {
    "目标语言名称": targetLanguage,
    "模块类型": section.type,
    "模块标题": section.title,
    "模块目标": section.goal,
    "模块文案": section.copy,
    "模块视觉提示词": section.visualPrompt,
    "图片比例": aspectRatio,
    "参考素材说明": buildReferenceText(referenceAssets),
  }, templates);
}
