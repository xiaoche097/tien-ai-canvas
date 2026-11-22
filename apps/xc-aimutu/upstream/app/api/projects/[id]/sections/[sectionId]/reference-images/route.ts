import { NextRequest } from "next/server";
import { referenceActionSchema } from "@/lib/ai/module-reference";
import { moduleReferenceState, runModuleReference } from "@/lib/services/module-reference-service";
import { getAccessKeyFromHeader } from "@/lib/utils/auth";
import { fail, handleRouteError, ok } from "@/lib/utils/route";

export const dynamic = "force-dynamic";
export async function GET(_request: NextRequest, { params }: { params: { id: string; sectionId: string } }) {
  try { return ok(await moduleReferenceState(params.id, params.sectionId)); } catch (error) { return handleRouteError(error); }
}
export async function POST(request: NextRequest, { params }: { params: { id: string; sectionId: string } }) {
  try {
    if (!["http", "https"].some(protocol => request.headers.get("origin") === `${protocol}://${request.headers.get("host")}`)) return fail("origin_rejected", "请从当前网站提交参考图操作", null, 403);
    const input = referenceActionSchema.parse(await request.json());
    return ok(await runModuleReference(params.id, params.sectionId, input, getAccessKeyFromHeader(request)));
  } catch (error) { return handleRouteError(error); }
}
