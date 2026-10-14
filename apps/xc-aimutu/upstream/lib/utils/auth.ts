import { NextRequest } from "next/server";

export function getAccessKeyFromHeader(request: NextRequest): string | undefined {
  if (process.env.CANVAS_INTEGRATION === "1") {
    return request.headers.get("x-canvas-user-id") ?? undefined;
  }
  return request.headers.get("x-access-key") ?? undefined;
}

export function getAccessKeyFromRequest(request: NextRequest): string | undefined {
  if (process.env.CANVAS_INTEGRATION === "1") {
    return request.headers.get("x-canvas-user-id") ?? undefined;
  }
  const fromHeader = request.headers.get("x-access-key");
  if (fromHeader) return fromHeader;

  const fromQuery = request.nextUrl.searchParams.get("key");
  if (fromQuery) return fromQuery;

  return undefined;
}
