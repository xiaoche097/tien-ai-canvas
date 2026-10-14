import { prisma } from "@/lib/db/prisma";
import { syncGeneratedImageToCanvas } from "@/lib/storage/asset-manager";
import { fail, handleRouteError, ok } from "@/lib/utils/route";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.CANVAS_INTEGRATION !== "1") return fail("NOT_FOUND", "Not found", null, 404);
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) return fail("NOT_FOUND", "项目不存在", null, 404);
    const generated = await prisma.productAsset.findMany({
      where: { projectId: id, type: "GENERATED" }, select: { id: true, metadata: true }, orderBy: { createdAt: "asc" },
    });
    const pending = generated.filter((asset) => {
      const metadata = asset.metadata;
      return !metadata || typeof metadata !== "object" || Array.isArray(metadata) || metadata.canvasSyncStatus !== "synced";
    });
    let synced = 0;
    let failed = 0;
    for (const asset of pending) {
      try {
        await syncGeneratedImageToCanvas(asset.id);
        synced++;
      } catch {
        failed++;
      }
    }
    return ok({ synced, failed });
  } catch (error) {
    return handleRouteError(error);
  }
}
