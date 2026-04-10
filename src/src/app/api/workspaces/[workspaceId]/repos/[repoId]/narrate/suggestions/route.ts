/**
 * GET /api/workspaces/[workspaceId]/repos/[repoId]/narrate/suggestions
 *
 * Returns suggested flows to narrate based on API routes, high-degree symbols,
 * and service/worker functions in the repository.
 *
 * Response:
 *   { "suggestions": SuggestedFlow[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { findWorkspaceByIdAndUser, findRepoConnectionById } from "@/src/modules/workspace/queries";
import { suggestFlows } from "@/src/modules/narrator/suggestions";

type RouteContext = {
  params: Promise<{ workspaceId: string; repoId: string }>;
};

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, repoId } = await params;

  // Verify ownership
  const workspace = await findWorkspaceByIdAndUser(workspaceId, session.userId);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const repo = await findRepoConnectionById(repoId);
  if (!repo || repo.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  try {
    const suggestions = await suggestFlows(repo.id);
    return NextResponse.json({ suggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
