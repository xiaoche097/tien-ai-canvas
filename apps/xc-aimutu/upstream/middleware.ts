import { NextRequest, NextResponse } from "next/server";

const backendURL = process.env.CANVAS_BACKEND_INTERNAL_URL;

export async function middleware(request: NextRequest) {
  if (process.env.CANVAS_INTEGRATION !== "1") return NextResponse.next();
  const pathname = request.nextUrl.pathname.replace(/^\/motu(?=\/|$)/, "") || "/";
  if (pathname === "/api/health") return NextResponse.next();

  if (/^\/api\/(auth|keys|admin|providers)(\/|$)/.test(pathname)) {
    return new NextResponse(null, { status: 404 });
  }
  if (/^\/api\/video(\/|$)/.test(pathname) && !/^\/api\/video\/(storyboard|adapt|analyze|scene-image|synthesize|download|history|bgm)$/.test(pathname) && !/^\/api\/video\/tasks\/[^/]+$/.test(pathname)) {
    return new NextResponse(null, { status: 503 });
  }

  if (!backendURL) return new NextResponse(null, { status: 503 });
  const cookie = request.headers.get("cookie") ?? "";
  let userId = "";
  try {
    const response = await fetch(new URL("/api/auth/session", backendURL), {
      headers: { cookie },
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) return new NextResponse(null, { status: 503 });
    const envelope = await response.json();
    userId = envelope?.code === 0 && typeof envelope?.data?.user?.id === "string" ? envelope.data.user.id : "";
  } catch {
    return new NextResponse(null, { status: 503 });
  }

  if (!userId) {
    if (pathname.startsWith("/api/")) return new NextResponse(null, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (pathname === "/login") {
    return NextResponse.redirect(new URL("/motu", request.url));
  }
  if (pathname === "/settings/keys") {
    return NextResponse.redirect(new URL("/settings", request.url));
  }

  const headers = new Headers(request.headers);
  headers.set("x-canvas-user-id", userId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
