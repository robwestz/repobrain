import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/src/lib/auth";
import { findWorkspaceByIdAndUser } from "@/src/modules/workspace/queries";
import { searchSymbols } from "@/src/modules/blast-radius/queries";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; repoId: string }> },
) {
  try {
    const session = await requireSession();
    const { workspaceId, repoId } = await params;

    // Verify workspace ownership
    const workspace = await findWorkspaceByIdAndUser(workspaceId, session.userId as string);
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";
    const limit = Math.min(Number(searchParams.get("limit") ?? "10"), 50);

    if (!q || q.trim().length < 1) {
      return NextResponse.json({ symbols: [] });
    }

    const results = await searchSymbols(repoId, q.trim(), limit);

    return NextResponse.json({
      symbols: results.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        filePath: s.filePath,
        startLine: s.startLine,
        endLine: s.endLine,
      })),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
