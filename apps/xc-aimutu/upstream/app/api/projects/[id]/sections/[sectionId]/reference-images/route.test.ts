import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

test("reference actions reject cross-origin and invalid requests before model or database work", async () => {
  const state = globalThis as any;
  const recovered = state.__stuckTasksRecovered;
  state.__stuckTasksRecovered = true;
  const { POST } = await import("./route");
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Unexpected model request"); };
  try {
    const request = (origin: string, body: unknown) => new NextRequest("http://localhost:3000/motu/api/reference-images", { method: "POST", headers: { host: "localhost:3000", origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const params = { id: "p", sectionId: "s" };
    assert.equal((await POST(request("https://other.example", {}), { params })).status, 403);
    assert.equal((await POST(request("http://localhost:3000", { action: "generate", requestId: "bad", planId: "p", shotIndex: -1 }), { params })).status, 400);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; state.__stuckTasksRecovered = recovered; }
});
