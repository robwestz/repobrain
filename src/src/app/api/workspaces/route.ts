import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workspaces } from "@/src/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userWorkspaces = await db.query.workspaces.findMany({
    where: eq(workspaces.userId, session.userId),
    orderBy: (ws, { desc }) => [desc(ws.createdAt)],
  });

  return NextResponse.json(userWorkspaces);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const [workspace] = await db
    .insert(workspaces)
    .values({
      userId: session.userId,
      name: name.trim(),
    })
    .returning();

  return NextResponse.json(workspace, { status: 201 });
}
