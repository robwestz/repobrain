import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { env } from "@/src/lib/env";

export function middleware(request: NextRequest) {
  // Validate all required env vars on the first request — crashes immediately
  // if misconfigured. env() is memoized so this only parses process.env once.
  env();

  const { pathname } = request.nextUrl;

  // Public paths - allow through
  if (
    pathname === "/" ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Protected paths - check for session cookie
  const sessionCookie = request.cookies.get("repobrain_session");
  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
