import { renderEcommercePrompt, type EcommercePromptTemplates } from "./ecommerce-templates";

export function buildTemplateAnalysisPrompt(templates?: EcommercePromptTemplates) {
  return renderEcommercePrompt("ecommerce_workflow_template_analysis", {}, templates);
}

export function buildTemplateAnalysisInput(description: string, hasImages: boolean, templates?: EcommercePromptTemplates) {
  return hasImages
    ? renderEcommercePrompt("ecommerce_workflow_template_image_input", { 补充描述: description ? "\n用户补充描述：\n" + description : "" }, templates)
    : renderEcommercePrompt("ecommerce_workflow_template_text_input", { 详情页描述: description }, templates);
}

export function buildTemplateSectionPrompt(input: { name: string; productName: string; overallStyle: string; styleNotes: string }, templates?: EcommercePromptTemplates) {
  return renderEcommercePrompt("ecommerce_workflow_template_apply", {
    模块名称: input.name, 商品名称: input.productName, 整体风格: input.overallStyle, 模块风格要求: input.styleNotes,
  }, templates);
}

export function buildReferenceStylePrompt(templates?: EcommercePromptTemplates) {
  return renderEcommercePrompt("ecommerce_workflow_reference_style", {}, templates);
}
