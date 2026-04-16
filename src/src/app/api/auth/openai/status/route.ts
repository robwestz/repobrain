/**
 * GET /api/auth/openai/status — Return OpenAI OAuth connection status.
 *
 * Response:
 *   { status: "connected" | "expired" | "not_connected"; expiresAt?: number }
 */

import { NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.openaiAccessToken) {
    return NextResponse.json({ status: "not_connected" });
  }

  if (session.openaiExpiresAt && session.openaiExpiresAt < Date.now()) {
    return NextResponse.json({
      status: "expired",
      expiresAt: session.openaiExpiresAt,
    });
  }

  return NextResponse.json({
    status: "connected",
    expiresAt: session.openaiExpiresAt,
  });
}
