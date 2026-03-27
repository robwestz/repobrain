import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";
import { getWorkspaceWithRepo } from "@/src/modules/workspace/service";
import { WhatIfView } from "@/src/components/what-if/what-if-view";

export default async function WhatIfPage({
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

  const repo = workspace.repoConnection;

  return (
    <div className="h-screen">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center bg-slate-900">
            <span className="text-sm text-slate-400">Loading…</span>
          </div>
        }
      >
        <WhatIfView
          workspaceId={workspaceId}
          repoId={repo?.id ?? ""}
          repoName={
            repo
              ? `${repo.owner}/${repo.name}`
              : workspace.name
          }
        />
      </Suspense>
    </div>
  );
}
