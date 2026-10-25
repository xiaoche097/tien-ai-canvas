export function motuApiUrl(relativePath: string) {
  const prefix = process.env.NEXT_PUBLIC_CANVAS_INTEGRATION === "1" ? "/motu" : "";
  return `${prefix}/api/${relativePath}`;
}

export function motuFileUrl(relativePath: string) {
  return motuApiUrl(`files/${relativePath}`);
}
