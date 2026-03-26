/**
 * GitHub repository cloning.
 * Per module boundaries (§09): this module never writes to the database.
 * It clones to blob storage; callers handle DB status updates.
 */

import { simpleGit } from "simple-git";
import * as fs from "fs";
import * as path from "path";

/**
 * Clone a GitHub repository to a local target path.
 * Uses the GitHub access token for authentication on private repos.
 *
 * @param token - GitHub OAuth access token
 * @param owner - Repository owner (user or org login)
 * @param name - Repository name
 * @param targetPath - Absolute path to clone into (must not already exist)
 */
export async function cloneRepo(
  token: string,
  owner: string,
  name: string,
  targetPath: string,
): Promise<void> {
  // Ensure parent directory exists
  const parentDir = path.dirname(targetPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  // Build authenticated HTTPS clone URL
  const cloneUrl = `https://oauth2:${token}@github.com/${owner}/${name}.git`;

  const git = simpleGit();
  await git.clone(cloneUrl, targetPath, [
    "--depth", "1",        // Shallow clone — we only need the latest snapshot
    "--no-tags",           // Skip tags to reduce transfer size
    "--single-branch",     // Only fetch the default branch
  ]);
}

/**
 * Build the deterministic clone path for a repo within a workspace.
 * Format: {blobStoragePath}/{workspaceId}/{owner}__{name}
 */
export function buildClonePath(
  blobStoragePath: string,
  workspaceId: string,
  owner: string,
  name: string,
): string {
  return path.resolve(blobStoragePath, workspaceId, `${owner}__${name}`);
}
