import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";
import { getWorkspaceWithRepo } from "@/src/modules/workspace/service";
import { ApiMapView } from "@/src/components/api-map/api-map-view";

interface ApiMapPageProps {
  params: Promise<{ workspaceId: string }>;
}

export default async function ApiMapPage({ params }: ApiMapPageProps) {
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
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
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
            className="truncate text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            {workspace.name}
          </a>
          {repo && (
            <>
              <span className="shrink-0 text-[var(--muted-foreground)]">/</span>
              <span className="truncate text-sm text-[var(--muted-foreground)]">
                {repo.owner}/{repo.name}
              </span>
            </>
          )}
          <span className="shrink-0 text-[var(--muted-foreground)]">/</span>
          <span className="shrink-0 text-sm font-medium text-[var(--foreground)]">
            API Map
          </span>
        </div>

        {/* Back link */}
        <a
          href={`/workspace/${workspaceId}`}
          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          ← Back to workspace
        </a>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {!repo ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="max-w-sm text-center">
              <p className="text-sm font-medium text-[var(--foreground)]">
                No repository connected
              </p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Connect a repository to your workspace to view the API surface map.
              </p>
              <a
                href={`/workspace/${workspaceId}`}
                className="mt-4 inline-block rounded-lg border border-[var(--border)] px-4 py-2 text-sm transition-colors hover:bg-[var(--accent)]"
              >
                Go to workspace
              </a>
            </div>
          </div>
        ) : repo.status !== "ready" ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="max-w-sm text-center">
              <p className="text-sm font-medium text-[var(--foreground)]">
                Repository not yet indexed
              </p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                The repository is currently{" "}
                <span className="font-medium">{repo.status}</span>. The API map
                will be available once indexing is complete.
              </p>
              <a
                href={`/workspace/${workspaceId}`}
                className="mt-4 inline-block rounded-lg border border-[var(--border)] px-4 py-2 text-sm transition-colors hover:bg-[var(--accent)]"
              >
                View progress
              </a>
            </div>
          </div>
        ) : (
          <ApiMapView workspaceId={workspaceId} repoId={repo.id} />
        )}
      </main>

      {/* Footer */}
      <footer className="flex h-7 shrink-0 items-center justify-between border-t border-[var(--border)] px-3 text-xs text-[var(--muted-foreground)]">
        <span>
          {repo
            ? `${repo.owner}/${repo.name}`
            : "No repository connected"}
        </span>
        <span>RepoBrain API Map</span>
      </footer>
    </div>
  );
}
