import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { users } from "@/src/lib/db/schema";
import {
  exchangeCodeForToken,
  getGitHubUser,
} from "@/src/modules/github/oauth";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing code or state parameter" },
      { status: 400 },
    );
  }

  // Verify CSRF state
  const session = await getSession();
  if (session.oauthState !== state) {
    return NextResponse.json(
      { error: "Invalid state parameter" },
      { status: 403 },
    );
  }
  // Clear the stored state
  session.oauthState = undefined;

  try {
    // Exchange code for access token
    const accessToken = await exchangeCodeForToken(code);

    // Get GitHub user info
    const githubUser = await getGitHubUser(accessToken);

    // Upsert user in database
    const [user] = await db
      .insert(users)
      .values({
        githubId: githubUser.id,
        githubLogin: githubUser.login,
        githubAccessToken: accessToken,
        avatarUrl: githubUser.avatar_url,
      })
      .onConflictDoUpdate({
        target: users.githubId,
        set: {
          githubLogin: githubUser.login,
          githubAccessToken: accessToken,
          avatarUrl: githubUser.avatar_url,
          updatedAt: new Date(),
        },
      })
      .returning({ id: users.id });

    // Save session data
    session.userId = user.id;
    session.githubLogin = githubUser.login;
    session.avatarUrl = githubUser.avatar_url;
    session.githubAccessToken = accessToken;
    await session.save();

    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch (error) {
    console.error("GitHub OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/auth/login?error=oauth_failed", request.url),
    );
  }
}
