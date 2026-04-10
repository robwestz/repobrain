/**
 * GET /api/workspaces/[workspaceId]/repos/[repoId]/api-map
 *
 * Returns the detected API surface map for a repository.
 * Results are cached in Redis for 10 minutes.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { getRedis } from "@/src/lib/redis";
import { db } from "@/src/lib/db";
import { workspaces, repoConnections } from "@/src/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { detectEndpoints } from "@/src/modules/api-map/detector";
import { enrichEndpoints } from "@/src/modules/api-map/analyzer";
import type { ApiMapResult } from "@/src/modules/api-map/analyzer";

const CACHE_TTL_SECONDS = 600; // 10 minutes

function cacheKey(workspaceId: string, repoId: string): string {
  return `api-map:${workspaceId}:${repoId}`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; repoId: string }> },
) {
  // Auth check
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, repoId } = await params;

  // Verify workspace ownership
  const workspace = await db.query.workspaces.findFirst({
    where: and(
      eq(workspaces.id, workspaceId),
      eq(workspaces.userId, session.userId),
    ),
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
      { error: "Repository is not indexed yet", status: repo.status },
      { status: 422 },
    );
  }

  // Check Redis cache
  const redis = getRedis();
  const key = cacheKey(workspaceId, repoId);

  try {
    const cached = await redis.get(key);
    if (cached) {
      const result = JSON.parse(cached) as ApiMapResult;
      result.cached = true;
      return NextResponse.json(result);
    }
  } catch {
    // Redis failure is non-fatal — proceed to compute
  }

  // Detect and enrich endpoints
  try {
    const rawEndpoints = await detectEndpoints(repoId);
    const result = await enrichEndpoints(rawEndpoints);
    result.cached = false;

    // Store in Redis
    try {
      await redis.set(key, JSON.stringify(result), "EX", CACHE_TTL_SECONDS);
    } catch {
      // Non-fatal
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
