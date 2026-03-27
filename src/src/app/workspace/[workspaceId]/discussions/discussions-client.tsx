"use client";

import { useState } from "react";
import { ThreadsList } from "@/src/components/threads/threads-list";
import { ThreadPanel, type ThreadWithComments } from "@/src/components/threads/thread-panel";

interface DiscussionsPageClientProps {
  workspaceId: string;
  repoId: string;
}

export function DiscussionsPageClient({ workspaceId, repoId }: DiscussionsPageClientProps) {
  const [activeThread, setActiveThread] = useState<ThreadWithComments | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function handleThreadClick(thread: { id: string }) {
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/repos/${repoId}/threads/${thread.id}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      setActiveThread(data.thread);
    } catch {
      // silently ignore
    }
  }

  function refresh() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="flex h-full">
      {/* Left: thread list */}
      <div className="w-80 shrink-0 border-r overflow-hidden flex flex-col">
        <div className="flex h-10 shrink-0 items-center border-b px-4">
          <span className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
            All Threads
          </span>
        </div>
        <div className="flex-1 overflow-hidden">
          <ThreadsList
            key={refreshKey}
            workspaceId={workspaceId}
            repoId={repoId}
            onThreadClick={handleThreadClick}
          />
        </div>
      </div>

      {/* Right: thread detail or empty state */}
      <div className="flex-1 overflow-hidden">
        {activeThread ? (
          <ThreadPanel
            thread={activeThread}
            workspaceId={workspaceId}
            repoId={repoId}
            currentUserId=""
            onClose={() => setActiveThread(null)}
            onCommentAdded={(updated) => setActiveThread(updated)}
            onStatusChanged={(updated) => {
              setActiveThread(updated);
              refresh();
            }}
            onDeleted={() => {
              setActiveThread(null);
              refresh();
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-[var(--muted-foreground)]">
                Select a discussion to view it
              </p>
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                Start discussions by hovering line numbers in the code viewer
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
