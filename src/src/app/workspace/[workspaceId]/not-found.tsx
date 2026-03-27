import Link from "next/link";

export default function WorkspaceNotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-8 max-w-md w-full">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
          404
        </p>
        <h1 className="mt-2 text-lg font-semibold text-[var(--foreground)]">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            href="/dashboard"
            className="inline-block rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--accent)] text-[var(--foreground)]"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
