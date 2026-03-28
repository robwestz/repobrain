import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";
import { getWorkspaceWithRepo } from "@/src/modules/workspace/service";
import { ResearchView } from "@/src/components/research/research-view";

export const metadata = {
  title: "Deep Research — RepoBrain",
  description: "Multi-iteration deep research over your codebase",
};

export default async function DeepResearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await getSession();
  if (!session.userId) {
    redirect("/auth/login");
  }

  const { workspaceId } = await params;
  const { q } = await searchParams;

  const workspace = await getWorkspaceWithRepo(workspaceId, session.userId);
  if (!workspace) {
    redirect("/dashboard");
  }

  const repo = workspace.repoConnection;
  const initialQuestion = typeof q === "string" && q.trim() ? q.trim() : undefined;

  return (
    <div className="h-screen flex flex-col overflow-hidden">
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
          <span className="truncate text-sm font-medium">Deep Research</span>
        </div>
        <div className="flex items-center gap-3">
          {repo && repo.status !== "ready" && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
              {repo.status}
            </span>
          )}
          <a
            href={`/workspace/${workspaceId}`}
            className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs transition-colors hover:bg-[var(--accent)]"
          >
            Back to workspace
          </a>
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-1 overflow-hidden">
        {!repo ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="rounded-full bg-[var(--muted)] p-5">
              <svg
                className="h-10 w-10 text-[var(--muted-foreground)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23-.693L5 14.5m14.8.8 1.402 1.402c1 1 .03 2.7-1.388 2.43l-1.934-.377"
                />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-[var(--foreground)]">
                No repository connected
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Connect and index a repository to start deep research.
              </p>
            </div>
            <a
              href={`/workspace/${workspaceId}`}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
            >
              Go to workspace
            </a>
          </div>
        ) : repo.status !== "ready" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="h-10 w-10 rounded-full border-2 border-[var(--border)] border-t-blue-500 animate-spin" />
            <div>
              <h2 className="font-semibold text-[var(--foreground)]">
                Repository is being indexed
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Deep Research will be available once indexing completes.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden w-full">
            <ResearchView workspaceId={workspaceId} repoId={repo.id} initialQuestion={initialQuestion} />
          </div>
        )}
      </main>

      {/* Status bar */}
      <footer className="flex h-7 shrink-0 items-center justify-between border-t px-3 text-xs text-[var(--muted-foreground)]">
        <span>{repo ? `${repo.owner}/${repo.name}` : "No repository"}</span>
        <span>RepoBrain Deep Research</span>
      </footer>
    </div>
  );
}
