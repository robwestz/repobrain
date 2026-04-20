"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

type OpenAIStatus = "connected" | "expired" | "not_connected" | "loading";

/**
 * Button/badge that shows OpenAI OAuth connection status and lets the user
 * connect or refresh their OpenAI account. Only renders when OPENAI_CLIENT_ID
 * is configured (the status endpoint returns 404 otherwise, which we treat as
 * "feature disabled").
 */
export function ConnectOpenAIButton() {
  const [status, setStatus] = useState<OpenAIStatus>("loading");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/auth/openai/status");
        if (!res.ok) {
          // Endpoint doesn't exist or feature not configured — hide button
          setHidden(true);
          return;
        }
        const data = await res.json();
        setStatus(data.status ?? "not_connected");
        setExpiresAt(data.expiresAt ?? null);
      } catch {
        setHidden(true);
      }
    }
    fetchStatus();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/auth/openai/refresh", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setStatus("connected");
        setExpiresAt(data.expiresAt ?? null);
      } else {
        // Refresh failed — user needs to re-authenticate
        setStatus("not_connected");
      }
    } catch {
      setStatus("not_connected");
    } finally {
      setRefreshing(false);
    }
  }

  if (hidden || status === "loading") return null;

  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-green-600/30 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 dark:border-green-500/30 dark:bg-green-950/40 dark:text-green-400">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        OpenAI connected
        {expiresAt && (
          <span className="text-green-600/60 dark:text-green-400/60">
            &middot; expires {new Date(expiresAt).toLocaleString()}
          </span>
        )}
      </span>
    );
  }

  if (status === "expired") {
    return (
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className="inline-flex items-center gap-1.5 rounded-lg border border-yellow-600/30 bg-yellow-50 px-3 py-1.5 text-xs font-medium text-yellow-700 transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50 dark:border-yellow-500/30 dark:bg-yellow-950/40 dark:text-yellow-400"
      >
        {refreshing ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Refreshing…
          </>
        ) : (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
            OpenAI expired — click to refresh
          </>
        )}
      </button>
    );
  }

  // not_connected
  return (
    <a
      href="/api/auth/openai"
      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--accent)]"
    >
      Connect OpenAI
    </a>
  );
}
