"use client";

/**
 * StreamingIndicator — three animated dots shown while the LLM is generating.
 */
export function StreamingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1" aria-label="Generating…">
      <span
        className="h-1.5 w-1.5 rounded-full bg-[var(--muted-foreground)] animate-bounce"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-[var(--muted-foreground)] animate-bounce"
        style={{ animationDelay: "150ms" }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-[var(--muted-foreground)] animate-bounce"
        style={{ animationDelay: "300ms" }}
      />
    </div>
  );
}
