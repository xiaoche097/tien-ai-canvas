import { test } from "node:test";
import assert from "node:assert/strict";

import { ecommerceStylePrompt } from "./style-prompt";

test("integrated style lookup requests the current template each time and propagates failures", async () => {
  const originalIntegration = process.env.CANVAS_INTEGRATION;
  process.env.CANVAS_INTEGRATION = "1";
  let version = 0;
  try {
    const request = async (path: string) => {
      const url = new URL(path, "http://backend.test");
      assert.equal(url.pathname, "/api/ecommerce/style-prompt");
      assert.equal(url.searchParams.get("style"), "户外机能·城市休闲");
      return { content: `模板版本 ${++version}` };
    };
    assert.equal(await ecommerceStylePrompt("户外机能·城市休闲", request), "模板版本 1");
    assert.equal(await ecommerceStylePrompt("户外机能·城市休闲", request), "模板版本 2");
    const failingRequest = async () => { throw new Error("template unavailable"); };
    await assert.rejects(ecommerceStylePrompt("tech", failingRequest), /template unavailable/);
    await assert.rejects(ecommerceStylePrompt("tech", async () => ({ content: " " })), /模板内容为空/);
    process.env.CANVAS_INTEGRATION = "0";
    assert.equal(await ecommerceStylePrompt("tech", failingRequest), "");
  } finally {
    if (originalIntegration === undefined) delete process.env.CANVAS_INTEGRATION;
    else process.env.CANVAS_INTEGRATION = originalIntegration;
  }
});
