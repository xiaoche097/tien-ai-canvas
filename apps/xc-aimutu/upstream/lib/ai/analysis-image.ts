import sharp from "sharp";

export async function prepareAnalysisImage(buffer: Buffer, mimeType: string | null) {
  if (buffer.length <= 1.5 * 1024 * 1024) {
    await sharp(buffer).metadata();
    return `data:${mimeType || "image/png"};base64,${buffer.toString("base64")}`;
  }
  const compressed = await sharp(buffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 82 })
    .toBuffer();
  return `data:image/jpeg;base64,${compressed.toString("base64")}`;
}
