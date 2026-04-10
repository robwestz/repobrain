/**
 * GET /api/workspaces/[workspaceId]/repos/[repoId]/timeline
 *
 * Returns an AI-summarized semantic git timeline for the given repository.
 *
 * Query params:
 *   limit  — number of commits to return (default 50, max 200)
 *   since  — ISO date string to filter commits after this date
 *   file   — repo-relative file path to filter to a specific file
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workspaces, repoConnections } from "@/src/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getTimeline } from "@/src/modules/git-timeline/service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; repoId: string }> },
) {
  // Auth check
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, repoId } = await params;

  // Verify workspace belongs to this user
  const workspace = await db.query.workspaces.findFirst({
    where: and(
      eq(workspaces.id, workspaceId),
      eq(workspaces.userId, session.userId),
    ),
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Verify repo connection belongs to this workspace
  const repoConn = await db.query.repoConnections.findFirst({
    where: and(
      eq(repoConnections.id, repoId),
      eq(repoConnections.workspaceId, workspaceId),
    ),
  });

  if (!repoConn) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  // Parse query params
  const searchParams = req.nextUrl.searchParams;

  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200) : 50;

  const since = searchParams.get("since") ?? undefined;
  const filePath = searchParams.get("file") ?? undefined;

  try {
    const result = await getTimeline(repoId, { limit, since, filePath });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build timeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
