import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { SectionType } from "@prisma/client";

export const rewriteExpectedSchema = z.object({ type: z.nativeEnum(SectionType), title: z.string(), goal: z.string(), copy: z.string(), visualPrompt: z.string() });
export const applyRewriteSchema = z.object({ expected: rewriteExpectedSchema, updates: z.object({ copy: z.string().max(8000), visualPrompt: z.string().min(1).max(20000) }).strict() }).strict();
export async function saveModuleRewrite(projectId: string, sectionId: string, input: z.infer<typeof applyRewriteSchema>) {
  return prisma.$transaction(async transaction => {
    const result = await transaction.pageSection.updateMany({
      where: { id: sectionId, projectId, ...input.expected, status: { not: "GENERATING" } }, data: input.updates,
    });
    if (!result.count) return null;
    return transaction.pageSection.findUniqueOrThrow({ where: { id: sectionId } });
  });
}
