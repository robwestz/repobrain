import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workspaces, repoConnections } from "@/src/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  getThread,
  resolveThread,
  reopenThread,
  deleteThread,
} from "@/src/modules/threads/service";

// ---------------------------------------------------------------------------
// Helper — verify workspace + repo ownership
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
// GET /api/workspaces/[workspaceId]/repos/[repoId]/threads/[threadId]
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; repoId: string; threadId: string }> },
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, repoId, threadId } = await params;

  try {
    const repo = await resolveRepo(workspaceId, repoId, session.userId);
    if (!repo) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    const thread = await getThread(threadId);
    if (!thread || thread.repoConnectionId !== repo.id) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    return NextResponse.json({ thread });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/workspaces/[workspaceId]/repos/[repoId]/threads/[threadId]
// Body: { status: "open" | "resolved" }
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; repoId: string; threadId: string }> },
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, repoId, threadId } = await params;

  try {
    const repo = await resolveRepo(workspaceId, repoId, session.userId);
    if (!repo) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    const existingThread = await getThread(threadId);
    if (!existingThread || existingThread.repoConnectionId !== repo.id) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const body = await req.json();
    const { status } = body;

    if (status !== "open" && status !== "resolved") {
      return NextResponse.json(
        { error: "status must be 'open' or 'resolved'" },
        { status: 400 },
      );
    }

    const thread =
      status === "resolved"
        ? await resolveThread(threadId, session.userId)
        : await reopenThread(threadId, session.userId);

    return NextResponse.json({ thread });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/workspaces/[workspaceId]/repos/[repoId]/threads/[threadId]
// ---------------------------------------------------------------------------

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; repoId: string; threadId: string }> },
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, repoId, threadId } = await params;

  try {
    const repo = await resolveRepo(workspaceId, repoId, session.userId);
    if (!repo) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    const existingThread = await getThread(threadId);
    if (!existingThread || existingThread.repoConnectionId !== repo.id) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    await deleteThread(threadId, session.userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("Only the thread creator") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
