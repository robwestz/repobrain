"use client";

import type { EnrichedEndpoint } from "@/src/modules/api-map/analyzer";

interface EndpointCardProps {
  endpoint: EnrichedEndpoint;
  isSelected: boolean;
  onSelect: (endpoint: EnrichedEndpoint) => void;
}

const METHOD_STYLES: Record<string, string> = {
  GET: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  POST: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  PUT: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  PATCH: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  DELETE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  ALL: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
};

export function EndpointCard({ endpoint, isSelected, onSelect }: EndpointCardProps) {
  const methodStyle = METHOD_STYLES[endpoint.method] ?? METHOD_STYLES.ALL;

  return (
    <button
      type="button"
      onClick={() => onSelect(endpoint)}
      className={[
        "w-full text-left flex items-start gap-2 px-3 py-2 rounded-md transition-colors",
        isSelected
          ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
          : "hover:bg-[var(--muted)] text-[var(--foreground)]",
      ].join(" ")}
    >
      {/* Method badge */}
      <span
        className={[
          "shrink-0 mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
          methodStyle,
        ].join(" ")}
      >
        {endpoint.method}
      </span>

      {/* Path + description */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-mono font-medium leading-tight">
          {endpoint.path}
        </p>
        {endpoint.description && (
          <p className="mt-0.5 truncate text-[11px] text-[var(--muted-foreground)] leading-tight">
            {endpoint.description}
          </p>
        )}
      </div>

      {/* Auth indicator */}
      {endpoint.authRequired && (
        <span
          className="shrink-0 mt-0.5 text-[10px] text-amber-600 dark:text-amber-400"
          title="Auth required"
        >
          🔒
        </span>
      )}
    </button>
  );
}
