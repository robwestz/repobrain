import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";
import { getWorkspaceWithRepo } from "@/src/modules/workspace/service";
import { DiscussionsPageClient } from "./discussions-client";

export default async function DiscussionsPage({
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

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 min-w-0">
          <a
            href={`/workspace/${workspaceId}`}
            className="shrink-0 font-semibold text-sm hover:opacity-70 transition-opacity"
          >
            RepoBrain
          </a>
          <span className="text-[var(--muted-foreground)]">/</span>
          <span className="truncate text-sm text-[var(--muted-foreground)]">
            {workspace.name}
          </span>
          <span className="text-[var(--muted-foreground)]">/</span>
          <span className="text-sm font-medium">Discussions</span>
        </div>
        <a
          href={`/workspace/${workspaceId}`}
          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] underline"
        >
          Back to workspace
        </a>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {workspace.repoConnection ? (
          <DiscussionsPageClient
            workspaceId={workspaceId}
            repoId={workspace.repoConnection.id}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-[var(--muted-foreground)]">
              No repository connected. Go back to the workspace to connect one.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
