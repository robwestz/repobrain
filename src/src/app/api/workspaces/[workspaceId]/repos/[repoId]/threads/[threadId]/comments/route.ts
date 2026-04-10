import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workspaces, repoConnections, users } from "@/src/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getThread } from "@/src/modules/threads/service";
import { insertComment } from "@/src/modules/threads/queries";
import { codeThreads } from "@/src/lib/db/schema";

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
// POST /api/workspaces/[workspaceId]/repos/[repoId]/threads/[threadId]/comments
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: {
    params: Promise<{
      workspaceId: string;
      repoId: string;
      threadId: string;
    }>;
  },
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
    const { content } = body;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const comment = await insertComment({
      threadId,
      userId: session.userId,
      content: content.trim(),
    });

    // Bump thread updatedAt
    await db
      .update(codeThreads)
      .set({ updatedAt: new Date() })
      .where(eq(codeThreads.id, threadId));

    // Fetch user info to return enriched comment
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });

    return NextResponse.json(
      {
        comment: {
          ...comment,
          user: {
            login: user?.githubLogin ?? "",
            avatarUrl: user?.avatarUrl ?? null,
          },
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
