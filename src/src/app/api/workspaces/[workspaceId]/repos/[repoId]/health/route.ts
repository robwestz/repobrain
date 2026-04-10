/**
 * GET /api/workspaces/[workspaceId]/repos/[repoId]/health
 *
 * Returns code health metrics for a repository.
 * Query params:
 *   sortBy: "healthScore" | "complexity" | "coupling" | "size"  (default: "healthScore")
 *   order:  "asc" | "desc"                                      (default: "asc")
 *   limit:  number                                              (default: 100, max: 500)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workspaces, repoConnections } from "@/src/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getRedis } from "@/src/lib/redis";
import { computeRepoHealth } from "@/src/modules/health/metrics";
import type { FileHealth } from "@/src/modules/health/metrics";

const CACHE_TTL = 300; // 5 minutes

type SortBy = "healthScore" | "complexity" | "coupling" | "size";
type Order = "asc" | "desc";

function sortFiles(files: FileHealth[], sortBy: SortBy, order: Order): FileHealth[] {
  const sorted = [...files].sort((a, b) => {
    let va: number;
    let vb: number;

    switch (sortBy) {
      case "complexity":
        va = a.metrics.complexity;
        vb = b.metrics.complexity;
        break;
      case "coupling":
        va = a.metrics.coupling.instability;
        vb = b.metrics.coupling.instability;
        break;
      case "size":
        va = a.metrics.lineCount;
        vb = b.metrics.lineCount;
        break;
      case "healthScore":
      default:
        va = a.healthScore;
        vb = b.healthScore;
        break;
    }

    return order === "asc" ? va - vb : vb - va;
  });

  return sorted;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; repoId: string }> },
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, repoId } = await params;

  // Verify workspace belongs to user
  const workspace = await db.query.workspaces.findFirst({
    where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, session.userId)),
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Verify repo belongs to workspace
  const repo = await db.query.repoConnections.findFirst({
    where: and(
      eq(repoConnections.id, repoId),
      eq(repoConnections.workspaceId, workspaceId),
    ),
  });

  if (!repo) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  if (repo.status !== "ready") {
    return NextResponse.json(
      { error: "Repository is not indexed yet. Please wait for indexing to complete." },
      { status: 422 },
    );
  }

  // Parse query params
  const searchParams = request.nextUrl.searchParams;
  const sortByParam = searchParams.get("sortBy") ?? "healthScore";
  const orderParam = searchParams.get("order") ?? "asc";
  const limitParam = searchParams.get("limit") ?? "100";

  const sortBy: SortBy = ["healthScore", "complexity", "coupling", "size"].includes(sortByParam)
    ? (sortByParam as SortBy)
    : "healthScore";

  const order: Order = orderParam === "desc" ? "desc" : "asc";
  const limit = Math.min(500, Math.max(1, parseInt(limitParam, 10) || 100));

  try {
    // Check full-result cache
    const redis = getRedis();
    const cacheKey = `health:full:${repoId}`;
    const cached = await redis.get(cacheKey);

    let repoHealth;
    if (cached) {
      repoHealth = JSON.parse(cached);
    } else {
      repoHealth = await computeRepoHealth(repoId);
      await redis.set(cacheKey, JSON.stringify(repoHealth), "EX", CACHE_TTL);
    }

    // Apply sorting and limit to allFiles
    const sortedFiles = sortFiles(repoHealth.allFiles, sortBy, order).slice(0, limit);

    return NextResponse.json({
      ...repoHealth,
      allFiles: sortedFiles,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Failed to compute health metrics: ${message}` }, { status: 500 });
  }
}
