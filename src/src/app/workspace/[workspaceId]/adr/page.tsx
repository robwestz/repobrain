/**
 * Architecture Decision Records page.
 * Route: /workspace/[workspaceId]/adr
 */

import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";
import { getWorkspaceWithRepo } from "@/src/modules/workspace/service";
import { ADRClient } from "@/src/components/specialists/adr-client";

export default async function ADRPage({
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
    <ADRClient
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
