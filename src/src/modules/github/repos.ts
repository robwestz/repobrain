/**
 * GitHub repository listing and metadata fetching.
 * Per module boundaries (§09): this module never writes to the database.
 * It returns data; callers are responsible for persistence.
 */

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  description: string | null;
  default_branch: string;
  stargazers_count: number;
  language: string | null;
  updated_at: string;
  size: number; // kilobytes
}

export interface RepoMetadata {
  id: number;
  name: string;
  owner: string;
  fullName: string;
  private: boolean;
  description: string | null;
  defaultBranch: string;
  language: string | null;
  size: number;
  updatedAt: string;
}

/**
 * List all repositories accessible to the authenticated user.
 * Fetches up to 100 repos per page; returns first 100 for simplicity.
 * Sorted by most recently updated.
 */
export async function listUserRepos(token: string): Promise<GitHubRepo[]> {
  const response = await fetch(
    "https://api.github.com/user/repos?sort=updated&per_page=100&type=all",
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub repos fetch failed: ${response.status} ${response.statusText}`);
  }

  const repos = await response.json();
  return repos as GitHubRepo[];
}

/**
 * Fetch metadata for a specific repository.
 */
export async function getRepoMetadata(
  token: string,
  owner: string,
  name: string,
): Promise<RepoMetadata> {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub repo metadata fetch failed: ${response.status} ${response.statusText}`);
  }

  const repo = await response.json();

  return {
    id: repo.id,
    name: repo.name,
    owner: repo.owner.login,
    fullName: repo.full_name,
    private: repo.private,
    description: repo.description ?? null,
    defaultBranch: repo.default_branch,
    language: repo.language ?? null,
    size: repo.size,
    updatedAt: repo.updated_at,
  };
}
