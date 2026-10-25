import { expect, test } from "bun:test";
import { isPsdLayerEvent, parseNativeTextLayers, parsePsdLayerSource, psdLayerSourceMatches, validatePsdLayerBundle, type PsdLayerBundle } from "@/lib/psd-layer-contract";

const line = { text: "真实文案\n第二行", bbox: [100, 100, 800, 300], fontSize: 40, color: "#123ABC", bold: true, align: "left", rotation: 0 };
test("PSD source binding requires project, module, session and the exact saved version", () => {
  const source = { projectId: "project", sectionId: "module", sessionId: "session", versionId: null };
  expect(parsePsdLayerSource({ ...source, ignored: "not persisted" })).toEqual(source);
  expect(psdLayerSourceMatches(source, source)).toBe(true);
  for (const changed of [{ projectId: "other" }, { sectionId: "other" }, { sessionId: "other" }, { versionId: "saved-version" }]) expect(psdLayerSourceMatches({ ...source, ...changed }, source)).toBe(false);
  for (const invalid of [undefined, {}, { ...source, sessionId: "" }, { ...source, versionId: undefined }, { ...source, projectId: "x".repeat(161) }]) expect(() => parsePsdLayerSource(invalid)).toThrow();
});
test("PSD handoff binds exact origin, window and current operation nonce", () => {
  const source = {} as Window, expected = { origin: "http://localhost:3003", source, nonce: "current-operation" };
  const event = { origin: expected.origin, source, data: { nonce: expected.nonce, type: "xc-psd-layers-result" } };
  expect(isPsdLayerEvent(event, expected)).toBe(true);
  for (const changed of [{ origin: "https://unrelated.example" }, { source: {} as Window }, { source: null }, { data: { nonce: "previous-operation" } }, { data: null }, { data: "current-operation" }]) expect(isPsdLayerEvent({ ...event, ...changed }, expected)).toBe(false);
  expect(isPsdLayerEvent(event, { ...expected, source: null })).toBe(false);
});
function png(width: number, height: number) {
  const buffer = new ArrayBuffer(33), bytes = new Uint8Array(buffer), view = new DataView(buffer);
  bytes.set([137,80,78,71,13,10,26,10]); view.setUint32(12, 0x49484452); view.setUint32(16, width); view.setUint32(20, height); return buffer;
}
test("native text requires explicit readable source, normalized geometry and valid styles", () => {
  expect(parseNativeTextLayers(JSON.stringify({ canRead: true, coordinateSpace: "normalized_1000", lines: [line] }))).toEqual([line]);
  for (const changes of [{ bbox: [0,0,1200,200] }, { bbox: [200,100,100,300] }, { color: "red;alert(1)" }, { fontSize: 0 }, { rotation: 181 }, { text: "" }]) expect(() => parseNativeTextLayers(JSON.stringify({ canRead: true, coordinateSpace: "normalized_1000", lines: [{ ...line, ...changes }] }))).toThrow();
  expect(() => parseNativeTextLayers('{"canRead":false,"lines":[]}')).toThrow();
  expect(parseNativeTextLayers('{"canRead":true,"coordinateSpace":"normalized_1000","lines":[]}')).toEqual([]);
});
test("raster text cannot substitute native layers and malformed bundles cannot enter Photopea", () => {
  const bundle: PsdLayerBundle = { version: 1, width: 32, height: 40, rasters: [{ name: "背景", buffer: png(32,40) }], texts: [line as any] };
  expect(() => validatePsdLayerBundle(bundle)).not.toThrow();
  expect(() => validatePsdLayerBundle({ ...bundle, texts: [] })).toThrow("至少");
  expect(() => validatePsdLayerBundle({ ...bundle, rasters: [{ name: "拉伸图", buffer: png(40,32) }] })).toThrow("同画布");
  expect(() => validatePsdLayerBundle({ ...bundle, rasters: [{ name: "假 PNG", buffer: new ArrayBuffer(33) }] })).toThrow("PNG");
  expect(() => validatePsdLayerBundle({ ...bundle, width: 10000, height: 10000 })).toThrow();
});
