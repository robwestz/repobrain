import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  userId?: string;
  githubLogin?: string;
  githubAccessToken?: string;
  avatarUrl?: string;
  oauthState?: string;
}

const sessionOptions: SessionOptions = {
  password:
    process.env.SESSION_SECRET ||
    "this-is-a-secret-that-must-be-at-least-32-chars",
  cookieName: "repobrain_session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function requireSession() {
  const session = await getSession();
  if (!session.userId) {
    throw new Error("Unauthorized");
  }
  return session;
}
