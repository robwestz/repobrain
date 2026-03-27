import { redirect } from "next/navigation";
import { requireSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workspaces, repoConnections } from "@/src/lib/db/schema";
import { crossRepoRelations } from "@/src/lib/db/schema-cross-repo";
import { and, eq, inArray } from "drizzle-orm";
import { CrossRepoView } from "@/src/components/cross-repo/cross-repo-view";

export default async function CrossRepoPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const session = await requireSession();
  const { workspaceId } = await params;

  // Verify user owns the workspace
  const workspace = await db.query.workspaces.findFirst({
    where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, session.userId!)),
  });
  if (!workspace) {
    redirect("/dashboard");
  }

  // Load all repos
  const repos = await db
    .select({
      id: repoConnections.id,
      owner: repoConnections.owner,
      name: repoConnections.name,
      status: repoConnections.status,
    })
    .from(repoConnections)
    .where(eq(repoConnections.workspaceId, workspaceId));

  // Load existing cross-repo relations (previously detected)
  const repoIds = repos.map((r) => r.id);
  const existingRelations =
    repoIds.length >= 2
      ? await db
          .select()
          .from(crossRepoRelations)
          .where(inArray(crossRepoRelations.fromRepoId, repoIds))
      : [];

  const summary = {
    apiConsumer: existingRelations.filter((r) => r.relationType === "api-consumer").length,
    sharedType: existingRelations.filter((r) => r.relationType === "shared-type").length,
    npmDependency: existingRelations.filter((r) => r.relationType === "npm-dependency").length,
    importPattern: existingRelations.filter((r) => r.relationType === "import-pattern").length,
    sharedModule: existingRelations.filter((r) => r.relationType === "shared-module").length,
    totalRelations: existingRelations.length,
  };

  // Map relations to the shape the client component expects
  const repoMap = new Map(repos.map((r) => [r.id, `${r.owner}/${r.name}`]));
  const mappedRelations = existingRelations.map((r) => ({
    fromRepo: repoMap.get(r.fromRepoId) ?? r.fromRepoId,
    toRepo: repoMap.get(r.toRepoId) ?? r.toRepoId,
    fromRepoId: r.fromRepoId,
    toRepoId: r.toRepoId,
    relationType: r.relationType,
    fromFile: r.fromFilePath,
    toFile: r.toFilePath,
    fromSymbol: r.fromSymbolName ?? null,
    toSymbol: r.toSymbolName ?? null,
    evidence: r.evidence ?? "",
    confidence: (r.confidence ?? "medium") as "high" | "medium" | "low",
  }));

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
          <span className="text-[var(--muted-foreground)]">/</span>
          <a
            href={`/workspace/${workspaceId}`}
            className="truncate text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            {workspace.name}
          </a>
          <span className="text-[var(--muted-foreground)]">/</span>
          <span className="text-sm font-medium">Cross-Repo</span>
        </div>
        <a
          href={`/workspace/${workspaceId}`}
          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          Back to workspace
        </a>
      </header>

      <div className="flex-1 overflow-hidden">
        <CrossRepoView
          workspaceId={workspaceId}
          repos={repos}
          initialRelations={mappedRelations}
          initialSummary={summary}
        />
      </div>
    </div>
  );
}
