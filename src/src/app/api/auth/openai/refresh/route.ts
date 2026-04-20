/**
 * POST /api/auth/openai/refresh — Refresh the OpenAI access token.
 *
 * Reads the refresh_token from the session, calls OpenAI's token endpoint
 * with grant_type=refresh_token, and updates the session with new tokens.
 *
 * Reference: server.py lines 214-234
 */

import { NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { refreshOpenAIToken } from "@/src/modules/openai/oauth";

export async function POST() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const refreshToken = session.openaiRefreshToken;
  if (!refreshToken) {
    return NextResponse.json(
      { error: "No OpenAI refresh token in session — connect OpenAI first" },
      { status: 400 },
    );
  }

  try {
    const tokens = await refreshOpenAIToken(refreshToken);

    session.openaiAccessToken = tokens.accessToken;
    session.openaiRefreshToken = tokens.refreshToken;
    session.openaiExpiresAt = tokens.expiresAt;
    await session.save();

    return NextResponse.json({ expiresAt: tokens.expiresAt });
  } catch {
    return NextResponse.json(
      { error: "Token refresh failed" },
      { status: 401 },
    );
  }
}
