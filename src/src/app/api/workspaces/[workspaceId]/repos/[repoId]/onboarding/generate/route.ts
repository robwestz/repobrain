import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workspaces, repoConnections } from "@/src/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { generateOnboardingPath } from "@/src/modules/onboarding/path-generator";

interface RouteParams {
  params: Promise<{ workspaceId: string; repoId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireSession();
    const { workspaceId, repoId } = await params;

    // Verify workspace belongs to user
    const workspace = await db.query.workspaces.findFirst({
      where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, session.userId!)),
    });
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Verify repo connection belongs to workspace
    const repoConnection = await db.query.repoConnections.findFirst({
      where: and(
        eq(repoConnections.id, repoId),
        eq(repoConnections.workspaceId, workspaceId),
      ),
    });
    if (!repoConnection) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const role = typeof body.role === "string" && body.role.trim().length > 0
      ? body.role.trim()
      : "new team member";

    // Generate the onboarding path (cached in Redis for 30 min)
    const path = await generateOnboardingPath(repoConnection.id, role);

    return NextResponse.json(path);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
