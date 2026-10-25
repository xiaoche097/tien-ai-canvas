export const detailAspectRatios = ["3:4", "9:16", "16:9", "21:9"] as const;
export type DetailAspectRatio = (typeof detailAspectRatios)[number];
export type SectionImageAspectRatio = "1:1" | DetailAspectRatio;

export function normalizeDetailAspectRatio(value: unknown, platform?: string): DetailAspectRatio {
  return detailAspectRatios.includes(value as DetailAspectRatio) ? value as DetailAspectRatio : platform === "amazon" ? "16:9" : "9:16";
}

export function sectionOutputSize(ratio: SectionImageAspectRatio, type: string) {
  if (ratio === "16:9") return "1792x1008";
  if (ratio === "21:9") return "1792x768";
  if (ratio === "1:1") return "1024x1024";
  return type === "HERO" && ratio === "3:4" ? "768x1024" : "1024x1536";
}

export function normalizeDetailComposition(prompt: string, ratio: SectionImageAspectRatio) {
  if (ratio !== "16:9" && ratio !== "21:9") return prompt;
  return prompt.replace(/竖版\s*(?:3[:：]4|9[:：]16)/g, `横版 ${ratio}`)
    .replace(/(?:vertical|portrait)\s+(?:3:4|9:16)(?:\s+mobile)?/gi, `horizontal ${ratio}`);
}

export function normalizeHeroComposition(prompt: string, aspectRatio: SectionImageAspectRatio) {
  return prompt
    .replace(/(?:正方形|竖版)\s*(?:1[:：]1|3[:：]4|9[:：]16)\s*构图/g, aspectRatio === "1:1" ? "正方形 1:1 构图" : `竖版 ${aspectRatio} 构图`)
    .replace(/(?:square|vertical)\s+(?:1:1|3:4|9:16)\s+(?:mobile\s+)?composition/gi, aspectRatio === "1:1" ? "square 1:1 composition" : `vertical ${aspectRatio} composition`)
    .replace(/(?:1[:：]1|3[:：]4)(?=\s*头图轮播)/g, aspectRatio)
    .replace(/\bsquare(?=\s+(?:e-commerce|gallery))/gi, aspectRatio === "1:1" ? "square" : `vertical ${aspectRatio}`);
}

export function getSectionAspectRatio(
  section: { type: string; editableData?: unknown },
  detailAspectRatio: DetailAspectRatio = "9:16",
  heroAspectRatio: "1:1" | "3:4" = "1:1",
): SectionImageAspectRatio {
  if (section.type !== "HERO") return detailAspectRatio;
  const data = section.editableData as Record<string, unknown> | null | undefined;
  return data?.heroAspectRatio === "3:4" || data?.heroAspectRatio === "1:1" ? data.heroAspectRatio : heroAspectRatio;
}
