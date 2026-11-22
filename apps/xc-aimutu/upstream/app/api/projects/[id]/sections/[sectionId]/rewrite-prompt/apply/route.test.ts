import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

test("rewrite save requires same origin and only accepts the two content fields", async () => {
  const state = globalThis as any;
  const recovered = state.__stuckTasksRecovered;
  state.__stuckTasksRecovered = true;
  const { POST } = await import("./route");
  try {
    const params = { id: "p", sectionId: "s" };
    const request = (origin: string, body: unknown) => new NextRequest("http://localhost:3000/motu/api/rewrite/apply", { method: "POST", headers: { host: "localhost:3000", origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await POST(request("https://other.example", {}), { params })).status, 403);
    const expected = { type: "HERO", title: "t", goal: "g", copy: "c", visualPrompt: "v" };
    assert.equal((await POST(request("http://localhost:3000", { expected, updates: { copy: "new", visualPrompt: "v", currentImageAssetId: "forged" } }), { params })).status, 400);
  } finally { state.__stuckTasksRecovered = recovered; }
});
