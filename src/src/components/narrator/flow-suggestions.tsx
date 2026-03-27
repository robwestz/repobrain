"use client";

import type { SuggestedFlow } from "@/src/modules/narrator/suggestions";

interface FlowSuggestionsProps {
  suggestions: SuggestedFlow[];
  onSelect: (suggestion: SuggestedFlow) => void;
  isLoading: boolean;
}

export function FlowSuggestions({ suggestions, onSelect, isLoading }: FlowSuggestionsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-lg border border-[var(--border)] bg-[var(--muted)] p-4 h-24"
          />
        ))}
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)] italic">
        No suggestions available yet. Make sure the repository has been indexed.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {suggestions.map((suggestion, idx) => (
        <button
          key={`${suggestion.entrySymbol}-${idx}`}
          onClick={() => onSelect(suggestion)}
          className="group flex flex-col items-start rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 text-left transition-all hover:border-blue-500/50 hover:bg-blue-500/5 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <div className="flex w-full items-start justify-between gap-2">
            <span className="font-medium text-sm text-[var(--foreground)] group-hover:text-blue-500 transition-colors">
              {suggestion.title}
            </span>
            <span className="shrink-0 rounded bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted-foreground)]">
              {suggestion.entrySymbol}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-[var(--muted-foreground)] line-clamp-2">
            {suggestion.description}
          </p>
          <p className="mt-2 truncate font-mono text-[10px] text-[var(--muted-foreground)] opacity-60 max-w-full">
            {suggestion.entryFile.split("/").slice(-2).join("/")}
          </p>
        </button>
      ))}
    </div>
  );
}
