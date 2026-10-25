export type PreviewDevice = "desktop" | "mobile";
export type PreviewZoom = "fit" | 50 | 75 | 100;

export function resolvePreviewDevice(platform: string, saved?: { platform: string; device: PreviewDevice }): PreviewDevice {
  return saved?.platform === platform ? saved.device : platform === "amazon" ? "desktop" : "mobile";
}

export function previewScale(zoom: PreviewZoom, width: number, height: number, device: PreviewDevice) {
  if (zoom !== "fit") return zoom / 100;
  if (device === "desktop") return Math.max(0.01, (width - 32) / 1000);
  return Math.max(0.01, Math.min(1, (width - 32) / 396, (height - 32) / 780));
}
