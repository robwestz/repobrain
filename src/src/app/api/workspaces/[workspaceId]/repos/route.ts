/**
 * GET  /api/workspaces/:workspaceId/repos  — list repo connections for workspace
 * POST /api/workspaces/:workspaceId/repos  — connect a new repo to workspace
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { connectRepo } from "@/src/modules/workspace/service";
import { findRepoConnectionByWorkspace, findWorkspaceByIdAndUser } from "@/src/modules/workspace/queries";
import type { GitHubRepo } from "@/src/modules/github/repos";

type RouteContext = { params: Promise<{ workspaceId: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId } = await params;

  // Verify ownership
  const workspace = await findWorkspaceByIdAndUser(workspaceId, session.userId);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const repoConnection = await findRepoConnectionByWorkspace(workspaceId);
  return NextResponse.json(repoConnection ?? null);
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const session = await getSession();
  if (!session.userId || !session.githubAccessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId } = await params;

  let body: { repo?: GitHubRepo };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.repo) {
    return NextResponse.json({ error: "repo is required" }, { status: 400 });
  }

  const repo = body.repo;
  if (
    typeof repo.id !== "number" ||
    typeof repo.name !== "string" ||
    typeof repo.owner?.login !== "string" ||
    typeof repo.default_branch !== "string"
  ) {
    return NextResponse.json({ error: "Invalid repo object" }, { status: 400 });
  }

  try {
    const repoConnection = await connectRepo(
      workspaceId,
      session.userId,
      repo,
      session.githubAccessToken,
    );
    return NextResponse.json(repoConnection, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to connect repository";
    const isUserError =
      message.includes("already has a connected") ||
      message.includes("Workspace not found");

    return NextResponse.json({ error: message }, { status: isUserError ? 409 : 500 });
  }
}
