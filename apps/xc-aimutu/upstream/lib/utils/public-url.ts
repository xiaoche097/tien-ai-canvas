export function motuFileUrl(relativePath: string) {
  const prefix = process.env.NEXT_PUBLIC_CANVAS_INTEGRATION === "1" ? "/motu" : "";
  return `${prefix}/api/files/${relativePath}`;
}
