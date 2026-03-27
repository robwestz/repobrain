import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";
import { getWorkspaceWithRepo } from "@/src/modules/workspace/service";
import { SearchView } from "@/src/components/search/search-view";

export const metadata = {
  title: "Code Search — RepoBrain",
  description: "Search your codebase with natural language queries",
};

export default async function SearchPage({
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

  if (!repo || repo.status !== "ready") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="max-w-sm">
          <h2 className="text-lg font-semibold">Repository not indexed</h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            {repo
              ? `The repository ${repo.owner}/${repo.name} is currently ${repo.status}. Please wait for indexing to complete before searching.`
              : "No repository is connected to this workspace yet."}
          </p>
        </div>
        <a
          href={`/workspace/${workspaceId}`}
          className="rounded-xl border px-4 py-2 text-sm transition-colors hover:bg-[var(--accent)]"
        >
          Go to workspace
        </a>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top bar — mirrors workspace shell header style */}
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
            className="truncate text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            {workspace.name}
          </a>
          <span className="shrink-0 text-[var(--muted-foreground)]">/</span>
          <span className="truncate text-sm text-[var(--muted-foreground)]">
            {repo.owner}/{repo.name}
          </span>
          <span className="shrink-0 text-[var(--muted-foreground)]">/</span>
          <span className="truncate text-sm font-medium">Search</span>
        </div>
      </header>

      {/* Search interface — fills remaining height */}
      <div className="flex-1 overflow-hidden">
        <SearchView
          workspaceId={workspaceId}
          repoId={repo.id}
        />
      </div>

      {/* Status bar */}
      <footer className="flex h-7 shrink-0 items-center justify-between border-t px-3 text-xs text-[var(--muted-foreground)]">
        <span>{repo.owner}/{repo.name}</span>
        <span>RepoBrain v0.1</span>
      </footer>
    </div>
  );
}
