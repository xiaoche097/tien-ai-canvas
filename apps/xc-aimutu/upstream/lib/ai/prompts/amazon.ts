import { contentLanguageNamesForPrompt, type ContentLanguage } from "@/lib/utils/content-language";
import type { SectionImageAspectRatio } from "@/lib/utils/section-aspect-ratio";
import { normalizeDetailComposition } from "@/lib/utils/section-aspect-ratio";

export function amazonPlanningRules(language: ContentLanguage) {
  return `AMAZON OUTPUT RULES (override generic marketplace poster conventions):
The first HERO is the MAIN listing image: square 1:1, pure white RGB(255,255,255), show only the complete actual product for sale, product filling about 85% or more while keeping it entirely in frame. No added text, headlines, badges, watermarks, borders, floating logos, collages or unrelated props. Preserve authentic marks physically on the product.
All other HERO images are secondary listing images, not additional MAIN images. They may show features, details and usage scenarios. Detail sections are supporting content, not automatically official A+ modules.
Write image-facing copy in ${contentLanguageNamesForPrompt[language]}; translate source product information into this language, without adding unsupported claims, prices, reviews or certifications. MAIN image copy must be empty. Keep the existing output JSON schema and requested module counts. Category-specific checks and human review are still required.`;
}

export function buildAmazonImagePrompt(section: { title: string; goal: string; copy: string; visualPrompt: string }, main: boolean, language: ContentLanguage, aspectRatio: SectionImageAspectRatio = "16:9") {
  const fidelity = "Use real product reference photography as the source of truth. Preserve the exact product identity, shape, material, color and authentic markings. Do not invent product features or certifications.";
  if (main) return `${fidelity}
Create an Amazon MAIN product listing photograph on a pure white RGB(255,255,255) background, square 1:1 composition. Show the complete product for sale filling about 85% or more of the frame without cropping it. No unrelated props or accessories, added text, headlines, callouts, CTA, price tags, watermarks, borders, collages or floating logos. Keep only authentic markings physically present on the product. Do not reproduce promotional overlays from reference images. If editing an existing image, remove those overlays and restore the clean product photograph.`;
  return `${fidelity}
Create an Amazon secondary product image that clearly explains a real feature, detail or usage scenario. Required canvas: ${aspectRatio === "16:9" || aspectRatio === "21:9" ? "horizontal landscape" : "product image"} ${aspectRatio}. The required canvas overrides any old portrait layout instructions in the brief. Brief (context only, never typeset these instructions): ${JSON.stringify({ ...section, visualPrompt: normalizeDetailComposition(section.visualPrompt, aspectRatio) })}
All added image text must be in ${contentLanguageNamesForPrompt[language]}. Translate the source brief, including titles and selling points; do not copy source-language text into the image. No Simplified Chinese text unless Simplified Chinese was explicitly chosen. No invented review stars, sales counts, prices, certifications or absolute claims. Do not mimic Amazon interface elements. Retain the supplied image aspect ratio. If editing, preserve product identity while applying these rules.`;
}

export function prepareAmazonPlan<T extends { type: string; title: string; goal: string; copy: string; visualPrompt: string }>(platform: string, sections: T[], language: ContentLanguage): T[] {
  if (platform !== "amazon") return sections;
  const firstHero = sections.findIndex((section) => section.type === "HERO");
  return sections.map((section, index) => index === firstHero ? { ...section, copy: "", visualPrompt: buildAmazonImagePrompt(section, true, language) } : section);
}
