import { createHash } from "node:crypto";
import path from "node:path";
import { headers } from "next/headers";

export function canvasUserDirectory() {
  const root = process.env.MOTU_DATA_DIR;
  const userId = headers().get("x-canvas-user-id");
  if (!root || !path.isAbsolute(root) || !userId) {
    throw new Error("电商设计室用户数据目录或境彻登录态不可用");
  }
  const scope = createHash("sha256").update(userId).digest("hex");
  return path.join(root, "users", scope);
}
