export function PageLoading({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
      <div
        className="h-6 w-6 rounded-full border-2 border-[var(--border)] border-t-[var(--muted-foreground)] animate-spin"
        aria-hidden="true"
      />
      <p className="text-sm text-[var(--muted-foreground)]">{title}</p>
    </div>
  );
}
