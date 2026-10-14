import { cancelSectionImageTask } from "@/lib/services/task-service";
import { handleRouteError, ok } from "@/lib/utils/route";

export async function POST(_request: Request, context: { params: { id: string; sectionId: string } }) {
  try {
    const cancelled = await cancelSectionImageTask(context.params.id, context.params.sectionId);
    return ok({ cancelled });
  } catch (error) {
    return handleRouteError(error);
  }
}
