import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";
import { getWorkspaceWithRepo } from "@/src/modules/workspace/service";
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

  const workspace = await getWorkspaceWithRepo(workspaceId, session.userId);
  if (!workspace) {
    redirect("/dashboard");
  }

  return (
    <WorkspaceShell
      workspaceId={workspaceId}
      workspaceName={workspace.name}
      initialRepo={
        workspace.repoConnection
          ? {
              id: workspace.repoConnection.id,
              owner: workspace.repoConnection.owner,
              name: workspace.repoConnection.name,
              status: workspace.repoConnection.status,
              errorMessage: workspace.repoConnection.errorMessage ?? null,
              indexedCommitSha: workspace.repoConnection.indexedCommitSha ?? null,
            }
          : null
      }
    />
  );
}
