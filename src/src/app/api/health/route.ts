/**
 * GET /api/health
 *
 * Public health check endpoint — no auth required.
 * Returns basic process uptime and application version.
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    uptime: process.uptime(),
    version: process.env.npm_package_version ?? "0.1.0",
  });
}
