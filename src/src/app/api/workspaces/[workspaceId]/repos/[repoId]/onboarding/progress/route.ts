import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workspaces, repoConnections } from "@/src/lib/db/schema";
import { onboardingProgress } from "@/src/lib/db/schema-onboarding";
import { and, eq } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ workspaceId: string; repoId: string }>;
}

// ---------------------------------------------------------------------------
// GET — retrieve progress for the current user + repo
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireSession();
    const userId = session.userId!;
    const { workspaceId, repoId } = await params;

    // Verify workspace ownership
    const workspace = await db.query.workspaces.findFirst({
      where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)),
    });
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Verify repo
    const repoConnection = await db.query.repoConnections.findFirst({
      where: and(
        eq(repoConnections.id, repoId),
        eq(repoConnections.workspaceId, workspaceId),
      ),
    });
    if (!repoConnection) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    // Optional filter by role via query param
    const url = new URL(req.url);
    const role = url.searchParams.get("role");

    const rows = await db
      .select()
      .from(onboardingProgress)
      .where(
        role
          ? and(
              eq(onboardingProgress.userId, userId),
              eq(onboardingProgress.repoConnectionId, repoConnection.id),
              eq(onboardingProgress.role, role),
            )
          : and(
              eq(onboardingProgress.userId, userId),
              eq(onboardingProgress.repoConnectionId, repoConnection.id),
            ),
      );

    return NextResponse.json(rows);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH — upsert progress (create or update)
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireSession();
    const userId = session.userId!;
    const { workspaceId, repoId } = await params;

    // Verify workspace ownership
    const workspace = await db.query.workspaces.findFirst({
      where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)),
    });
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Verify repo
    const repoConnection = await db.query.repoConnections.findFirst({
      where: and(
        eq(repoConnections.id, repoId),
        eq(repoConnections.workspaceId, workspaceId),
      ),
    });
    if (!repoConnection) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const role = typeof body.role === "string" ? body.role.trim() : "";
    if (!role) {
      return NextResponse.json({ error: "role is required" }, { status: 400 });
    }

    const currentStep = typeof body.currentStep === "number" ? body.currentStep : undefined;
    const completedSteps: number[] = Array.isArray(body.completedSteps)
      ? body.completedSteps.filter((s: unknown) => typeof s === "number")
      : [];

    // Try to find existing record
    const existing = await db
      .select()
      .from(onboardingProgress)
      .where(
        and(
          eq(onboardingProgress.userId, userId),
          eq(onboardingProgress.repoConnectionId, repoConnection.id),
          eq(onboardingProgress.role, role),
        ),
      )
      .limit(1);

    const now = new Date();

    if (existing.length > 0) {
      // Update
      const [updated] = await db
        .update(onboardingProgress)
        .set({
          completedSteps,
          ...(currentStep !== undefined ? { currentStep } : {}),
          lastActivityAt: now,
        })
        .where(eq(onboardingProgress.id, existing[0].id))
        .returning();
      return NextResponse.json(updated);
    } else {
      // Insert
      const [created] = await db
        .insert(onboardingProgress)
        .values({
          userId,
          repoConnectionId: repoConnection.id,
          role,
          completedSteps,
          currentStep: currentStep ?? 1,
          startedAt: now,
          lastActivityAt: now,
        })
        .returning();
      return NextResponse.json(created);
    }
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
