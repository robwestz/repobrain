import { NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workspaces } from "@/src/lib/db/schema";
import { and, eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId } = await params;

  const workspace = await db.query.workspaces.findFirst({
    where: and(
      eq(workspaces.id, workspaceId),
      eq(workspaces.userId, session.userId),
    ),
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  return NextResponse.json(workspace);
}
