import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/src/lib/auth";
import { getRedis } from "@/src/lib/redis";
import { findWorkspaceByIdAndUser } from "@/src/modules/workspace/queries";
import { findRepoConnectionById } from "@/src/modules/workspace/queries";
import { generateDiagram, type DiagramType } from "@/src/modules/architecture/diagram-generator";

const CACHE_TTL_SECONDS = 600; // 10 minutes

const VALID_DIAGRAM_TYPES: DiagramType[] = [
  "module-dependency",
  "component",
  "data-flow",
  "class-hierarchy",
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; repoId: string }> },
) {
  try {
    const session = await requireSession();

    const { workspaceId, repoId } = await params;

    // Verify workspace belongs to user
    const workspace = await findWorkspaceByIdAndUser(workspaceId, session.userId!);
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Verify repo connection exists
    const repoConnection = await findRepoConnectionById(repoId);
    if (!repoConnection || repoConnection.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const rawType = searchParams.get("type") ?? "module-dependency";
    const focus = searchParams.get("focus") ?? undefined;

    if (!VALID_DIAGRAM_TYPES.includes(rawType as DiagramType)) {
      return NextResponse.json(
        {
          error: `Invalid diagram type. Must be one of: ${VALID_DIAGRAM_TYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const diagramType = rawType as DiagramType;

    // Check Redis cache
    const cacheKey = `architecture:${repoId}:${diagramType}:${focus ?? "all"}`;
    const redis = getRedis();

    const cachedValue = await redis.get(cacheKey).catch(() => null);
    if (cachedValue) {
      try {
        const diagram = JSON.parse(cachedValue);
        return NextResponse.json({ diagram, cached: true });
      } catch {
        // Cache miss — fall through to generate
      }
    }

    // Generate diagram
    const diagram = await generateDiagram(repoId, diagramType, {
      focusPath: focus,
      maxNodes: 50,
    });

    // Cache in Redis
    await redis
      .set(cacheKey, JSON.stringify(diagram), "EX", CACHE_TTL_SECONDS)
      .catch(() => null);

    return NextResponse.json({ diagram, cached: false });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
