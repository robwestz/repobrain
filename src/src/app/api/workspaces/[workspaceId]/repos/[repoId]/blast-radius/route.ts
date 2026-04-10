import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/src/lib/auth";
import { getRedis } from "@/src/lib/redis";
import { findWorkspaceByIdAndUser } from "@/src/modules/workspace/queries";
import {
  analyzeBlastRadius,
  analyzeFileBlastRadius,
  resolveSymbolByName,
} from "@/src/modules/blast-radius/analyzer";

const CACHE_TTL_SECONDS = 300; // 5 minutes

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; repoId: string }> },
) {
  try {
    const session = await requireSession();
    const { workspaceId, repoId } = await params;

    // Verify the workspace belongs to the current user
    const workspace = await findWorkspaceByIdAndUser(workspaceId, session.userId as string);
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const body = await request.json();
    const { symbolId, symbolName, filePath, maxDepth = 4 } = body as {
      symbolId?: string;
      symbolName?: string;
      filePath?: string;
      maxDepth?: number;
    };

    const depth = Math.min(Math.max(1, Number(maxDepth) || 4), 6);

    // Determine the target symbol ID
    let resolvedSymbolId: string | null = symbolId ?? null;

    if (!resolvedSymbolId && symbolName) {
      const sym = await resolveSymbolByName(repoId, symbolName);
      if (!sym) {
        return NextResponse.json({ error: "Symbol not found" }, { status: 404 });
      }
      resolvedSymbolId = sym.id;
    }

    // Build cache key
    const cacheKey = resolvedSymbolId
      ? `blast-radius:${repoId}:sym:${resolvedSymbolId}:depth:${depth}`
      : filePath
        ? `blast-radius:${repoId}:file:${encodeURIComponent(filePath)}:depth:${depth}`
        : null;

    // Try cache
    if (cacheKey) {
      try {
        const redis = getRedis();
        const cached = await redis.get(cacheKey);
        if (cached) {
          return NextResponse.json(JSON.parse(cached));
        }
      } catch {
        // Redis unavailable — continue without cache
      }
    }

    // Run analysis
    let result;
    if (resolvedSymbolId) {
      result = await analyzeBlastRadius(repoId, resolvedSymbolId, depth);
    } else if (filePath) {
      result = await analyzeFileBlastRadius(repoId, filePath, depth);
    } else {
      return NextResponse.json(
        { error: "Provide symbolId, symbolName, or filePath" },
        { status: 400 },
      );
    }

    // Cache the result
    if (cacheKey) {
      try {
        const redis = getRedis();
        await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result));
      } catch {
        // Redis unavailable — ignore
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
