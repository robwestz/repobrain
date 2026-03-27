import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";
import { getWorkspaceWithRepo } from "@/src/modules/workspace/service";
import { PatternReport } from "@/src/components/patterns/pattern-report";

export default async function PatternsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const session = await getSession();
  if (!session.userId) {
    redirect("/auth/login");
  }

  const { workspaceId } = await params;

  const workspace = await getWorkspaceWithRepo(workspaceId, session.userId);
  if (!workspace) {
    redirect("/dashboard");
  }

  const repo = workspace.repoConnection;

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 min-w-0">
          <a
            href="/dashboard"
            className="shrink-0 font-semibold text-sm hover:opacity-70 transition-opacity"
          >
            RepoBrain
          </a>
          <span className="shrink-0 text-[var(--muted-foreground)]">/</span>
          <a
            href={`/workspace/${workspaceId}`}
            className="truncate text-sm text-[var(--muted-foreground)] hover:opacity-70 transition-opacity"
          >
            {workspace.name}
          </a>
          <span className="shrink-0 text-[var(--muted-foreground)]">/</span>
          <span className="text-sm font-medium text-[var(--foreground)]">Patterns</span>
        </div>
        <a
          href={`/workspace/${workspaceId}`}
          className="rounded-md border px-3 py-1.5 text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)]"
        >
          Back to Explorer
        </a>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {!repo ? (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <div className="max-w-sm">
              <h2 className="font-semibold text-[var(--foreground)]">No repository connected</h2>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                Connect and index a repository to run Pattern Detective analysis.
              </p>
              <a
                href={`/workspace/${workspaceId}`}
                className="mt-4 inline-block rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--accent)]"
              >
                Connect a repository
              </a>
            </div>
          </div>
        ) : repo.status !== "ready" ? (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <div className="max-w-sm">
              <h2 className="font-semibold text-[var(--foreground)]">Repository not yet indexed</h2>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                {repo.owner}/{repo.name} is currently{" "}
                {repo.status === "cloning" ? "being cloned" : repo.status === "indexing" ? "being indexed" : repo.status}.
                Pattern Detective requires a fully indexed repository.
              </p>
              <a
                href={`/workspace/${workspaceId}`}
                className="mt-4 inline-block rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--accent)]"
              >
                Check indexing progress
              </a>
            </div>
          </div>
        ) : (
          <PatternReport workspaceId={workspaceId} repoId={repo.id} />
        )}
      </main>
    </div>
  );
}
