/**
 * GET /api/workspaces/[workspaceId]/repos/[repoId]/index-status
 *
 * Returns the current indexing status for a repository.
 * Used by the IndexProgress component to poll for progress.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workspaces, repoConnections, indexJobs } from "@/src/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; repoId: string }> },
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, repoId } = await params;

  const workspace = await db.query.workspaces.findFirst({
    where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, session.userId)),
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const repo = await db.query.repoConnections.findFirst({
    where: and(
      eq(repoConnections.id, repoId),
      eq(repoConnections.workspaceId, workspaceId),
    ),
  });

  if (!repo) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  // Get latest index job
  const job = await db.query.indexJobs.findFirst({
    where: eq(indexJobs.repoConnectionId, repoId),
    orderBy: [desc(indexJobs.createdAt)],
  });

  return NextResponse.json({
    repoStatus: repo.status,
    errorMessage: repo.errorMessage ?? null,
    job: job
      ? {
          id: job.id,
          status: job.status,
          progress: (job.progress as Record<string, unknown>) ?? {},
          startedAt: job.startedAt?.toISOString() ?? null,
          completedAt: job.completedAt?.toISOString() ?? null,
        }
      : null,
  });
}
