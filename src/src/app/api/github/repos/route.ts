/**
 * GET /api/github/repos
 * Returns the authenticated user's GitHub repositories.
 * Used by the repo picker dialog.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { listUserRepos } from "@/src/modules/github/repos";
import { logger } from "@/src/lib/logger";

export async function GET() {
  const session = await getSession();
  if (!session.userId || !session.githubAccessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const repos = await listUserRepos(session.githubAccessToken);
    return NextResponse.json(repos);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch repositories";
    logger.error({ err }, "api/github/repos: failed to fetch repositories");
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
