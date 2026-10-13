import assert from "node:assert/strict";
import test from "node:test";
import { trustedLive2DURL } from "./live2d-loader";

const api = new URL("https://api.example.com/api/");
const bundled = new URL("https://www.example.com/live2d/jingche/");

test("trustedLive2DURL accepts only the bundled model files for either theme", () => {
    assert.equal(trustedLive2DURL(new URL("dark/JingcheAgent.model3.json", bundled), api, bundled), true);
    assert.equal(trustedLive2DURL(new URL("light/texture_00.png", bundled), api, bundled), true);
    assert.equal(trustedLive2DURL(new URL("dark/other.js", bundled), api, bundled), false);
    assert.equal(trustedLive2DURL(new URL("dark/nested/texture_00.png", bundled), api, bundled), false);
    assert.equal(trustedLive2DURL(new URL("https://other.example.com/live2d/jingche/dark/texture_00.png"), api, bundled), false);
});

test("trustedLive2DURL keeps uploaded models on the API origin", () => {
    assert.equal(trustedLive2DURL(new URL("public/appearance/live2d/id/model3.json", api), api, bundled), true);
    assert.equal(trustedLive2DURL(new URL("admin/settings/appearance/live2d/id/model3.json", api), api, bundled), true);
    assert.equal(trustedLive2DURL(new URL("https://www.example.com/api/public/appearance/live2d/id/model3.json"), api, bundled), false);
});
