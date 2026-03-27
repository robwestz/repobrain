import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";
import { getWorkspaceWithRepo } from "@/src/modules/workspace/service";
import { NarratorPageClient } from "./narrator-page-client";

export default async function NarratorPage({
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
    <NarratorPageClient
      workspaceId={workspaceId}
      workspaceName={workspace.name}
      repoId={workspace.repoConnection?.id ?? null}
      repoName={
        workspace.repoConnection
          ? `${workspace.repoConnection.owner}/${workspace.repoConnection.name}`
          : null
      }
      repoStatus={workspace.repoConnection?.status ?? null}
    />
  );
}
