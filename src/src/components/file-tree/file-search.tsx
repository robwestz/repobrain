"use client";

import { Search, X } from "lucide-react";

interface FileSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function FileSearch({ value, onChange }: FileSearchProps) {
  return (
    <div className="relative flex items-center">
      <Search className="absolute left-2 h-3.5 w-3.5 text-[var(--muted-foreground)] pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter files…"
        className="w-full rounded border border-[var(--border)] bg-transparent py-1 pl-7 pr-6 text-xs outline-none focus:border-[var(--ring)] placeholder:text-[var(--muted-foreground)]"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          aria-label="Clear filter"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
