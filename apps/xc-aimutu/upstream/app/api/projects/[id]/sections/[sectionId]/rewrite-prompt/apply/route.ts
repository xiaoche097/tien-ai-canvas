import { NextRequest } from "next/server";
import { applyRewriteSchema, saveModuleRewrite } from "@/lib/services/module-rewrite-service";
import { fail, handleRouteError, ok } from "@/lib/utils/route";

export async function POST(request: NextRequest, { params }: { params: { id: string; sectionId: string } }) {
  try {
    if (!["http", "https"].some(protocol => request.headers.get("origin") === `${protocol}://${request.headers.get("host")}`)) return fail("origin_rejected", "请从当前网站保存改写", null, 403);
    const section = await saveModuleRewrite(params.id, params.sectionId, applyRewriteSchema.parse(await request.json()));
    if (!section) return fail("rewrite_conflict", "模块已在其他操作中变化或正在生成，未覆盖内容。请重新载入后改写。", null, 409);
    return ok(section);
  } catch (error) { return handleRouteError(error); }
}
