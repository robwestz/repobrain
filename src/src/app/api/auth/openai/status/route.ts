/**
 * GET /api/auth/openai/status — Return OpenAI OAuth connection status.
 *
 * Returns 404 when OPENAI_CLIENT_ID is not configured (feature disabled),
 * so the UI component hides itself.
 *
 * Response:
 *   { status: "connected" | "expired" | "not_connected"; expiresAt?: number }
 */

import { NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";

export async function GET() {
  // Feature gate: hide the OpenAI OAuth UI when not configured
  if (!process.env.OPENAI_CLIENT_ID) {
    return NextResponse.json(
      { error: "OpenAI OAuth is not configured" },
      { status: 404 },
    );
  }

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
