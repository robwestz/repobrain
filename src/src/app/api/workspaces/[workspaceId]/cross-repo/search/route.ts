import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workspaces, repoConnections } from "@/src/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { searchAcrossRepos } from "@/src/modules/cross-repo/search";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const session = await requireSession();
    const { workspaceId } = await params;

    // Verify user owns the workspace
    const workspace = await db.query.workspaces.findFirst({
      where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, session.userId!)),
    });
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const body = await request.json() as { query?: string; repos?: string[] };
    const { query, repos: repoFilter } = body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    // Get all repos in this workspace
    const allRepos = await db
      .select({ id: repoConnections.id })
      .from(repoConnections)
      .where(eq(repoConnections.workspaceId, workspaceId));

    const allRepoIds = allRepos.map((r) => r.id);

    // Use provided repo filter, falling back to all repos
    const searchRepoIds =
      repoFilter && repoFilter.length > 0
        ? repoFilter.filter((id) => allRepoIds.includes(id))
        : allRepoIds;

    if (searchRepoIds.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const results = await searchAcrossRepos(workspaceId, query.trim(), searchRepoIds, {
      limit: 30,
    });

    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
