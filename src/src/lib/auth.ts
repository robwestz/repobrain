import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  userId?: string;
  githubLogin?: string;
  githubAccessToken?: string;
  avatarUrl?: string;
  oauthState?: string;
  // OpenAI OAuth
  openaiAccessToken?: string;
  openaiRefreshToken?: string;
  openaiExpiresAt?: number; // Unix timestamp in ms
  openaiOauthState?: string; // CSRF state for OpenAI OAuth
  openaiCodeVerifier?: string; // PKCE code_verifier stored during auth flow
}

function getSessionOptions(): SessionOptions {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error(
      "SESSION_SECRET environment variable must be set and at least 32 characters long. " +
        "Generate one with: openssl rand -hex 32",
    );
  }
  return {
    password: sessionSecret,
    cookieName: "repobrain_session",
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  };
}

export async function getSession() {
  const cookieStore = await cookies();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getIronSession<SessionData>(cookieStore as any, getSessionOptions());
}

export async function requireSession() {
  const session = await getSession();
  if (!session.userId) {
    throw new Error("Unauthorized");
  }
  return session;
}
