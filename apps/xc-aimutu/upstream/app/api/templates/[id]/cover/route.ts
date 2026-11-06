import { NextRequest } from "next/server";
import { getTemplateById, updateTemplate } from "@/lib/services/template-service";
import { saveTemplateCover } from "@/lib/storage/template-cover";
import { fail, handleRouteError, ok } from "@/lib/utils/route";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!await getTemplateById(params.id)) return fail("NOT_FOUND", "模板不存在", null, 404);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.type.startsWith("image/") || !file.size) return fail("INVALID_IMAGE", "请选择封面图片", null, 400);
    if (file.size > 20 * 1024 * 1024) return fail("FILE_TOO_LARGE", "封面图片需在 20MB 以内", null, 413);
    const referenceImageUrl = await saveTemplateCover(Buffer.from(await file.arrayBuffer()));
    const template = await updateTemplate(params.id, { referenceImageUrl });
    return ok({ template });
  } catch (error) {
    return handleRouteError(error);
  }
}
