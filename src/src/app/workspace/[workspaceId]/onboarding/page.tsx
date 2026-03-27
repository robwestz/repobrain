import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";
import { getWorkspaceWithRepo } from "@/src/modules/workspace/service";
import { OnboardingView } from "@/src/components/onboarding/onboarding-view";

export const metadata = {
  title: "Smart Onboarding | RepoBrain",
};

interface OnboardingPageProps {
  params: Promise<{ workspaceId: string }>;
}

export default async function OnboardingPage({ params }: OnboardingPageProps) {
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
          <span className="text-[var(--muted-foreground)]">/</span>
          <span className="truncate text-sm text-[var(--muted-foreground)]">
            {workspace.name}
          </span>
          <span className="text-[var(--muted-foreground)]">/</span>
          <span className="text-sm font-medium">Onboarding</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/workspace/${workspaceId}`}
            className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            &larr; Back to workspace
          </a>
        </div>
      </header>

      {/* Content */}
      {!repo || repo.status !== "ready" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="text-4xl">&#128214;</div>
          <h2 className="text-lg font-semibold">Repository not ready</h2>
          <p className="max-w-sm text-sm text-[var(--muted-foreground)]">
            {!repo
              ? "Connect a repository to your workspace first, then come back to generate your onboarding path."
              : repo.status === "failed"
              ? "Your repository failed to index. Please reconnect it from the workspace."
              : "Your repository is still being indexed. Come back once indexing is complete."}
          </p>
          <a
            href={`/workspace/${workspaceId}`}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm transition-colors hover:bg-[var(--accent)]"
          >
            Go to workspace
          </a>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <OnboardingView
            workspaceId={workspaceId}
            repoId={repo.id}
            repoName={`${repo.owner}/${repo.name}`}
          />
        </div>
      )}

      {/* Footer */}
      <footer className="flex h-7 shrink-0 items-center justify-between border-t px-3 text-xs text-[var(--muted-foreground)]">
        <span>
          {repo ? `${repo.owner}/${repo.name}` : "No repository"}
        </span>
        <span>RepoBrain v0.1</span>
      </footer>
    </div>
  );
}
