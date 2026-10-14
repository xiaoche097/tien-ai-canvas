import { headers } from "next/headers";

function backendURL(path: string) {
  const base = process.env.CANVAS_BACKEND_INTERNAL_URL;
  if (!base) throw new Error("境彻服务地址未配置");
  return new URL(path, base);
}

export async function canvasRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(backendURL(path), {
    ...init,
    headers: { ...Object.fromEntries(new Headers(init.headers)), Cookie: headers().get("cookie") ?? "" },
    cache: "no-store",
  });
  const envelope = await response.json();
  if (!response.ok || envelope?.code !== 0) {
    if (response.status === 404) throw new Error("not found");
    throw new Error(envelope?.msg || `境彻请求失败 (${response.status})`);
  }
  return envelope.data as T;
}

export async function canvasFile(path: string): Promise<Buffer> {
  const response = await fetch(backendURL(path), {
    headers: { Cookie: headers().get("cookie") ?? "" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`境彻资源读取失败 (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}
