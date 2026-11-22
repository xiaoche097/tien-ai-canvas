import { z } from "zod";
import { renderEcommercePrompt, type EcommercePromptTemplates } from "./prompts/ecommerce-templates";

export const referenceDraftSchema = z.object({ type: z.string().min(1).max(100), title: z.string().max(500), goal: z.string().max(2000), copy: z.string().max(8000), visualPrompt: z.string().min(1).max(20000) });
export const referenceShotsSchema = z.object({ shots: z.array(z.object({ kind: z.enum(["angle", "detail"]), title: z.string().min(1).max(100), view: z.string().min(1).max(300), target: z.string().min(1).max(300), reuseAssetId: z.string().min(1).nullable().optional() }).strict()).min(1).max(6) });
export type ReferenceShot = z.infer<typeof referenceShotsSchema>["shots"][number];
export type ReferenceDraft = z.infer<typeof referenceDraftSchema>;
export const referenceActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("plan"), requestId: z.string().uuid(), sourceAssetId: z.string().min(1), draft: referenceDraftSchema }),
  z.object({ action: z.literal("generate"), requestId: z.string().uuid(), planId: z.string().min(1), shotIndex: z.number().int().min(0).max(5), force: z.boolean().optional() }),
  z.object({ action: z.literal("approve"), assetId: z.string().min(1) }),
]);
export function referenceMetadata(asset: { metadata?: unknown }) {
  const data = asset.metadata;
  return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
}
export function isModuleReference(asset: { metadata?: unknown }) { return referenceMetadata(asset).purpose === "module_reference"; }
export function referenceAllowed(asset: { metadata?: unknown; sectionId?: string | null }, sectionId: string) {
  const meta = referenceMetadata(asset);
  return !isModuleReference(asset) || (meta.referenceApproved === true && (asset.sectionId === sectionId || meta.referenceScope === "project"));
}
export function referenceShotKey(sourceAssetId: string, shot: Pick<ReferenceShot, "kind" | "view" | "target">) {
  const clean = (text: string) => text.normalize("NFKC").toLowerCase()
    .replace(/([+-])(?=\d)/g, sign => sign === "-" ? "minus" : "plus")
    .replace(/(\d)([.,/⁄:])(?=\d)/g, (_, digit: string, separator: string) => digit + (/[.,]/.test(separator) ? "decimal" : separator === ":" ? "ratio" : "over"))
    .replace(/[\s\p{P}\p{S}]+/gu, "");
  return JSON.stringify([sourceAssetId, shot.kind, clean(shot.view), clean(shot.target)]);
}
export function reusableReference<T extends { id: string; metadata?: unknown }>(assets: T[], sourceAssetId: string, shot: ReferenceShot) {
  const originals = assets.filter(asset => isModuleReference(asset) && referenceMetadata(asset).sourceAssetId === sourceAssetId);
  const key = referenceShotKey(sourceAssetId, shot);
  return originals.find(asset => {
    const existing = referenceShotsSchema.shape.shots.element.safeParse(referenceMetadata(asset).referenceShot);
    return existing.success && referenceShotKey(sourceAssetId, existing.data) === key;
  }) ?? (shot.reuseAssetId ? originals.find(asset => asset.id === shot.reuseAssetId) : undefined);
}
export function referencePlanPrompt(context: unknown, templates?: EcommercePromptTemplates) {
  return renderEcommercePrompt("ecommerce_workflow_reference_plan", { 模块与商品上下文: JSON.stringify(context) }, templates);
}
export function referenceImagePrompt(shot: z.infer<typeof referenceShotsSchema>["shots"][number], facts: unknown, templates?: EcommercePromptTemplates) {
  return renderEcommercePrompt("ecommerce_workflow_reference_image", { 目标视角与部位: JSON.stringify(shot), 商品事实: JSON.stringify(facts) }, templates);
}
