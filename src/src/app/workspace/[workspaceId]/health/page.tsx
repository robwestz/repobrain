/**
 * Code Health Dashboard page.
 * Route: /workspace/[workspaceId]/health
 */

import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workspaces, repoConnections } from "@/src/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { getRedis } from "@/src/lib/redis";
import { computeRepoHealth } from "@/src/modules/health/metrics";
import { HealthDashboard } from "@/src/components/health/health-dashboard";

const CACHE_TTL = 300;

export default async function HealthPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const session = await getSession();
  if (!session.userId) {
    redirect("/auth/login");
  }

  const { workspaceId } = await params;

  // Verify workspace belongs to user
  const workspace = await db.query.workspaces.findFirst({
    where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, session.userId)),
  });

  if (!workspace) {
    redirect("/dashboard");
  }

  // Get the latest repo connection for this workspace
  const repo = await db.query.repoConnections.findFirst({
    where: eq(repoConnections.workspaceId, workspaceId),
    orderBy: [desc(repoConnections.createdAt)],
  });

  if (!repo) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold">No Repository Connected</h1>
        <p className="text-sm text-[var(--muted-foreground)] max-w-sm">
          Connect a repository to your workspace to view the code health dashboard.
        </p>
        <a
          href={`/workspace/${workspaceId}`}
          className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--accent)]"
        >
          Go to Workspace
        </a>
      </div>
    );
  }

  if (repo.status !== "ready") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold">Repository Not Indexed Yet</h1>
        <p className="text-sm text-[var(--muted-foreground)] max-w-sm">
          The repository is currently being indexed. Please wait for indexing to complete before
          viewing the code health dashboard.
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Status: <span className="font-mono">{repo.status}</span>
        </p>
        <a
          href={`/workspace/${workspaceId}`}
          className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--accent)]"
        >
          Go to Workspace
        </a>
      </div>
    );
  }

  // Fetch (or compute) health data with Redis cache
  const redis = getRedis();
  const cacheKey = `health:full:${repo.id}`;
  let healthData;

  const cached = await redis.get(cacheKey);
  if (cached) {
    healthData = JSON.parse(cached);
  } else {
    try {
      healthData = await computeRepoHealth(repo.id);
      await redis.set(cacheKey, JSON.stringify(healthData), "EX", CACHE_TTL);
    } catch {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="text-xl font-semibold text-red-600 dark:text-red-400">
            Failed to Compute Health Metrics
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] max-w-sm">
            An error occurred while computing health metrics. This may happen if the repository
            has not been fully indexed.
          </p>
          <a
            href={`/workspace/${workspaceId}`}
            className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--accent)]"
          >
            Go to Workspace
          </a>
        </div>
      );
    }
  }

  return (
    <div className="h-screen overflow-hidden">
      <HealthDashboard
        workspaceId={workspaceId}
        repoId={repo.id}
        initialData={healthData}
      />
    </div>
  );
}
