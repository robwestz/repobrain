/**
 * Workspace and repo connection business logic.
 * Orchestrates between the github module, DB queries, and job queues.
 */

import { Queue } from "bullmq";
import { getRedis } from "@/src/lib/redis";
import { buildClonePath } from "@/src/modules/github/clone";
import {
  findWorkspaceByIdAndUser,
  findWorkspacesByUser,
  insertWorkspace,
  findRepoConnectionByWorkspace,
  findRepoConnectionById,
  countRepoConnectionsForWorkspace,
  insertRepoConnection,
  insertIndexJob,
} from "./queries";
import type { GitHubRepo } from "@/src/modules/github/repos";

// ---------------------------------------------------------------------------
// Queue definitions (WS3 will implement the ingest worker)
// ---------------------------------------------------------------------------

let cloneQueue: Queue | null = null;

function getCloneQueue(): Queue {
  if (!cloneQueue) {
    cloneQueue = new Queue("clone", { connection: getRedis() });
  }
  return cloneQueue;
}

// ---------------------------------------------------------------------------
// Workspace operations
// ---------------------------------------------------------------------------

export async function createWorkspace(userId: string, name: string) {
  if (!name || name.trim().length === 0) {
    throw new Error("Workspace name is required");
  }
  return insertWorkspace(userId, name.trim());
}

export async function listWorkspacesForUser(userId: string) {
  return findWorkspacesByUser(userId);
}

export async function getWorkspace(workspaceId: string, userId: string) {
  const workspace = await findWorkspaceByIdAndUser(workspaceId, userId);
  if (!workspace) return null;
  return workspace;
}

export async function getWorkspaceWithRepo(workspaceId: string, userId: string) {
  const workspace = await findWorkspaceByIdAndUser(workspaceId, userId);
  if (!workspace) return null;

  const repoConnection = await findRepoConnectionByWorkspace(workspaceId);
  return { ...workspace, repoConnection: repoConnection ?? null };
}

// ---------------------------------------------------------------------------
// Repo connection operations
// ---------------------------------------------------------------------------

/**
 * Connect a GitHub repository to a workspace.
 * Enforces v1 constraint: max 1 repo per workspace (§10 invariant #7).
 * Creates a RepoConnection record and enqueues a clone job.
 */
export async function connectRepo(
  workspaceId: string,
  userId: string,
  githubRepo: GitHubRepo,
  token: string,
) {
  // Verify user owns the workspace
  const workspace = await findWorkspaceByIdAndUser(workspaceId, userId);
  if (!workspace) {
    throw new Error("Workspace not found");
  }

  // Enforce max-1-repo-per-workspace constraint
  const existingCount = await countRepoConnectionsForWorkspace(workspaceId);
  if (existingCount > 0) {
    throw new Error(
      "This workspace already has a connected repository. Disconnect it before connecting a new one.",
    );
  }

  // Determine clone path
  const blobStoragePath =
    process.env.BLOB_STORAGE_PATH ?? "./repos";
  const clonePath = buildClonePath(
    blobStoragePath,
    workspaceId,
    githubRepo.owner.login,
    githubRepo.name,
  );

  // Create DB record
  const repoConnection = await insertRepoConnection({
    workspaceId,
    githubRepoId: githubRepo.id,
    owner: githubRepo.owner.login,
    name: githubRepo.name,
    defaultBranch: githubRepo.default_branch,
    clonePath,
    status: "pending",
  });

  // Create index job record (status: queued)
  await insertIndexJob({
    repoConnectionId: repoConnection.id,
    jobType: "full_index",
    status: "queued",
  });

  // Enqueue clone job
  await getCloneQueue().add(
    "clone-repo",
    {
      repoConnectionId: repoConnection.id,
      owner: githubRepo.owner.login,
      name: githubRepo.name,
      token,
      clonePath,
    },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  );

  return repoConnection;
}

export async function getRepoConnection(repoConnectionId: string) {
  return findRepoConnectionById(repoConnectionId);
}
