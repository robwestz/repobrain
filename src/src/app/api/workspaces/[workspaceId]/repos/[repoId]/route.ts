/**
 * GET /api/workspaces/:workspaceId/repos/:repoId
 * Returns the repo connection detail including current status.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import {
  findRepoConnectionById,
  findWorkspaceByIdAndUser,
} from "@/src/modules/workspace/queries";

type RouteContext = { params: Promise<{ workspaceId: string; repoId: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, repoId } = await params;

  // Verify workspace ownership
  const workspace = await findWorkspaceByIdAndUser(workspaceId, session.userId);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const repoConnection = await findRepoConnectionById(repoId);
  if (!repoConnection || repoConnection.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  return NextResponse.json(repoConnection);
}
