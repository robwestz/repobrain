"use client";

import { X } from "lucide-react";

export interface OpenTab {
  path: string;
  language: string | null;
  content: string | null;
  loading: boolean;
  error?: string;
}

interface TabBarProps {
  tabs: OpenTab[];
  activeTabPath: string | null;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
}

export function TabBar({ tabs, activeTabPath, onSelectTab, onCloseTab }: TabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div className="flex h-9 shrink-0 items-center overflow-x-auto border-b bg-[var(--muted)]/30">
      {tabs.map((tab) => {
        const filename = tab.path.split("/").pop() ?? tab.path;
        const isActive = tab.path === activeTabPath;

        return (
          <div
            key={tab.path}
            className={`flex h-full shrink-0 cursor-pointer items-center gap-1.5 border-r px-3 text-xs transition-colors ${
              isActive
                ? "bg-[var(--background)] text-[var(--foreground)] border-b border-b-[var(--background)]"
                : "text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
            }`}
            style={{ minWidth: 0, maxWidth: "200px" }}
            onClick={() => onSelectTab(tab.path)}
            title={tab.path}
          >
            <span className="truncate font-mono">{filename}</span>
            {tab.loading && (
              <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-current opacity-50 animate-pulse" />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.path);
              }}
              className="ml-1 shrink-0 rounded p-0.5 opacity-50 hover:opacity-100 hover:bg-[var(--accent)] transition-all"
              aria-label={`Close ${filename}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
