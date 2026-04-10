import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workspaces, repoConnections, files, chunks } from "@/src/lib/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { listBookmarks, createBookmark } from "@/src/modules/bookmarks/service";

// ---------------------------------------------------------------------------
// Helper: verify workspace + repo ownership, returns repoConnection or null
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
// GET /api/workspaces/[workspaceId]/repos/[repoId]/bookmarks
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; repoId: string }> },
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, repoId } = await params;

  const repo = await resolveRepo(session.userId, workspaceId, repoId);
  if (!repo) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  try {
    const bookmarkList = await listBookmarks(session.userId, repoId);
    return NextResponse.json({ bookmarks: bookmarkList });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch bookmarks" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/workspaces/[workspaceId]/repos/[repoId]/bookmarks
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

  const repo = await resolveRepo(session.userId, workspaceId, repoId);
  if (!repo) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  let body: {
    fileId: string;
    filePath: string;
    startLine: number;
    endLine: number;
    title?: string;
    note?: string;
    color?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { fileId, filePath, startLine, endLine, title, note, color } = body;

  if (!fileId || !filePath || startLine == null || endLine == null) {
    return NextResponse.json(
      { error: "fileId, filePath, startLine, and endLine are required" },
      { status: 400 },
    );
  }

  // Verify the file belongs to this repo
  const file = await db.query.files.findFirst({
    where: and(eq(files.id, fileId), eq(files.repoConnectionId, repoId)),
  });
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // Fetch code content for AI context generation from indexed chunks
  // We look for chunks that overlap with the bookmarked line range
  let codeContent: string | null = null;
  try {
    const overlappingChunks = await db.query.chunks.findMany({
      where: and(
        eq(chunks.fileId, fileId),
        lte(chunks.startLine, endLine),
        gte(chunks.endLine, startLine),
      ),
    });

    if (overlappingChunks.length > 0) {
      // Sort chunks by start line and join their content
      overlappingChunks.sort((a, b) => a.startLine - b.startLine);
      // Use the content from the first overlapping chunk as representative
      codeContent = overlappingChunks.map((c) => c.content).join("\n");
    }
  } catch {
    // Content fetch failed — AI context will be skipped
  }

  try {
    const bookmark = await createBookmark({
      userId: session.userId,
      repoConnectionId: repoId,
      fileId,
      filePath,
      startLine,
      endLine,
      title: title ?? null,
      note: note ?? null,
      color: color ?? "blue",
      codeContent,
    });

    return NextResponse.json({ bookmark }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create bookmark" },
      { status: 500 },
    );
  }
}
