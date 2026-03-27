import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";
import { getWorkspaceWithRepos } from "@/src/modules/workspace/service";
import { WorkspaceShell } from "@/src/components/layout/workspace-shell";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const session = await getSession();
  if (!session.userId) {
    redirect("/auth/login");
  }

  const { workspaceId } = await params;

  const workspace = await getWorkspaceWithRepos(workspaceId, session.userId);
  if (!workspace) {
    redirect("/dashboard");
  }

  const repoInfos = workspace.repoConnections.map((rc) => ({
    id: rc.id,
    owner: rc.owner,
    name: rc.name,
    status: rc.status,
    errorMessage: rc.errorMessage ?? null,
    indexedCommitSha: rc.indexedCommitSha ?? null,
  }));

  // Primary repo is the most recent one
  const primaryRepo = repoInfos[0] ?? null;

  return (
    <WorkspaceShell
      workspaceId={workspaceId}
      workspaceName={workspace.name}
      initialRepo={primaryRepo}
      initialRepos={repoInfos}
    />
  );
}
