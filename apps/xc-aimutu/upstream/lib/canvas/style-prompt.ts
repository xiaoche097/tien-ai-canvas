import { canvasRequest } from "@/lib/canvas/backend";

export async function ecommerceStylePrompt(
  style: string,
  request: (path: string) => Promise<{ content: string }> = canvasRequest,
): Promise<string> {
  if (process.env.CANVAS_INTEGRATION !== "1") return "";
  const result = await request(`/api/ecommerce/style-prompt?${new URLSearchParams({ style })}`);
  if (typeof result.content !== "string" || !result.content.trim()) {
    throw new Error("电商设计室风格模板内容为空");
  }
  return result.content;
}
