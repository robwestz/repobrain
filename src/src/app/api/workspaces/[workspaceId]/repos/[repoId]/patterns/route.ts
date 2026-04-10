import { NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { getRedis } from "@/src/lib/redis";
import { db } from "@/src/lib/db";
import { workspaces, repoConnections } from "@/src/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { detectPatterns, buildSummary } from "@/src/modules/patterns/detector";

const CACHE_TTL_SECONDS = 600; // 10 minutes

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; repoId: string }> },
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, repoId } = await params;

  try {
    // Verify workspace belongs to user
    const workspace = await db.query.workspaces.findFirst({
      where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, session.userId)),
    });
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Verify repo connection belongs to workspace
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
        { error: "Repository is not yet indexed. Pattern detection requires an indexed repository." },
        { status: 422 },
      );
    }

    // Check Redis cache
    const redis = getRedis();
    const cacheKey = `patterns:${repoId}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      return NextResponse.json({ ...data, cached: true });
    }

    // Run pattern detection
    const patterns = await detectPatterns(repoId);
    const summary = buildSummary(patterns);

    const responseData = {
      patterns,
      summary,
      cached: false,
    };

    // Cache for 10 minutes
    await redis.set(cacheKey, JSON.stringify(responseData), "EX", CACHE_TTL_SECONDS);

    return NextResponse.json(responseData);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
