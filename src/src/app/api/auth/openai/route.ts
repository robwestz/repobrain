/**
 * GET /api/auth/openai — Initiate OpenAI OAuth PKCE flow.
 *
 * Generates a PKCE pair and random state, stores both in iron-session,
 * then redirects the user to OpenAI's authorization endpoint.
 *
 * Requires an active repobrain session (GitHub login).
 *
 * Reference: server.py lines 145-166
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSession } from "@/src/lib/auth";
import {
  generatePKCE,
  getOpenAIAuthorizationUrl,
} from "@/src/modules/openai/oauth";

export async function GET() {
  if (!process.env.OPENAI_CLIENT_ID) {
    return NextResponse.json(
      { error: "OpenAI OAuth is not configured — set OPENAI_CLIENT_ID" },
      { status: 404 },
    );
  }

  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized — log in with GitHub first" }, { status: 401 });
  }

  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = crypto.randomBytes(16).toString("base64url");

  // Persist PKCE verifier + state in the encrypted session cookie
  session.openaiCodeVerifier = codeVerifier;
  session.openaiOauthState = state;
  await session.save();

  const url = getOpenAIAuthorizationUrl(state, codeChallenge);
  return NextResponse.redirect(url);
}
