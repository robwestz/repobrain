import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/src/lib/auth";
import { getRedis } from "@/src/lib/redis";
import { buildGraph, type ViewLevel } from "@/src/modules/dependency-graph/builder";
import { findWorkspaceByIdAndUser } from "@/src/modules/workspace/queries";
import { findRepoConnectionById } from "@/src/modules/workspace/queries";

const CACHE_TTL_SECONDS = 600; // 10 minutes

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; repoId: string }> },
) {
  try {
    const session = await requireSession();
    const { workspaceId, repoId } = await params;

    // Verify workspace belongs to user (session.userId is guaranteed by requireSession)
    const workspace = await findWorkspaceByIdAndUser(workspaceId, session.userId!);
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Verify repo connection belongs to workspace
    const repo = await findRepoConnectionById(repoId);
    if (!repo || repo.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    const { searchParams } = request.nextUrl;
    const level = (searchParams.get("level") ?? "module") as ViewLevel;
    const focus = searchParams.get("focus") ?? undefined;
    const maxNodes = Math.min(
      parseInt(searchParams.get("maxNodes") ?? "200", 10),
      300,
    );

    if (!["module", "file", "symbol"].includes(level)) {
      return NextResponse.json({ error: "Invalid level" }, { status: 400 });
    }

    // Redis cache key
    const cacheKey = `dep-graph:${repoId}:${level}:${focus ?? "all"}:${maxNodes}`;

    try {
      const redis = getRedis();
      const cached = await redis.get(cacheKey);
      if (cached) {
        return NextResponse.json(JSON.parse(cached));
      }
    } catch {
      // Redis unavailable — fall through to DB
    }

    const graphData = await buildGraph(repo.id, level, {
      focusModule: focus,
      maxNodes,
    });

    // Cache in Redis
    try {
      const redis = getRedis();
      await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(graphData));
    } catch {
      // Redis unavailable — non-fatal
    }

    return NextResponse.json(graphData);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
