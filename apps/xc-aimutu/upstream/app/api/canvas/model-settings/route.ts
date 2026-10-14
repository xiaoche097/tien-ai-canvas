import { NextRequest } from "next/server";
import { canvasModels, InvalidModelAssignmentError, modelAssignmentsSchema, readModelAssignments, saveModelAssignments } from "@/lib/canvas/model-settings";
import { fail, handleRouteError, ok } from "@/lib/utils/route";

export async function GET() {
  if (process.env.CANVAS_INTEGRATION !== "1") return fail("NOT_FOUND", "Not found", null, 404);
  try {
    const [models, assignments] = await Promise.all([canvasModels(), readModelAssignments()]);
    return ok({ models, assignments });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: NextRequest) {
  if (process.env.CANVAS_INTEGRATION !== "1") return fail("NOT_FOUND", "Not found", null, 404);
  try {
    const assignments = modelAssignmentsSchema.parse(await request.json());
    const saved = await saveModelAssignments(assignments, await canvasModels());
    return ok({ assignments: saved });
  } catch (error) {
    if (error instanceof InvalidModelAssignmentError) return fail("INVALID_MODEL_ASSIGNMENT", error.message);
    return handleRouteError(error);
  }
}
