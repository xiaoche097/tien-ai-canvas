import definitions from "./ecommerce-defaults.json";

export type EcommercePromptTemplates = Readonly<Record<string, string>>;
export const ecommercePromptDefinitions = definitions;
export const ecommerceDefaultTemplates: EcommercePromptTemplates = Object.fromEntries(
  definitions.map((definition) => [definition.operation, definition.content]),
);

export function renderEcommercePrompt(
  operation: string,
  values: Record<string, string | number>,
  templates: EcommercePromptTemplates = ecommerceDefaultTemplates,
) {
  const content = templates[operation];
  if (typeof content !== "string" || !content.trim()) throw new Error(`电商设计室提示词模板不可用：${operation}`);
  return content.replace(/\{\{([^{}]+)\}\}/g, (_, key: string) => {
    if (!Object.hasOwn(values, key)) throw new Error(`电商设计室提示词缺少变量：${key}`);
    return String(values[key]);
  });
}
