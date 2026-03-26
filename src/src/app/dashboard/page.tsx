import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";
import { listWorkspacesForUser } from "@/src/modules/workspace/service";
import { CreateWorkspaceButton } from "@/src/components/workspace/create-workspace-button";
import Link from "next/link";

const STATUS_LABELS: Record<string, string> = {
  pending: "Connecting…",
  cloning: "Cloning…",
  indexing: "Indexing…",
  ready: "Ready",
  failed: "Failed",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-yellow-600 dark:text-yellow-400",
  cloning: "text-blue-600 dark:text-blue-400",
  indexing: "text-blue-600 dark:text-blue-400",
  ready: "text-green-600 dark:text-green-400",
  failed: "text-red-600 dark:text-red-400",
};

export default async function DashboardPage() {
  const session = await getSession();
  if (!session.userId) {
    redirect("/auth/login");
  }

  const workspacesWithRepos = await listWorkspacesForUser(session.userId);

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Workspaces</h1>
            <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
              Signed in as{" "}
              <span className="font-medium text-[var(--foreground)]">
                {session.githubLogin}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <CreateWorkspaceButton />
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="rounded-lg border px-4 py-2 text-sm hover:bg-[var(--accent)] transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

        {/* Workspace list */}
        {workspacesWithRepos.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-[var(--muted)] p-4">
              <svg
                className="h-8 w-8 text-[var(--muted-foreground)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold">No workspaces yet</h2>
            <p className="max-w-sm text-sm text-[var(--muted-foreground)]">
              Create a workspace and connect a GitHub repository to start understanding your
              codebase with AI-powered Q&amp;A.
            </p>
            <CreateWorkspaceButton />
          </div>
        ) : (
          <div className="mt-8 grid gap-4">
            {workspacesWithRepos.map((ws) => {
              const repo = ws.repoConnections?.[0] ?? null;

              return (
                <Link
                  key={ws.id}
                  href={`/workspace/${ws.id}`}
                  className="block rounded-lg border p-5 transition-colors hover:bg-[var(--accent)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold">{ws.name}</h3>

                      {repo ? (
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-sm text-[var(--muted-foreground)]">
                            {repo.owner}/{repo.name}
                          </span>
                          <span
                            className={`text-xs font-medium ${
                              STATUS_COLORS[repo.status] ?? "text-[var(--muted-foreground)]"
                            }`}
                          >
                            · {STATUS_LABELS[repo.status] ?? repo.status}
                          </span>
                        </div>
                      ) : (
                        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                          No repository connected
                        </p>
                      )}
                    </div>

                    <time
                      dateTime={ws.createdAt.toISOString()}
                      className="shrink-0 text-xs text-[var(--muted-foreground)]"
                    >
                      {new Date(ws.createdAt).toLocaleDateString()}
                    </time>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
