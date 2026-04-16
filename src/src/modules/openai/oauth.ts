/**
 * OpenAI OAuth PKCE helpers.
 *
 * Ported from server.py (lines 23–234) — only the OAuth flow, not
 * forge/exporters/codex logic.
 *
 * Tokens are stored server-side in iron-session (encrypted cookie),
 * which is more secure than the original URL-fragment approach.
 */

import crypto from "crypto";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPENAI_AUTH_URL = "https://auth.openai.com/oauth/authorize";
const OPENAI_TOKEN_URL = "https://auth.openai.com/oauth/token";
const OPENAI_SCOPES = "openid profile email offline_access";

function getClientId(): string {
  const id = process.env.OPENAI_CLIENT_ID;
  if (!id) throw new Error("OPENAI_CLIENT_ID environment variable is not set");
  return id;
}

function getRedirectUri(): string {
  return (
    process.env.OPENAI_REDIRECT_URI ??
    "http://localhost:3000/api/auth/openai/callback"
  );
}

// ---------------------------------------------------------------------------
// PKCE helpers  (equivalent to server.py lines 131-135)
// ---------------------------------------------------------------------------

export function generatePKCE(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

// ---------------------------------------------------------------------------
// Build authorization URL  (equivalent to server.py lines 145-166)
// ---------------------------------------------------------------------------

export function getOpenAIAuthorizationUrl(
  state: string,
  codeChallenge: string,
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    scope: OPENAI_SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });
  return `${OPENAI_AUTH_URL}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

export interface OpenAITokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in ms
}

// ---------------------------------------------------------------------------
// Exchange authorization code for tokens  (server.py lines 169-208)
// ---------------------------------------------------------------------------

export async function exchangeOpenAICode(
  code: string,
  codeVerifier: string,
): Promise<OpenAITokens> {
  const res = await fetch(OPENAI_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(),
      client_id: getClientId(),
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI token exchange failed (${res.status}): ${text}`);
  }

  const tokens = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  return {
    accessToken: tokens.access_token ?? "",
    refreshToken: tokens.refresh_token ?? "",
    expiresAt: Math.floor((Date.now() + (tokens.expires_in ?? 3600) * 1000)),
  };
}

// ---------------------------------------------------------------------------
// Refresh an expired token  (server.py lines 214-234)
// ---------------------------------------------------------------------------

export async function refreshOpenAIToken(
  refreshToken: string,
): Promise<OpenAITokens> {
  const res = await fetch(OPENAI_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: getClientId(),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI token refresh failed (${res.status}): ${text}`);
  }

  const tokens = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  return {
    accessToken: tokens.access_token ?? "",
    refreshToken: tokens.refresh_token ?? refreshToken,
    expiresAt: Math.floor((Date.now() + (tokens.expires_in ?? 3600) * 1000)),
  };
}
