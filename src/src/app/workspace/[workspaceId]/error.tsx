"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function WorkspaceError({ error, reset }: ErrorPageProps) {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params?.workspaceId ?? "";

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-8 max-w-md w-full">
        <h1 className="text-lg font-semibold text-[var(--foreground)]">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          {error.message || "An unexpected error occurred in this workspace."}
        </p>
        {error.digest && (
          <p className="mt-1 text-xs text-[var(--muted-foreground)] font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--accent)] text-[var(--foreground)]"
          >
            Try again
          </button>
          {workspaceId ? (
            <Link
              href={`/workspace/${workspaceId}`}
              className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--accent)] text-[var(--foreground)]"
            >
              Go back
            </Link>
          ) : (
            <Link
              href="/dashboard"
              className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--accent)] text-[var(--foreground)]"
            >
              Dashboard
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
