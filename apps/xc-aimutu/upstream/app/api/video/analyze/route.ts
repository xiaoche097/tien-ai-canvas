import { NextRequest } from "next/server";

import { analyzeVideo } from "@/lib/services/video-service";
import { handleRouteError, ok } from "@/lib/utils/route";
import { analyzeCanvasVideo } from "@/lib/canvas/video-storyboard";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file || file.size === 0) {
      return ok({ analysis: null, error: "请上传视频文件" });
    }

    if (process.env.CANVAS_INTEGRATION === "1" && file.size > 50 * 1024 * 1024) {
      throw new Error("参考视频不能超过 50MB");
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = process.env.CANVAS_INTEGRATION === "1"
      ? await analyzeCanvasVideo(buffer)
      : await analyzeVideo(buffer, file.name);

    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
