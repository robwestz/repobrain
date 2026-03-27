"use client";

import { useState, useCallback, useEffect } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { EmptyState } from "@/src/components/workspace/empty-state";
import { RepoPicker } from "@/src/components/workspace/repo-picker";
import { IndexProgress } from "@/src/components/workspace/index-progress";
import { FileTree } from "@/src/components/file-tree/file-tree";
import { TabBar, type OpenTab } from "@/src/components/code-viewer/tab-bar";
import { CodeViewer, type ThreadMarker } from "@/src/components/code-viewer/code-viewer";
import { ChatPane } from "@/src/components/chat/chat-pane";
import { SidebarNav } from "@/src/components/layout/sidebar-nav";
import { ThreadPanel, type ThreadWithComments } from "@/src/components/threads/thread-panel";
import { ThreadsList } from "@/src/components/threads/threads-list";

interface RepoInfo {
  id: string;
  owner: string;
  name: string;
  status: string;
  errorMessage: string | null;
  indexedCommitSha: string | null;
}

interface WorkspaceShellProps {
  workspaceId: string;
  workspaceName: string;
  initialRepo: RepoInfo | null;
  currentUserId?: string;
}

/**
 * Three-panel workspace layout.
 *
 * Left:   File tree (populated once repo is cloned/indexed)
 * Center: Code viewer with tab bar (one file per tab)
 * Right:  Chat pane (placeholder — wired by WS5)
 *
 * State owned here:
 * - repo connection lifecycle (pending → cloning → indexing → ready)
 * - open tabs + active tab
 * - citation highlight range (set when user clicks a citation in chat)
 * - prefill question (set when user clicks "Ask about this file")
 */
