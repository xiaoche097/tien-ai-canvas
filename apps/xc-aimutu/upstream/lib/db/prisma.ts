import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { canvasUserDirectory } from "@/lib/canvas/scope";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  canvasPrisma?: Map<string, PrismaClient>;
};

function migrationVersion() {
  const root = path.join(process.cwd(), "prisma", "migrations");
  const hash = createHash("sha256");
  for (const name of fs.readdirSync(root).sort()) {
    const file = path.join(root, name, "migration.sql");
    if (fs.existsSync(file)) hash.update(name).update(fs.readFileSync(file));
  }
  return hash.digest("hex");
}

function ensureCanvasDatabase(dbPath: string) {
  const version = migrationVersion();
  const marker = `${dbPath}.schema`;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const ready = () => fs.existsSync(marker) && fs.readFileSync(marker, "utf8") === version;
  if (ready()) return;
  execFileSync(process.execPath, [path.join(process.cwd(), "scripts", "apply-prisma-migrations.cjs")], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${dbPath.replaceAll("\\", "/")}` },
    stdio: "ignore",
  });
  fs.writeFileSync(marker, version);
}

const canvasClients = globalForPrisma.canvasPrisma ?? new Map<string, PrismaClient>();
globalForPrisma.canvasPrisma = canvasClients;

function canvasPrisma() {
  const dbPath = path.join(canvasUserDirectory(), "motu.db");
  let client = canvasClients.get(dbPath);
  if (!client) {
    ensureCanvasDatabase(dbPath);
    client = new PrismaClient({ datasources: { db: { url: `file:${dbPath.replaceAll("\\", "/")}` } } });
    canvasClients.set(dbPath, client);
  }
  return client;
}

export const prisma: PrismaClient = process.env.CANVAS_INTEGRATION === "1"
  ? new Proxy({} as PrismaClient, {
      get(_target, key) {
        const client = canvasPrisma();
        const value = Reflect.get(client, key, client);
        return typeof value === "function" ? value.bind(client) : value;
      },
    })
  : globalForPrisma.prisma ??
    new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });

if (process.env.NODE_ENV !== "production" && process.env.CANVAS_INTEGRATION !== "1") {
  globalForPrisma.prisma = prisma;
}

// Recover stuck generation tasks on startup (e.g. after dev server crash/restart)
const STUCK_THRESHOLD_MINUTES = 10;
const hasRecovered = (globalThis as unknown as { __stuckTasksRecovered?: boolean }).__stuckTasksRecovered;

if (!hasRecovered && process.env.CANVAS_INTEGRATION !== "1") {
  (globalThis as unknown as { __stuckTasksRecovered?: boolean }).__stuckTasksRecovered = true;

  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000);

  prisma.generationTask
    .findMany({
      where: {
        status: "RUNNING",
        startedAt: { lt: cutoff },
      },
      select: { id: true, sectionId: true },
    })
    .then(async (stuckTasks) => {
      if (stuckTasks.length === 0) return;

      const sectionIds = stuckTasks
        .map((t) => t.sectionId)
        .filter((id): id is string => !!id);

      await prisma.generationTask.updateMany({
        where: { id: { in: stuckTasks.map((t) => t.id) } },
        data: {
          status: "FAILED",
          errorMessage: "任务因服务器重启而中断",
          completedAt: new Date(),
        },
      });

      if (sectionIds.length > 0) {
        await prisma.pageSection.updateMany({
          where: {
            id: { in: sectionIds },
            status: "GENERATING",
          },
          data: { status: "IDLE" },
        });
      }

      console.log(`[Recovery] Reset ${stuckTasks.length} stuck generation tasks to FAILED`);
    })
    .catch((err) => {
      console.error("[Recovery] Failed to recover stuck tasks:", err);
    });
}
