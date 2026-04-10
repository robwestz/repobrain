import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workspaces, repoConnections } from "@/src/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  getThreadsForFile,
  getThreadsForRepo,
  createThread,
} from "@/src/modules/threads/service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveRepo(
  workspaceId: string,
  repoId: string,
  userId: string,
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
// GET /api/workspaces/[workspaceId]/repos/[repoId]/threads
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; repoId: string }> },
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, repoId } = await params;

  try {
    const repo = await resolveRepo(workspaceId, repoId, session.userId);
    if (!repo) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const file = url.searchParams.get("file");
    const statusParam = url.searchParams.get("status");
    const status =
      statusParam === "open" || statusParam === "resolved" ? statusParam : undefined;

    const threads = file
      ? await getThreadsForFile(repo.id, file)
      : await getThreadsForRepo(repo.id, status);

    return NextResponse.json({ threads });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/workspaces/[workspaceId]/repos/[repoId]/threads
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; repoId: string }> },
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, repoId } = await params;

  try {
    const repo = await resolveRepo(workspaceId, repoId, session.userId);
    if (!repo) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    const body = await req.json();
    const { filePath, startLine, endLine, title, comment } = body;

    if (!filePath || typeof filePath !== "string") {
      return NextResponse.json({ error: "filePath is required" }, { status: 400 });
    }
    if (typeof startLine !== "number" || typeof endLine !== "number") {
      return NextResponse.json({ error: "startLine and endLine are required numbers" }, { status: 400 });
    }
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!comment || typeof comment !== "string" || comment.trim().length === 0) {
      return NextResponse.json({ error: "comment is required" }, { status: 400 });
    }

    const thread = await createThread({
      repoConnectionId: repo.id,
      filePath,
      startLine,
      endLine,
      title: title.trim(),
      firstComment: comment.trim(),
      userId: session.userId,
    });

    return NextResponse.json({ thread }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
