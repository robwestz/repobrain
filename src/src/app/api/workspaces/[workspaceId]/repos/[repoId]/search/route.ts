import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workspaces, repoConnections } from "@/src/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { search } from "@/src/modules/search/search-service";

// ---------------------------------------------------------------------------
// POST /api/workspaces/[workspaceId]/repos/[repoId]/search
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; repoId: string }> },
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, repoId } = await params;

  // Verify the workspace belongs to the current user
  const workspace = await db.query.workspaces.findFirst({
    where: and(
      eq(workspaces.id, workspaceId),
      eq(workspaces.userId, session.userId),
    ),
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Verify the repo connection belongs to this workspace
  const repoConnection = await db.query.repoConnections.findFirst({
    where: and(
      eq(repoConnections.id, repoId),
      eq(repoConnections.workspaceId, workspaceId),
    ),
  });

  if (!repoConnection) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  if (repoConnection.status !== "ready") {
    return NextResponse.json(
      { error: "Repository is not fully indexed yet" },
      { status: 409 },
    );
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }

  const {
    query,
    limit,
    offset,
    fileFilter,
    languageFilter,
  } = body as Record<string, unknown>;

  if (typeof query !== "string" || query.trim().length === 0) {
    return NextResponse.json({ error: "query is required and must be a non-empty string" }, { status: 400 });
  }

  if (query.trim().length > 500) {
    return NextResponse.json({ error: "query must be 500 characters or fewer" }, { status: 400 });
  }

  const parsedLimit = typeof limit === "number" ? Math.min(Math.max(1, limit), 100) : 30;
  const parsedOffset = typeof offset === "number" ? Math.max(0, offset) : 0;
  const parsedFileFilter = typeof fileFilter === "string" && fileFilter.trim().length > 0
    ? fileFilter.trim()
    : undefined;
  const parsedLanguageFilter = typeof languageFilter === "string" && languageFilter.trim().length > 0
    ? languageFilter.trim()
    : undefined;

  try {
    const result = await search(query.trim(), repoConnection.id, {
      limit: parsedLimit,
      offset: parsedOffset,
      fileFilter: parsedFileFilter,
      languageFilter: parsedLanguageFilter,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
