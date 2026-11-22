import { canvasRequest } from "@/lib/canvas/backend";
import { ecommerceDefaultTemplates, ecommercePromptDefinitions, type EcommercePromptTemplates } from "@/lib/ai/prompts/ecommerce-templates";

type TemplateResponse = { templates: Array<{ operation: string; content: string; templateId: string; templateVersion: number }> };

export async function loadEcommercePromptTemplates(
  request: (path: string) => Promise<TemplateResponse> = canvasRequest,
): Promise<EcommercePromptTemplates> {
  if (process.env.CANVAS_INTEGRATION !== "1") return ecommerceDefaultTemplates;
  const result = await request("/api/ecommerce/prompt-templates");
  if (!Array.isArray(result.templates)) throw new Error("电商设计室提示词模板响应无效");
  const templates = Object.fromEntries(result.templates.map((template) => [template.operation, template.content]));
  for (const definition of ecommercePromptDefinitions) {
    if (typeof templates[definition.operation] !== "string" || !templates[definition.operation].trim()) {
      throw new Error(`电商设计室提示词模板缺失：${definition.label}`);
    }
  }
  return templates;
}
