import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";
import { getWorkspaceWithRepo } from "@/src/modules/workspace/service";
import { BlastRadiusView } from "@/src/components/blast-radius/blast-radius-view";

export const metadata = {
  title: "Blast Radius — RepoBrain",
};

export default async function BlastRadiusPage({
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

  const repoConnection = workspace.repoConnection;

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
          <span className="truncate text-sm text-[var(--muted-foreground)]">
            {workspace.name}
          </span>
          <span className="shrink-0 text-[var(--muted-foreground)]">/</span>
          <span className="text-sm font-medium">Blast Radius</span>
        </div>
        <div className="flex items-center gap-3">
          {repoConnection && (
            <span className="text-xs text-[var(--muted-foreground)]">
              {repoConnection.owner}/{repoConnection.name}
            </span>
          )}
          <a
            href={`/workspace/${workspaceId}`}
            className="rounded-lg border px-3 py-1 text-xs hover:bg-[var(--accent)] transition-colors"
          >
            ← Back to workspace
          </a>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {repoConnection && repoConnection.status === "ready" ? (
          <BlastRadiusView
            workspaceId={workspaceId}
            repoConnectionId={repoConnection.id}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="max-w-sm">
              <h2 className="text-lg font-semibold">Repository not ready</h2>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                {!repoConnection
                  ? "Connect a repository to your workspace first."
                  : repoConnection.status === "indexing"
                    ? "Your repository is still being indexed. Please wait for indexing to complete."
                    : repoConnection.status === "failed"
                      ? `Repository indexing failed: ${repoConnection.errorMessage ?? "Unknown error"}`
                      : "Repository is being prepared. Please check back shortly."}
              </p>
            </div>
            <a
              href={`/workspace/${workspaceId}`}
              className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--accent)]"
            >
              Go to workspace
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
