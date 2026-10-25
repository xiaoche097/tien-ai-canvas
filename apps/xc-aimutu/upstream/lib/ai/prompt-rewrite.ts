import { z } from "zod";
import { renderEcommercePrompt, type EcommercePromptTemplates } from "./prompts/ecommerce-templates";

export const promptRewriteSchema = z.object({
  instruction: z.string().trim().min(2).max(2000),
  currentPrompt: z.string().max(20000),
  target: z.enum(["both", "visualPrompt", "copy"]),
  mode: z.enum(["selection", "module"]),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  draft: z.object({ title: z.string().max(500), goal: z.string().max(2000), copy: z.string().max(8000), visualPrompt: z.string().max(20000) }),
}).superRefine((value, ctx) => {
  if ((value.mode === "selection" && value.end <= value.start) || value.end > value.currentPrompt.length) ctx.addIssue({ code: "custom", message: "请选择有效的改写范围" });
  if (value.mode === "module" && (value.start !== 0 || value.end !== value.currentPrompt.length)) ctx.addIssue({ code: "custom", message: "模块改写范围无效" });
  if (value.currentPrompt !== (value.target === "copy" ? value.draft.copy : value.draft.visualPrompt)) ctx.addIssue({ code: "custom", message: "改写源文与当前模块不一致" });
});
export type PromptRewriteInput = z.infer<typeof promptRewriteSchema>;

export function buildModuleRewritePrompt(input: PromptRewriteInput, context: unknown, templates?: EcommercePromptTemplates) {
  return renderEcommercePrompt("ecommerce_workflow_module_rewrite", {
    商品与模块上下文: JSON.stringify(context),
    当前模块草稿: JSON.stringify(input.draft),
    原始提示词: input.currentPrompt,
    待改写片段: input.currentPrompt.slice(input.start, input.end),
    用户修改要求: input.instruction,
    改写范围: JSON.stringify({ target: input.target, scope: input.mode === "selection" ? "只替换所选字段的选中片段，选区之外由程序原样保留" : "当前模块的所选字段全文，只按修改要求调整，保留其余内容", linkedCopy: input.target === "both" ? "同时调整模块文案中与要求相关的内容，保留其余文案" : "其他字段不改" }),
  }, templates);
}

export function applyPromptReplacement(input: PromptRewriteInput, raw: string) {
  const replacement = raw.trim().replace(/^```(?:text|markdown)?\s*\n([\s\S]*?)\n```$/, "$1").trim();
  if ((!replacement && input.target !== "copy") || replacement.length > 20000) throw new Error("模型未返回有效改写，请调整要求后重试。");
  const prompt = input.currentPrompt.slice(0, input.start) + replacement + input.currentPrompt.slice(input.end);
  if (prompt.length > 20000) throw new Error("改写后的 Prompt 过长，原内容未修改。");
  return { replacement, prompt };
}
