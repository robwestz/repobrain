import { NextResponse } from "next/server";
import { requireSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workspaces, repoConnections } from "@/src/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { detectCrossRepoRelations } from "@/src/modules/cross-repo/detector";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const session = await requireSession();
    const { workspaceId } = await params;

    // Verify user owns the workspace
    const workspace = await db.query.workspaces.findFirst({
      where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, session.userId!)),
    });
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Get all repos in this workspace
    const repos = await db
      .select({
        id: repoConnections.id,
        owner: repoConnections.owner,
        name: repoConnections.name,
        status: repoConnections.status,
      })
      .from(repoConnections)
      .where(eq(repoConnections.workspaceId, workspaceId));

    if (repos.length < 2) {
      return NextResponse.json({
        relations: [],
        repos: repos.map((r) => ({ id: r.id, name: r.name, owner: r.owner, status: r.status })),
        summary: { apiConsumer: 0, sharedType: 0, npmDependency: 0, importPattern: 0, sharedModule: 0, totalRelations: 0 },
      });
    }

    const repoIds = repos.map((r) => r.id);

    // Detect (or refresh) cross-repo relations
    const detected = await detectCrossRepoRelations(workspaceId, repoIds);

    // Build summary
    const summary = {
      apiConsumer: detected.filter((r) => r.relationType === "api-consumer").length,
      sharedType: detected.filter((r) => r.relationType === "shared-type").length,
      npmDependency: detected.filter((r) => r.relationType === "npm-dependency").length,
      importPattern: detected.filter((r) => r.relationType === "import-pattern").length,
      sharedModule: detected.filter((r) => r.relationType === "shared-module").length,
      totalRelations: detected.length,
    };

    return NextResponse.json({
      relations: detected,
      repos: repos.map((r) => ({ id: r.id, name: r.name, owner: r.owner, status: r.status })),
      summary,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
