/**
 * /workspace/[workspaceId]/timeline
 *
 * Server component that:
 * 1. Checks auth
 * 2. Resolves workspace + most-recent repo connection
 * 3. Passes to the client-side TimelineView
 *
 * Supports ?file=<path> query param for file-scoped history (linked from CodeViewer).
 */

import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";
import { findWorkspaceByIdAndUser, findRepoConnectionByWorkspace } from "@/src/modules/workspace/queries";
import { TimelineView } from "@/src/components/timeline/timeline-view";

interface TimelinePageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ file?: string }>;
}

export default async function TimelinePage({ params, searchParams }: TimelinePageProps) {
  const session = await getSession();
  if (!session.userId) {
    redirect("/auth/login");
  }

  const { workspaceId } = await params;
  const { file: filePath } = await searchParams;

  const workspace = await findWorkspaceByIdAndUser(workspaceId, session.userId);
  if (!workspace) {
    redirect("/dashboard");
  }

  const repoConn = await findRepoConnectionByWorkspace(workspaceId);
  if (!repoConn) {
    // No repo connected — send user back to workspace to connect one
    redirect(`/workspace/${workspaceId}`);
  }

  return (
    <div className="h-screen overflow-hidden">
      <TimelineView
        workspaceId={workspaceId}
        repoId={repoConn.id}
        initialFilePath={filePath}
      />
    </div>
  );
}
