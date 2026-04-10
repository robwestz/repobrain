/**
 * POST /api/workspaces/[workspaceId]/repos/[repoId]/what-if
 *
 * Accepts a natural language change description and returns a WhatIfResult
 * with impact analysis, risk assessment, and AI recommendations.
 *
 * Request body:
 *   { "description": "What if I remove the semanticSearch function?" }
 *
 * Response: WhatIfResult JSON
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { findWorkspaceByIdAndUser, findRepoConnectionById } from "@/src/modules/workspace/queries";
import { simulateChange } from "@/src/modules/what-if/simulator";

type RouteContext = {
  params: Promise<{ workspaceId: string; repoId: string }>;
};

export async function POST(req: NextRequest, { params }: RouteContext) {
  // --- Auth ---
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, repoId } = await params;

  // --- Verify workspace ownership ---
  const workspace = await findWorkspaceByIdAndUser(workspaceId, session.userId);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // --- Verify repo connection ---
  const repoConnection = await findRepoConnectionById(repoId);
  if (!repoConnection || repoConnection.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  if (repoConnection.status !== "ready") {
    return NextResponse.json(
      { error: "Repository is not fully indexed yet. Please wait for indexing to complete." },
      { status: 422 },
    );
  }

  // --- Parse body ---
  let body: { description?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.description || typeof body.description !== "string" || !body.description.trim()) {
    return NextResponse.json(
      { error: "description is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  const description = body.description.trim();
  if (description.length > 2000) {
    return NextResponse.json(
      { error: "description must be 2000 characters or fewer" },
      { status: 400 },
    );
  }

  // --- Run simulation ---
  try {
    const result = await simulateChange(repoConnection.id, description);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Simulation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
