import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/src/lib/auth";
import { findWorkspaceByIdAndUser, findRepoConnectionById } from "@/src/modules/workspace/queries";
import { runADRGenerator } from "@/src/modules/specialists/adr-generator";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; repoId: string }> },
) {
  try {
    const session = await requireSession();
    const { workspaceId, repoId } = await params;

    const workspace = await findWorkspaceByIdAndUser(workspaceId, session.userId!);
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const repoConnection = await findRepoConnectionById(repoId);
    if (!repoConnection || repoConnection.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    if (repoConnection.status !== "ready") {
      return NextResponse.json(
        { error: "Repository is not ready. Please wait for indexing to complete." },
        { status: 409 },
      );
    }

    const result = await runADRGenerator(repoId);

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
