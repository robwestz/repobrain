import { NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { getAuthorizationUrl } from "@/src/modules/github/oauth";

export async function GET() {
  const session = await getSession();

  // Generate a random state string for CSRF protection
  const state = crypto.randomUUID();
  session.oauthState = state;
  await session.save();

  const authUrl = getAuthorizationUrl(state);
  return NextResponse.redirect(authUrl);
}