export function WorkspaceShell({
  workspaceId,
  workspaceName,
  initialRepo,
  currentUserId = "",
}: WorkspaceShellProps) {
  const [repo, setRepo] = useState<RepoInfo | null>(initialRepo);
  const [showRepoPicker, setShowRepoPicker] = useState(false);

  // Tab state
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [highlightRange, setHighlightRange] = useState<{ start: number; end: number } | null>(null);

  // Chat pre-fill (consumed by WS5 chat pane)
  const [prefillQuestion, setPrefillQuestion] = useState("");

  // Thread panel state
  const [activeThread, setActiveThread] = useState<ThreadWithComments | null>(null);
  const [showThreadsList, setShowThreadsList] = useState(false);
  const [threadMarkers, setThreadMarkers] = useState<ThreadMarker[]>([]);
  const [threadMarkersFile, setThreadMarkersFile] = useState<string | null>(null);
  const [threadMarkersRepoId, setThreadMarkersRepoId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Repo lifecycle callbacks
  // ---------------------------------------------------------------------------

  const handleConnected = useCallback(
    (conn: { id: string; owner: string; name: string; status: string }) => {
      setShowRepoPicker(false);
      setRepo({ id: conn.id, owner: conn.owner, name: conn.name, status: conn.status, errorMessage: null, indexedCommitSha: null });
    },
    [],
  );

  const handleReady = useCallback(() => {
    setRepo((prev) => (prev ? { ...prev, status: "ready" } : prev));
  }, []);

  // ---------------------------------------------------------------------------
  // File tab management
  // ---------------------------------------------------------------------------

  const openFile = useCallback(
    async (path: string, language: string | null) => {
      // If tab already exists, just switch to it
      setActiveTabPath(path);
      setHighlightRange(null);

      if (openTabs.some((t) => t.path === path)) return;

      // Add loading tab
      setOpenTabs((prev) => [
        ...prev,
        { path, language, content: null, loading: true },
      ]);

      // Fetch content
      try {
        const encodedPath = path.split("/").map(encodeURIComponent).join("/");
        const res = await fetch(
          `/api/workspaces/${workspaceId}/repos/${repo!.id}/files/${encodedPath}`,
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to load file");
        }
        const data = await res.json();
        setOpenTabs((prev) =>
          prev.map((t) =>
            t.path === path
              ? { ...t, content: data.content, language: data.language ?? language, loading: false }
              : t,
          ),
        );
      } catch (err) {
        setOpenTabs((prev) =>
          prev.map((t) =>
            t.path === path
              ? { ...t, loading: false, error: err instanceof Error ? err.message : "Error" }
              : t,
          ),
        );
      }
    },
    [openTabs, workspaceId, repo],
  );

  const closeTab = useCallback(
    (path: string) => {
      setOpenTabs((prev) => {
        const next = prev.filter((t) => t.path !== path);
        // If we closed the active tab, switch to the last remaining tab
        if (activeTabPath === path) {
          setActiveTabPath(next.length > 0 ? next[next.length - 1].path : null);
          setHighlightRange(null);
        }
        return next;
      });
    },
    [activeTabPath],
  );

  /**
   * Navigate to a specific file and line range (called by citation clicks in chat).
   */
  const navigateToCitation = useCallback(
    (filePath: string, startLine: number, endLine: number, language?: string | null) => {
      openFile(filePath, language ?? null);
      setHighlightRange({ start: startLine, end: endLine });
    },
    [openFile],
  );

  /**
   * "Ask about this file" button — pre-fills the chat input.
   */
  const handleAskAboutFile = useCallback((filePath: string) => {
    const filename = filePath.split("/").pop() ?? filePath;
    setPrefillQuestion(`Explain the purpose and structure of ${filename}`);
  }, []);

  // ---------------------------------------------------------------------------
  // Thread marker loading — fetch thread markers for active file
  // ---------------------------------------------------------------------------

  const loadThreadMarkersForFile = useCallback(
    async (filePath: string, repoId: string) => {
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/repos/${repoId}/threads?file=${encodeURIComponent(filePath)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        const markers: ThreadMarker[] = (data.threads ?? []).map(
          (t: {
            id: string;
            startLine: number;
            endLine: number;
            status: string;
            title: string;
            commentCount: number;
          }) => ({
            id: t.id,
            startLine: t.startLine,
            endLine: t.endLine,
            status: t.status as "open" | "resolved",
            title: t.title,
            commentCount: t.commentCount,
          }),
        );
        setThreadMarkers(markers);
        setThreadMarkersFile(filePath);
        setThreadMarkersRepoId(repoId);
      } catch {
        // silently ignore
      }
    },
    [workspaceId],
  );

  // Reload thread markers when active file changes
  useEffect(() => {
    if (activeTabPath && repo?.id) {
      loadThreadMarkersForFile(activeTabPath, repo.id);
    } else {
      setThreadMarkers([]);
    }
  }, [activeTabPath, repo?.id, loadThreadMarkersForFile]);

  // ---------------------------------------------------------------------------
  // Thread panel handlers
  // ---------------------------------------------------------------------------

  const handleThreadMarkerClick = useCallback(
    async (threadId: string) => {
      if (!repo) return;
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/repos/${repo.id}/threads/${threadId}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        setActiveThread(data.thread);
        setShowThreadsList(false);
      } catch {
        // silently ignore
      }
    },
    [workspaceId, repo],
  );

  const handleThreadsListClick = useCallback(
    async (thread: { id: string; filePath: string }) => {
      if (!repo) return;
      // Navigate to file if different
      await openFile(thread.filePath, null);
      // Fetch full thread
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/repos/${repo.id}/threads/${thread.id}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        setActiveThread(data.thread);
        setShowThreadsList(false);
      } catch {
        // silently ignore
      }
    },
    [workspaceId, repo, openFile],
  );

  const handleThreadCreated = useCallback(() => {
    if (activeTabPath && repo?.id) {
      loadThreadMarkersForFile(activeTabPath, repo.id);
    }
  }, [activeTabPath, repo?.id, loadThreadMarkersForFile]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const isInProgress =
    repo &&
    (repo.status === "pending" ||
      repo.status === "cloning" ||
      repo.status === "indexing");
  const isReady = repo && repo.status === "ready";
  const isFailed = repo && repo.status === "failed";

  const activeTab = openTabs.find((t) => t.path === activeTabPath) ?? null;

  const statusLabel = repo
    ? repo.status === "ready"
      ? `${repo.owner}/${repo.name}`
      : repo.status === "cloning"
        ? `Cloning ${repo.owner}/${repo.name}…`
        : repo.status === "indexing"
          ? `Indexing ${repo.owner}/${repo.name}…`
          : repo.status === "failed"
            ? `${repo.owner}/${repo.name} — failed`
            : `${repo.owner}/${repo.name}`
    : "No repository connected";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-screen">
      <SidebarNav workspaceId={workspaceId} />
      <div className="flex flex-1 flex-col min-w-0">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 min-w-0">
          <a
            href="/dashboard"
            className="shrink-0 font-semibold text-sm hover:opacity-70 transition-opacity"
          >
            RepoBrain
          </a>
          <span className="shrink-0 text-[var(--muted-foreground)]">/</span>
          <span className="truncate text-sm text-[var(--muted-foreground)]">
            {workspaceName}
          </span>
          {repo && (
            <>
              <span className="shrink-0 text-[var(--muted-foreground)]">/</span>
              <span className="truncate text-sm text-[var(--muted-foreground)]">
                {repo.owner}/{repo.name}
              </span>
            </>
          )}
        </div>
      </header>

      {/* Three-panel layout */}
      <PanelGroup direction="horizontal" className="flex-1 overflow-hidden">
        {/* ── Left panel: File tree ── */}
        <Panel defaultSize={20} minSize={15} maxSize={35}>
          <div className="flex h-full flex-col border-r">
            <div className="flex h-10 shrink-0 items-center border-b px-3">
              <span className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                Files
              </span>
            </div>

            {isReady && repo ? (
              <FileTree
                workspaceId={workspaceId}
                repoId={repo.id}
                selectedPath={activeTabPath}
                onSelectFile={openFile}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-4">
                <p className="text-center text-xs text-[var(--muted-foreground)]">
                  {repo ? "Indexing in progress…" : "Connect a repository to browse files"}
                </p>
              </div>
            )}
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-[var(--border)] hover:bg-[var(--muted-foreground)] transition-colors cursor-col-resize" />

        {/* ── Center panel: Code viewer / connection flow ── */}
        <Panel defaultSize={50} minSize={30}>
          <div className="flex h-full flex-col">
            {/* Tab bar (only when tabs are open) */}
            {isReady && openTabs.length > 0 ? (
              <TabBar
                tabs={openTabs}
                activeTabPath={activeTabPath}
                onSelectTab={setActiveTabPath}
                onCloseTab={closeTab}
              />
            ) : (
              <div className="flex h-9 shrink-0 items-center border-b px-3">
                <span className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                  Code
                </span>
              </div>
            )}

            {/* Main content area */}
            {!repo && <EmptyState onConnectRepo={() => setShowRepoPicker(true)} />}

            {isInProgress && (
              <IndexProgress
                workspaceId={workspaceId}
                repoId={repo.id}
                repoName={`${repo.owner}/${repo.name}`}
                initialStatus={repo.status}
                onReady={handleReady}
              />
            )}

            {isFailed && (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="max-w-sm">
                  <h3 className="font-semibold text-red-600 dark:text-red-400">
                    Repository connection failed
                  </h3>
                  <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                    {repo.errorMessage ?? "An unknown error occurred while cloning the repository."}
                  </p>
                </div>
                <button
                  onClick={() => setShowRepoPicker(true)}
                  className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--accent)]"
                >
                  Try another repository
                </button>
              </div>
            )}

            {isReady && !activeTab && (
              <div className="flex flex-1 items-center justify-center p-8">
                <div className="text-center">
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Select a file from the tree or ask a question to get started
                  </p>
                </div>
              </div>
            )}

            {isReady && activeTab && (
              <div className="flex-1 overflow-hidden">
                {activeTab.loading ? (
                  <div className="flex h-full items-center justify-center">
                    <span className="text-xs text-[var(--muted-foreground)]">Loading…</span>
                  </div>
                ) : activeTab.error ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                    <p className="text-sm text-red-500">{activeTab.error}</p>
                    <button
                      onClick={() => openFile(activeTab.path, activeTab.language)}
                      className="text-xs text-[var(--muted-foreground)] underline"
                    >
                      Retry
                    </button>
                  </div>
                ) : activeTab.content !== null ? (
                  <CodeViewer
                    filePath={activeTab.path}
                    content={activeTab.content}
                    language={activeTab.language}
                    highlightRange={highlightRange}
                    onAskAboutFile={handleAskAboutFile}
                    workspaceId={workspaceId}
                    repoId={repo?.id}
                    threadMarkers={
                      threadMarkersFile === activeTab.path &&
                      threadMarkersRepoId === repo?.id
                        ? threadMarkers
                        : []
                    }
                    onThreadMarkerClick={handleThreadMarkerClick}
                    onThreadCreated={handleThreadCreated}
                  />
                ) : null}
              </div>
            )}
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-[var(--border)] hover:bg-[var(--muted-foreground)] transition-colors cursor-col-resize" />

        {/* ── Right panel: Chat ── */}
        <Panel defaultSize={30} minSize={20} maxSize={45}>
          <div className="flex h-full flex-col border-l">
            <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
              <span className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                Chat
              </span>
              {isReady && repo && (
                <button
                  onClick={() => {
                    setShowThreadsList((v) => !v);
                    setActiveThread(null);
                  }}
                  title="View all discussions"
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                    showThreadsList
                      ? "bg-indigo-600 text-white"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]"
                  }`}
                >
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                    <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
                  </svg>
                  Discussions
                </button>
              )}
            </div>

            <ChatPane
              workspaceId={workspaceId}
              repoConnectionId={repo?.id ?? null}
              disabled={!isReady}
              prefillQuestion={prefillQuestion}
              onPrefillUsed={() => setPrefillQuestion("")}
              onCitationNavigate={navigateToCitation}
              activeFilePath={activeTabPath}
            />
          </div>
        </Panel>
      </PanelGroup>

      {/* Bottom status bar */}
      <footer className="flex h-7 shrink-0 items-center justify-between border-t px-3 text-xs text-[var(--muted-foreground)]">
        <span>{statusLabel}</span>
        <span>RepoBrain v0.1</span>
      </footer>

      {/* Repo picker dialog */}
      {showRepoPicker && (
        <RepoPicker
          workspaceId={workspaceId}
          onClose={() => setShowRepoPicker(false)}
          onConnected={handleConnected}
        />
      )}

      {/* Thread panel slide-over (from right) */}
      {(activeThread || showThreadsList) && (
        <>
          {/* Backdrop — clicking closes the panel */}
          <div
            className="fixed inset-0 z-30 bg-black/20"
            onClick={() => {
              setActiveThread(null);
              setShowThreadsList(false);
            }}
            aria-hidden
          />

          {/* Slide-over panel */}
          <div className="fixed right-0 top-0 z-40 flex h-full w-80 flex-col border-l bg-[var(--background)] shadow-2xl">
            {/* Panel header */}
            <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
              <span className="text-sm font-semibold">
                {activeThread ? "Discussion" : "Discussions"}
              </span>
              <div className="flex items-center gap-2">
                {activeThread && (
                  <button
                    onClick={() => {
                      setActiveThread(null);
                      setShowThreadsList(true);
                    }}
                    className="text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] underline"
                  >
                    All discussions
                  </button>
                )}
                <button
                  onClick={() => {
                    setActiveThread(null);
                    setShowThreadsList(false);
                  }}
                  className="rounded p-1 text-[var(--muted-foreground)] hover:text-foreground hover:bg-[var(--accent)] transition-colors"
                  aria-label="Close panel"
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                    <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-hidden">
              {activeThread && repo ? (
                <ThreadPanel
                  thread={activeThread}
                  workspaceId={workspaceId}
                  repoId={repo.id}
                  currentUserId={currentUserId}
                  onClose={() => setActiveThread(null)}
                  onCommentAdded={(updated) => setActiveThread(updated)}
                  onStatusChanged={(updated) => {
                    setActiveThread(updated);
                    if (activeTabPath && repo?.id) {
                      loadThreadMarkersForFile(activeTabPath, repo.id);
                    }
                  }}
                  onDeleted={() => {
                    setActiveThread(null);
                    if (activeTabPath && repo?.id) {
                      loadThreadMarkersForFile(activeTabPath, repo.id);
                    }
                  }}
                />
              ) : repo ? (
                <ThreadsList
                  workspaceId={workspaceId}
                  repoId={repo.id}
                  onThreadClick={handleThreadsListClick}
                />
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
    </div>
  );
}
