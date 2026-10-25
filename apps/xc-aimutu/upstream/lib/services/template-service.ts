import { prisma } from "@/lib/db/prisma";
import { getProviderAdapter } from "@/lib/services/provider-service";
import type { TemplateStructure, TemplateStyleProfile } from "@/types/template";
import { buildTemplateAnalysisPrompt, buildTemplateAnalysisInput } from "@/lib/ai/prompts/template";
import { loadEcommercePromptTemplates } from "@/lib/canvas/prompt-templates";


export async function analyzeTemplate(
  description: string,
  imageUrls?: string[],
): Promise<{ structure: TemplateStructure; rawText: string }> {
  const { adapter, provider } = await getProviderAdapter("text");

  const defaultAnalysisModel = provider.models.find((m) => (m as any).isDefaultAnalysis);
  const hasVision = (m: typeof provider.models[0]) => {
    const caps = m.capabilities as Record<string, unknown>;
    return Boolean(caps?.vision && (caps?.text || caps?.structured_output));
  };

  let selectedModel: typeof provider.models[0] | undefined;

  if (imageUrls?.length) {
    if (defaultAnalysisModel && hasVision(defaultAnalysisModel)) {
      selectedModel = defaultAnalysisModel;
    } else {
      selectedModel = provider.models.find(hasVision);
    }
  } else {
    selectedModel = defaultAnalysisModel ?? provider.models[0];
  }

  const modelId = selectedModel?.modelId ?? provider.models[0]?.modelId ?? "";

  const templates = await loadEcommercePromptTemplates();
  const userPrompt = buildTemplateAnalysisInput(description, Boolean(imageUrls?.length), templates);

  const result = await adapter.generateText({
    model: modelId,
    systemPrompt: buildTemplateAnalysisPrompt(templates),
    userPrompt,
    images: imageUrls,
    timeoutMs: 180000,
  });

  let parsed: TemplateStructure;
  try {
    const cleaned = result.text.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
    parsed = JSON.parse(cleaned) as TemplateStructure;
  } catch {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]) as TemplateStructure;
    } else {
      throw new Error("AI 分析结果格式不正确，无法解析为 JSON");
    }
  }

  if (!parsed.modules || !Array.isArray(parsed.modules) || parsed.modules.length === 0) {
    throw new Error("AI 分析结果缺少模块数据");
  }

  parsed.modules = parsed.modules.map((m, i) => ({
    ...m,
    order: m.order ?? i + 1,
    type: m.type ?? "custom",
    aspectRatio: m.aspectRatio ?? "3:4",
  }));

  return { structure: parsed, rawText: result.text };
}

export async function createTemplate(input: {
  name: string;
  referenceImageUrl: string;
  structureJson: TemplateStructure;
  styleProfile: TemplateStyleProfile;
  category?: string;
  description?: string;
  rawAnalysis?: string;
}) {
  const moduleCount = input.structureJson.modules.length;

  const template = await prisma.template.create({
    data: {
      name: input.name,
      referenceImageUrl: input.referenceImageUrl,
      structureJson: input.structureJson as any,
      styleProfile: input.styleProfile as any,
      category: input.category ?? "general",
      description: input.description ?? null,
      rawAnalysis: input.rawAnalysis ?? null,
      moduleCount,
    },
  });

  return template;
}

export async function getAllTemplates(category?: string) {
  const templates = await prisma.template.findMany({
    where: category ? { category } : undefined,
    orderBy: { createdAt: "desc" },
  });

  return templates;
}

export async function getTemplateById(id: string) {
  const template = await prisma.template.findUnique({
    where: { id },
  });

  return template;
}

export async function deleteTemplate(id: string) {
  await prisma.template.delete({
    where: { id },
  });
}

export async function updateTemplate(
  id: string,
  input: {
    name?: string;
    structureJson?: TemplateStructure;
    styleProfile?: TemplateStyleProfile;
    category?: string;
    description?: string;
  },
) {
  const template = await prisma.template.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.structureJson !== undefined && { structureJson: input.structureJson as any }),
      ...(input.styleProfile !== undefined && { styleProfile: input.styleProfile as any }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.structureJson !== undefined && { moduleCount: input.structureJson.modules.length }),
    },
  });

  return template;
}
