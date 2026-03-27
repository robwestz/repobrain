import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";
import { findWorkspaceByIdAndUser, findRepoConnectionByWorkspace } from "@/src/modules/workspace/queries";
import { ArchitectureView } from "@/src/components/architecture/architecture-view";

export default async function ArchitecturePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const session = await getSession();
  if (!session.userId) {
    redirect("/auth/login");
  }

  const { workspaceId } = await params;

  const workspace = await findWorkspaceByIdAndUser(workspaceId, session.userId);
  if (!workspace) {
    redirect("/dashboard");
  }

  const repoConnection = await findRepoConnectionByWorkspace(workspaceId);
  if (!repoConnection) {
    redirect(`/workspace/${workspaceId}`);
  }

  const repoName = `${repoConnection.owner}/${repoConnection.name}`;

  return (
    <ArchitectureView
      workspaceId={workspaceId}
      repoId={repoConnection.id}
      repoName={repoName}
    />
  );
}
