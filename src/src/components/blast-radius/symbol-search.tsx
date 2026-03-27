"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export interface SymbolResult {
  id: string;
  name: string;
  kind: string;
  filePath: string;
  startLine: number;
  endLine: number;
}

interface SymbolSearchProps {
  repoConnectionId: string;
  workspaceId: string;
  onSelect: (symbol: SymbolResult) => void;
  placeholder?: string;
}

const KIND_COLORS: Record<string, string> = {
  function: "text-blue-400",
  method: "text-blue-300",
  class: "text-purple-400",
  interface: "text-teal-400",
  type: "text-teal-300",
  variable: "text-yellow-300",
  constant: "text-orange-300",
  enum: "text-green-400",
  module: "text-gray-400",
};

function kindColor(kind: string): string {
  return KIND_COLORS[kind.toLowerCase()] ?? "text-gray-400";
}

export function SymbolSearch({
  repoConnectionId,
  workspaceId,
  onSelect,
  placeholder = "Search for a function, class, or file…",
}: SymbolSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSymbols = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        setOpen(false);
        return;
      }

      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      try {
        const url = `/api/workspaces/${workspaceId}/repos/${repoConnectionId}/symbols?q=${encodeURIComponent(q)}&limit=10`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        setResults(data.symbols ?? []);
        setOpen(true);
        setActiveIndex(-1);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, repoConnectionId],
  );

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSymbols(query);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, fetchSymbols]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
      e.preventDefault();
      handleSelect(results[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function handleSelect(sym: SymbolResult) {
    setQuery(sym.name);
    setOpen(false);
    setResults([]);
    onSelect(sym);
  }

  // Shorten file path for display
  function shortPath(filePath: string): string {
    const parts = filePath.split("/");
    if (parts.length <= 3) return filePath;
    return "…/" + parts.slice(-2).join("/");
  }

  return (
    <div className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          placeholder={placeholder}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 pr-10 text-sm outline-none focus:border-[var(--ring)] focus:ring-1 focus:ring-[var(--ring)] placeholder:text-[var(--muted-foreground)]"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
          {loading ? (
            <svg
              className="h-4 w-4 animate-spin text-[var(--muted-foreground)]"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <svg
              className="h-4 w-4 text-[var(--muted-foreground)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" strokeLinecap="round" />
            </svg>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute top-full z-50 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg"
        >
          <ul className="max-h-64 overflow-y-auto py-1">
            {results.map((sym, i) => (
              <li key={sym.id}>
                <button
                  type="button"
                  className={`flex w-full items-start gap-3 px-4 py-2 text-left transition-colors hover:bg-[var(--accent)] ${
                    i === activeIndex ? "bg-[var(--accent)]" : ""
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault(); // prevent blur before click
                    handleSelect(sym);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <span
                    className={`mt-0.5 font-mono text-[10px] font-medium uppercase tracking-wide ${kindColor(sym.kind)}`}
                  >
                    {sym.kind}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{sym.name}</div>
                    <div
                      className="truncate text-[11px] text-[var(--muted-foreground)]"
                      title={sym.filePath}
                    >
                      {shortPath(sym.filePath)}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {open && !loading && results.length === 0 && query.trim().length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute top-full z-50 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg"
        >
          <div className="px-4 py-3 text-sm text-[var(--muted-foreground)]">
            No symbols found for &ldquo;{query}&rdquo;
          </div>
        </div>
      )}
    </div>
  );
}
