/**
 * GET /api/workspaces/[workspaceId]/repos/[repoId]/files
 *
 * Returns the file tree for a repository as a nested structure.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workspaces, repoConnections, files } from "@/src/lib/db/schema";
import { and, eq } from "drizzle-orm";

export interface FileTreeNode {
  type: "file" | "directory";
  name: string;
  path: string;
  language?: string | null;
  lineCount?: number;
  children?: FileTreeNode[];
}

function buildTree(fileRows: { path: string; language: string | null; lineCount: number }[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const dirMap = new Map<string, FileTreeNode>();

  // Sort so directories come before files
  const sorted = [...fileRows].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sorted) {
    const parts = file.path.split("/");
    let current = root;

    // Ensure all parent directories exist
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join("/");
      if (!dirMap.has(dirPath)) {
        const dirNode: FileTreeNode = {
          type: "directory",
          name: parts[i],
          path: dirPath,
          children: [],
        };
        dirMap.set(dirPath, dirNode);
        current.push(dirNode);
      }
      current = dirMap.get(dirPath)!.children!;
    }

    // Add the file leaf
    current.push({
      type: "file",
      name: parts[parts.length - 1],
      path: file.path,
      language: file.language,
      lineCount: file.lineCount,
    });
  }

  return root;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; repoId: string }> },
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, repoId } = await params;

  const workspace = await db.query.workspaces.findFirst({
    where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, session.userId)),
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const repo = await db.query.repoConnections.findFirst({
    where: and(
      eq(repoConnections.id, repoId),
      eq(repoConnections.workspaceId, workspaceId),
    ),
  });

  if (!repo) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  const fileRows = await db
    .select({ path: files.path, language: files.language, lineCount: files.lineCount })
    .from(files)
    .where(eq(files.repoConnectionId, repoId))
    .orderBy(files.path);

  const tree = buildTree(fileRows);

  return NextResponse.json({ tree });
}
