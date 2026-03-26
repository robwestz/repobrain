/**
 * GET  /api/conversations?workspaceId=<id>  — list conversations for a workspace
 * POST /api/conversations                    — create a new conversation
 *
 * POST body:
 *   { workspaceId: string; repoConnectionId: string; title?: string }
 *
 * The repo must have status "ready" before a conversation can be created.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { createConversation, listConversations } from "@/src/modules/chat/service";
import {
  findWorkspaceByIdAndUser,
  findRepoConnectionById,
} from "@/src/modules/workspace/queries";

// ---------------------------------------------------------------------------
// GET — list conversations for a workspace
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId query param is required" }, { status: 400 });
  }

  const workspace = await findWorkspaceByIdAndUser(workspaceId, session.userId);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const convs = await listConversations(workspaceId);
  return NextResponse.json({ conversations: convs });
}

// ---------------------------------------------------------------------------
// POST — create a new conversation
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { workspaceId?: unknown; repoConnectionId?: unknown; title?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.workspaceId || typeof body.workspaceId !== "string") {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }
  if (!body.repoConnectionId || typeof body.repoConnectionId !== "string") {
    return NextResponse.json({ error: "repoConnectionId is required" }, { status: 400 });
  }

  const workspace = await findWorkspaceByIdAndUser(body.workspaceId, session.userId);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const repo = await findRepoConnectionById(body.repoConnectionId);
  if (!repo || repo.workspaceId !== body.workspaceId) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  if (repo.status !== "ready") {
    return NextResponse.json(
      { error: "Repository is not ready — wait for indexing to complete before starting a chat" },
      { status: 422 },
    );
  }

  const title = typeof body.title === "string" ? body.title : null;
  const conv = await createConversation(body.workspaceId, body.repoConnectionId, title);

  return NextResponse.json(conv, { status: 201 });
}
