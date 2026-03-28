/**
 * Security Audit page.
 * Route: /workspace/[workspaceId]/security-audit
 */

import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";
import { getWorkspaceWithRepo } from "@/src/modules/workspace/service";
import { SecurityAuditClient } from "@/src/components/specialists/security-audit-client";

export default async function SecurityAuditPage({
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
    <SecurityAuditClient
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
