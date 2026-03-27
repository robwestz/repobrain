import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";
import { findWorkspaceByIdAndUser, findRepoConnectionByWorkspace } from "@/src/modules/workspace/queries";
import { GalaxyView } from "@/src/components/galaxy/galaxy-view";
import type { ViewLevel } from "@/src/modules/dependency-graph/builder";

interface GalaxyPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ level?: string; focus?: string; repo?: string }>;
}

export default async function GalaxyPage({ params, searchParams }: GalaxyPageProps) {
  const session = await getSession();
  if (!session.userId) {
    redirect("/auth/login");
  }

  const { workspaceId } = await params;
  const { level, focus, repo: repoIdParam } = await searchParams;

  // Verify workspace belongs to user
  const workspace = await findWorkspaceByIdAndUser(workspaceId, session.userId);
  if (!workspace) {
    redirect("/dashboard");
  }

  // Get repo connection (use explicit repoId or fall back to first repo in workspace)
  let repoId = repoIdParam ?? null;

  if (!repoId) {
    const repo = await findRepoConnectionByWorkspace(workspaceId);
    repoId = repo?.id ?? null;
  }

  const validLevel = (["module", "file", "symbol"] as const).includes(level as ViewLevel)
    ? (level as ViewLevel)
    : "module";

  return (
    <div className="flex h-screen flex-col bg-[#0f0f14] text-white">
      {/* Page header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div className="flex items-center gap-3">
          <a
            href="/dashboard"
            className="text-sm font-semibold hover:opacity-70 transition-opacity"
          >
            RepoBrain
          </a>
          <span className="text-neutral-600">/</span>
          <a
            href={`/workspace/${workspaceId}`}
            className="text-sm text-neutral-400 hover:text-white transition-colors"
          >
            {workspace.name}
          </a>
          <span className="text-neutral-600">/</span>
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4 text-indigo-400">
              <circle cx="8" cy="8" r="2" fill="currentColor" />
              <circle cx="3" cy="3" r="1.5" fill="currentColor" />
              <circle cx="13" cy="3" r="1.5" fill="currentColor" />
              <circle cx="3" cy="13" r="1.5" fill="currentColor" />
              <circle cx="13" cy="13" r="1.5" fill="currentColor" />
              <path
                d="M8 6L3 3M8 6l5-3M8 10l-5 3M8 10l5 3"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
              />
            </svg>
            Dependency Galaxy
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/workspace/${workspaceId}`}
            className="text-xs text-neutral-400 hover:text-white transition-colors"
          >
            ← Back to workspace
          </a>
        </div>
      </header>

      {/* Main content */}
      {repoId ? (
        <div className="flex-1 overflow-hidden">
          <GalaxyView
            workspaceId={workspaceId}
            repoId={repoId}
            initialLevel={validLevel}
            initialFocus={focus}
          />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <svg viewBox="0 0 48 48" fill="none" className="mx-auto mb-4 h-12 w-12 text-neutral-600">
              <circle cx="24" cy="24" r="8" stroke="currentColor" strokeWidth="2" />
              <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="2" />
              <circle cx="38" cy="10" r="4" stroke="currentColor" strokeWidth="2" />
              <circle cx="10" cy="38" r="4" stroke="currentColor" strokeWidth="2" />
              <circle cx="38" cy="38" r="4" stroke="currentColor" strokeWidth="2" />
              <path d="M24 16L10 10M24 16l14-6M24 32L10 38M24 32l14 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <h2 className="text-sm font-medium text-neutral-300">No repository connected</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Connect and index a repository to visualise its dependency graph.
            </p>
            <a
              href={`/workspace/${workspaceId}`}
              className="mt-4 inline-block rounded-md border border-white/10 px-4 py-2 text-sm text-neutral-300 hover:bg-white/10 transition-colors"
            >
              Go to workspace
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
