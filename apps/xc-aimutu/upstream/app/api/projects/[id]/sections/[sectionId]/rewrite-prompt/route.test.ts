import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

test("prompt rewrite rejects cross-origin and malformed ranges before any model call", async () => {
  const original = globalThis.fetch;
  const state = globalThis as unknown as { __stuckTasksRecovered?: boolean };
  const recovered = state.__stuckTasksRecovered;
  state.__stuckTasksRecovered = true;
  const { POST } = await import("./route");
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Unexpected model call"); };
  const params = { id: "p", sectionId: "s" };
  try {
    const rejected = await POST(new NextRequest("http://localhost:3000/api/rewrite", { method: "POST", headers: { host: "localhost:3000", origin: "https://other.example" }, body: "{}" }), { params });
    assert.equal(rejected.status, 403);
    const malformed = await POST(new NextRequest("http://localhost:3000/api/rewrite", { method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", "Content-Type": "application/json" }, body: JSON.stringify({ instruction: "调整背景", target: "both", currentPrompt: "abcd", mode: "selection", start: 2, end: 2, draft: { title: "t", goal: "g", copy: "c", visualPrompt: "abcd" } }) }), { params });
    assert.equal(malformed.status, 400);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; state.__stuckTasksRecovered = recovered; }
});
