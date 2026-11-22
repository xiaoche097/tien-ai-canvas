export type NativeTextLayer = { text: string; bbox: [number, number, number, number]; fontSize: number; color: string; bold: boolean; align: "left" | "center" | "right"; rotation: number };
export type PsdLayerBundle = { version: 1; width: number; height: number; rasters: Array<{ name: string; buffer: ArrayBuffer }>; texts: NativeTextLayer[] };
export type PsdLayerSource = { projectId: string; sectionId: string; sessionId: string; versionId: string | null };

export function parsePsdLayerSource(value: unknown): PsdLayerSource {
  const item = value as PsdLayerSource | null;
  if (!item || ![item.projectId, item.sectionId, item.sessionId].every((id) => typeof id === "string" && !!id.trim() && id.length <= 160) || !(item.versionId === null || (typeof item.versionId === "string" && !!item.versionId.trim() && item.versionId.length <= 160))) throw new Error("分层来源记录不完整，请重新进入精修");
  return { projectId: item.projectId, sectionId: item.sectionId, sessionId: item.sessionId, versionId: item.versionId };
}

export function psdLayerSourceMatches(value: unknown, expected: PsdLayerSource) {
  try {
    const source = parsePsdLayerSource(value), target = parsePsdLayerSource(expected);
    return source.projectId === target.projectId && source.sectionId === target.sectionId && source.sessionId === target.sessionId && source.versionId === target.versionId;
  } catch { return false; }
}

export function isPsdLayerEvent(event: Pick<MessageEvent, "origin" | "source" | "data">, expected: { origin: string; source: MessageEventSource | null; nonce: string }) {
  return !!expected.source && !!expected.nonce && event.origin === expected.origin && event.source === expected.source && event.data !== null && typeof event.data === "object" && event.data.nonce === expected.nonce;
}

export function parseNativeTextLayers(raw: string): NativeTextLayer[] {
  if (raw.length > 64_000) throw new Error("文字识别结果过长");
  const value = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  if (value?.canRead !== true || value.coordinateSpace !== "normalized_1000") throw new Error("模型未确认读取原图文字，请更换可看图模型");
  return validateNativeTextLayers(value.lines);
}

export function validateNativeTextLayers(value: unknown): NativeTextLayer[] {
  if (!Array.isArray(value) || value.length > 80) throw new Error("原生文字图层数量无效");
  let length = 0;
  return value.map((line) => {
    if (!line || typeof line.text !== "string" || !line.text.trim() || (length += line.text.length) > 16_000) throw new Error("文字图层内容无效或过长");
    const box = line.bbox;
    if (!Array.isArray(box) || box.length !== 4 || box.some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1000) || box[2] <= box[0] || box[3] <= box[1]) throw new Error("文字图层坐标无效");
    if (!Number.isFinite(line.fontSize) || line.fontSize < 1 || line.fontSize > 300 || !/^#[0-9a-f]{6}$/i.test(line.color) || typeof line.bold !== "boolean" || !["left", "center", "right"].includes(line.align) || !Number.isFinite(line.rotation) || Math.abs(line.rotation) > 180) throw new Error("文字图层样式无效");
    return { text: line.text, bbox: [...box] as NativeTextLayer["bbox"], fontSize: line.fontSize, color: line.color, bold: line.bold, align: line.align, rotation: line.rotation };
  });
}

export function validatePsdLayerBundle(value: PsdLayerBundle) {
  if (value?.version !== 1 || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) || value.width < 1 || value.height < 1 || value.width * value.height > 16_777_216 || !Array.isArray(value.rasters) || value.rasters.length < 1 || value.rasters.length > 8 || value.width * value.height * value.rasters.length > 67_108_864) throw new Error("分层画布或图层数量无效");
  let bytes = 0;
  for (const layer of value.rasters) {
    if (typeof layer.name !== "string" || !layer.name.trim() || layer.name.length > 100 || !(layer.buffer instanceof ArrayBuffer) || layer.buffer.byteLength < 33 || (bytes += layer.buffer.byteLength) > 50 * 1024 * 1024) throw new Error("分层图片缺失或超过 50 MB");
    const header = new Uint8Array(layer.buffer), data = new DataView(layer.buffer);
    if (![137,80,78,71,13,10,26,10].every((n, i) => header[i] === n) || data.getUint32(12) !== 0x49484452 || data.getUint32(16) !== value.width || data.getUint32(20) !== value.height) throw new Error("分层图片必须为同画布尺寸的 PNG");
  }
  validateNativeTextLayers(value.texts);
  if (value.rasters.length + value.texts.length < 2) throw new Error("至少需要两个独立图层，单张底图不能作为分层结果");
}
