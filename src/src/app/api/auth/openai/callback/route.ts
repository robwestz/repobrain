/**
 * GET /api/auth/openai/callback — OpenAI OAuth callback.
 *
 * Verifies the state parameter, exchanges the authorization code for
 * tokens using the PKCE code_verifier from the session, stores tokens
 * in the session cookie, and redirects to the dashboard.
 *
 * Reference: server.py lines 169-208
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { exchangeOpenAICode } from "@/src/modules/openai/oauth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  const { searchParams } = req.nextUrl;
  const error = searchParams.get("error");
  if (error) {
    return NextResponse.redirect(
      new URL(`/dashboard?openai_error=${encodeURIComponent(error)}`, req.url),
    );
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state || state !== session.openaiOauthState) {
    return NextResponse.redirect(
      new URL("/dashboard?openai_error=invalid_state", req.url),
    );
  }

  const codeVerifier = session.openaiCodeVerifier;
  if (!codeVerifier) {
    return NextResponse.redirect(
      new URL("/dashboard?openai_error=missing_verifier", req.url),
    );
  }

  try {
    const tokens = await exchangeOpenAICode(code, codeVerifier);

    // Store tokens in the session — server-side only, never exposed to client
    session.openaiAccessToken = tokens.accessToken;
    session.openaiRefreshToken = tokens.refreshToken;
    session.openaiExpiresAt = tokens.expiresAt;

    // Clean up one-time PKCE fields
    session.openaiOauthState = undefined;
    session.openaiCodeVerifier = undefined;
    await session.save();

    return NextResponse.redirect(
      new URL("/dashboard?openai_connected=1", req.url),
    );
  } catch {
    return NextResponse.redirect(
      new URL("/dashboard?openai_error=token_exchange_failed", req.url),
    );
  }
}
