import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workspaces, repoConnections } from "@/src/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { editBookmark, removeBookmark, getBookmark } from "@/src/modules/bookmarks/service";

// ---------------------------------------------------------------------------
// Helper: verify workspace + repo ownership
// ---------------------------------------------------------------------------

async function resolveRepo(
  userId: string,
  workspaceId: string,
  repoId: string,
) {
  const workspace = await db.query.workspaces.findFirst({
    where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)),
  });
  if (!workspace) return null;

  const repo = await db.query.repoConnections.findFirst({
    where: and(
      eq(repoConnections.id, repoId),
      eq(repoConnections.workspaceId, workspaceId),
    ),
  });
  return repo ?? null;
}

// ---------------------------------------------------------------------------
// DELETE /api/workspaces/[workspaceId]/repos/[repoId]/bookmarks/[bookmarkId]
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      workspaceId: string;
      repoId: string;
      bookmarkId: string;
    }>;
  },
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, repoId, bookmarkId } = await params;

  const repo = await resolveRepo(session.userId, workspaceId, repoId);
  if (!repo) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  try {
    const deleted = await removeBookmark(bookmarkId, session.userId);
    if (!deleted) {
      return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete bookmark" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/workspaces/[workspaceId]/repos/[repoId]/bookmarks/[bookmarkId]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      workspaceId: string;
      repoId: string;
      bookmarkId: string;
    }>;
  },
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, repoId, bookmarkId } = await params;

  const repo = await resolveRepo(session.userId, workspaceId, repoId);
  if (!repo) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  let body: { title?: string; note?: string | null; color?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Verify the bookmark exists and belongs to the user
  const existing = await getBookmark(bookmarkId, session.userId);
  if (!existing) {
    return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
  }

  try {
    const updated = await editBookmark(bookmarkId, session.userId, {
      title: body.title,
      note: body.note,
      color: body.color,
    });

    if (!updated) {
      return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
    }

    return NextResponse.json({ bookmark: updated });
  } catch {
    return NextResponse.json(
      { error: "Failed to update bookmark" },
      { status: 500 },
    );
  }
}
