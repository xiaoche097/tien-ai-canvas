import { NextRequest } from "next/server";

import { handleRouteError, ok } from "@/lib/utils/route";
import { getCanvasVideoTask } from "@/lib/canvas/video-render";

const MPT_BASE_URL = process.env.MPT_BASE_URL || "http://localhost:8080";

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  if (process.env.CANVAS_INTEGRATION === "1") {
    try {
      const task = await getCanvasVideoTask(context.params.id);
      return ok({ status: task.status === "succeeded" ? "completed" : task.status === "cancelled" ? "failed" : task.status,
        progress: task.progress, message: task.error || task.stage });
    } catch (error) {
      return handleRouteError(error);
    }
  }
  try {
    const taskId = context.params.id;
    const response = await fetch(`${MPT_BASE_URL}/tasks/${taskId}`);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`任务查询失败: ${response.status} ${text}`);
    }

    const payload = await response.json();
    return ok(payload.data || payload);
  } catch (error) {
    return handleRouteError(error);
  }
}
