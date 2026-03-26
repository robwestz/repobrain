/**
 * Database queries for workspace and repo connection entities.
 * All raw DB access for the workspace module lives here.
 */

import { db } from "@/src/lib/db";
import { workspaces, repoConnections, indexJobs } from "@/src/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Workspace queries
// ---------------------------------------------------------------------------

export async function findWorkspaceByIdAndUser(workspaceId: string, userId: string) {
  return db.query.workspaces.findFirst({
    where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)),
  });
}

export async function findWorkspacesByUser(userId: string) {
  return db.query.workspaces.findMany({
    where: eq(workspaces.userId, userId),
    orderBy: [desc(workspaces.createdAt)],
    with: {
      repoConnections: {
        orderBy: [desc(repoConnections.createdAt)],
        limit: 1,
      },
    },
  });
}

export async function insertWorkspace(userId: string, name: string) {
  const [workspace] = await db
    .insert(workspaces)
    .values({ userId, name })
    .returning();
  return workspace;
}

// ---------------------------------------------------------------------------
// RepoConnection queries
// ---------------------------------------------------------------------------

export async function findRepoConnectionByWorkspace(workspaceId: string) {
  return db.query.repoConnections.findFirst({
    where: eq(repoConnections.workspaceId, workspaceId),
    orderBy: [desc(repoConnections.createdAt)],
  });
}

export async function findRepoConnectionById(repoConnectionId: string) {
  return db.query.repoConnections.findFirst({
    where: eq(repoConnections.id, repoConnectionId),
  });
}

/** Counts how many repo connections exist for a given workspace. */
export async function countRepoConnectionsForWorkspace(workspaceId: string): Promise<number> {
  const rows = await db
    .select({ id: repoConnections.id })
    .from(repoConnections)
    .where(eq(repoConnections.workspaceId, workspaceId));
  return rows.length;
}

export async function insertRepoConnection(data: {
  workspaceId: string;
  githubRepoId: number;
  owner: string;
  name: string;
  defaultBranch: string;
  clonePath: string;
  status: string;
}) {
  const [conn] = await db
    .insert(repoConnections)
    .values({
      workspaceId: data.workspaceId,
      githubRepoId: data.githubRepoId,
      owner: data.owner,
      name: data.name,
      defaultBranch: data.defaultBranch,
      clonePath: data.clonePath,
      status: data.status,
    })
    .returning();
  return conn;
}

export async function updateRepoConnectionStatus(
  repoConnectionId: string,
  status: string,
  errorMessage?: string,
) {
  const [updated] = await db
    .update(repoConnections)
    .set({
      status,
      errorMessage: errorMessage ?? null,
      updatedAt: new Date(),
    })
    .where(eq(repoConnections.id, repoConnectionId))
    .returning();
  return updated;
}

export async function updateRepoConnectionIndexedCommit(
  repoConnectionId: string,
  commitSha: string,
) {
  const [updated] = await db
    .update(repoConnections)
    .set({
      indexedCommitSha: commitSha,
      updatedAt: new Date(),
    })
    .where(eq(repoConnections.id, repoConnectionId))
    .returning();
  return updated;
}

// ---------------------------------------------------------------------------
// IndexJob queries
// ---------------------------------------------------------------------------

export async function findLatestIndexJob(repoConnectionId: string) {
  return db.query.indexJobs.findFirst({
    where: eq(indexJobs.repoConnectionId, repoConnectionId),
    orderBy: [desc(indexJobs.createdAt)],
  });
}

export async function insertIndexJob(data: {
  repoConnectionId: string;
  jobType: string;
  status: string;
}) {
  const [job] = await db
    .insert(indexJobs)
    .values({
      repoConnectionId: data.repoConnectionId,
      jobType: data.jobType,
      status: data.status,
      progress: {},
    })
    .returning();
  return job;
}

export async function updateIndexJobStatus(
  jobId: string,
  status: string,
  progress?: Record<string, unknown>,
  errorMessage?: string,
) {
  const [updated] = await db
    .update(indexJobs)
    .set({
      status,
      ...(progress !== undefined ? { progress } : {}),
      ...(errorMessage !== undefined ? { errorMessage } : {}),
      ...(status === "running" ? { startedAt: new Date() } : {}),
      ...(status === "completed" || status === "failed" ? { completedAt: new Date() } : {}),
    })
    .where(eq(indexJobs.id, jobId))
    .returning();
  return updated;
}
