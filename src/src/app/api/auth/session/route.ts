import { NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";

export async function GET() {
  const session = await getSession();

  if (session.userId) {
    return NextResponse.json({
      user: {
        id: session.userId,
        githubLogin: session.githubLogin,
        avatarUrl: session.avatarUrl,
      },
    });
  }

  return NextResponse.json({ user: null });
}
