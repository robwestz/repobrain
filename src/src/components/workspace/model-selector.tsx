"use client";

/**
 * ModelSelector — dropdown for choosing LLM provider and model.
 *
 * - Fetches available providers from GET /api/llm/providers on mount.
 * - Persists selection in localStorage under the key "repobrain:llm-selection".
 * - Calls onChange when the user picks a different provider/model.
 * - Shows a small dot indicating the active provider (green when ready).
 */

import { useState, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProviderInfo {
  models: string[];
  defaultModel: string;
  isDefault: boolean;
}

interface ProvidersResponse {
  defaultProvider: string;
  providers: Record<string, ProviderInfo>;
}

export interface LLMSelection {
  provider: string;
  model: string;
}

interface ModelSelectorProps {
  onChange?: (selection: LLMSelection) => void;
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "repobrain:llm-selection";

function loadStoredSelection(): LLMSelection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { provider?: unknown; model?: unknown };
    if (typeof parsed.provider === "string" && typeof parsed.model === "string") {
      return { provider: parsed.provider, model: parsed.model };
    }
  } catch {
    // malformed — ignore
  }
  return null;
}

function saveSelection(sel: LLMSelection): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sel));
  } catch {
    // storage quota exceeded — ignore
  }
}

// ---------------------------------------------------------------------------
// Provider label helpers
// ---------------------------------------------------------------------------

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  ollama: "Ollama",
};

function providerLabel(name: string): string {
  return PROVIDER_LABELS[name] ?? name;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ModelSelector({ onChange }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ProvidersResponse | null>(null);
  const [selection, setSelection] = useState<LLMSelection | null>(null);
  const [error, setError] = useState(false);

  // Fetch available providers once on mount
  useEffect(() => {
    let cancelled = false;
    fetch("/api/llm/providers")
      .then((r) => r.json() as Promise<ProvidersResponse>)
      .then((d) => {
        if (cancelled) return;
        setData(d);

        // Resolve initial selection: stored > default provider/model
        const stored = loadStoredSelection();
        const providerNames = Object.keys(d.providers);
        let initial: LLMSelection;

        if (stored && d.providers[stored.provider]?.models.includes(stored.model)) {
          initial = stored;
        } else {
          const defaultProvider = d.defaultProvider;
          const defaultInfo = d.providers[defaultProvider];
          if (defaultInfo) {
            initial = { provider: defaultProvider, model: defaultInfo.defaultModel };
          } else if (providerNames.length > 0) {
            const firstProvider = providerNames[0];
            initial = { provider: firstProvider, model: d.providers[firstProvider].defaultModel };
          } else {
            // No providers available
            return;
          }
        }

        setSelection(initial);
        saveSelection(initial);
        onChange?.(initial);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = useCallback(
    (provider: string, model: string) => {
      const next: LLMSelection = { provider, model };
      setSelection(next);
      saveSelection(next);
      onChange?.(next);
      setOpen(false);
    },
    [onChange],
  );

  // Not loaded yet — render nothing (avoids layout shift)
  if (!data || !selection) {
    return null;
  }

  if (error || Object.keys(data.providers).length === 0) {
    return (
      <span className="text-xs text-[var(--muted-foreground)] opacity-60">
        No LLM
      </span>
    );
  }

  const providerNames = Object.keys(data.providers);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
        title="Select LLM provider and model"
      >
        {/* Active dot */}
        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />

        {/* Label: Provider / Model */}
        <span className="truncate max-w-[140px]">
          {providerLabel(selection.provider)} / {selection.model}
        </span>

        {/* Chevron */}
        <svg
          className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />

          {/* Dropdown panel */}
          <div className="absolute right-0 top-full z-20 mt-1 min-w-[220px] rounded-lg border bg-[var(--background)] shadow-lg">
            {providerNames.map((pName) => {
              const pInfo = data.providers[pName];
              return (
                <div key={pName}>
                  {/* Provider header */}
                  <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider border-b">
                    {providerLabel(pName)}
                  </div>

                  {/* Model list */}
                  <div className="p-1">
                    {pInfo.models.map((mName) => {
                      const isActive =
                        selection.provider === pName && selection.model === mName;
                      return (
                        <button
                          key={mName}
                          onClick={() => choose(pName, mName)}
                          className={`flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm transition-colors hover:bg-[var(--accent)] ${
                            isActive ? "bg-[var(--accent)] font-medium" : ""
                          }`}
                        >
                          <span className="flex-1 truncate">{mName}</span>
                          {mName === pInfo.defaultModel && !isActive && (
                            <span className="text-[10px] text-[var(--muted-foreground)] opacity-60 shrink-0">
                              default
                            </span>
                          )}
                          {isActive && (
                            <svg
                              className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2.5}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
