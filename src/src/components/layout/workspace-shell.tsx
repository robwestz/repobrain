"use client";

import { useState, useCallback } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { EmptyState } from "@/src/components/workspace/empty-state";
import { RepoPicker } from "@/src/components/workspace/repo-picker";
import { IndexProgress } from "@/src/components/workspace/index-progress";
import { FileTree } from "@/src/components/file-tree/file-tree";
import { TabBar, type OpenTab } from "@/src/components/code-viewer/tab-bar";
import { CodeViewer } from "@/src/components/code-viewer/code-viewer";
import { ChatPane } from "@/src/components/chat/chat-pane";
import { Breadcrumbs } from "@/src/components/layout/breadcrumbs";
import { SidebarNav } from "@/src/components/layout/sidebar-nav";
import { RepoSwitcher } from "@/src/components/workspace/repo-switcher";

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
  /** All repos connected to this workspace (for multi-repo switcher) */
  initialRepos?: RepoInfo[];
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
  initialRepos,
}: WorkspaceShellProps) {
  const [repo, setRepo] = useState<RepoInfo | null>(initialRepo);
  const [repos, setRepos] = useState<RepoInfo[]>(initialRepos ?? (initialRepo ? [initialRepo] : []));
  const [showRepoPicker, setShowRepoPicker] = useState(false);

  // Tab state
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [highlightRange, setHighlightRange] = useState<{ start: number; end: number } | null>(null);

  // Chat pre-fill (consumed by WS5 chat pane)
  const [prefillQuestion, setPrefillQuestion] = useState("");

  // ---------------------------------------------------------------------------
  // Repo lifecycle callbacks
  // ---------------------------------------------------------------------------

  const handleConnected = useCallback(
    (conn: { id: string; owner: string; name: string; status: string }) => {
      setShowRepoPicker(false);
      const newRepo: RepoInfo = { id: conn.id, owner: conn.owner, name: conn.name, status: conn.status, errorMessage: null, indexedCommitSha: null };
      setRepo(newRepo);
      setRepos((prev) => {
        const exists = prev.some((r) => r.id === conn.id);
        return exists ? prev : [...prev, newRepo];
      });
    },
    [],
  );

  const handleSwitchRepo = useCallback((repoId: string) => {
    const target = repos.find((r) => r.id === repoId);
    if (target) {
      setRepo(target);
      // Close any open tabs when switching repos (they belong to the old repo)
      setOpenTabs([]);
      setActiveTabPath(null);
      setHighlightRange(null);
    }
  }, [repos]);

  const handleReady = useCallback(() => {
    setRepo((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, status: "ready" };
      setRepos((prevRepos) =>
        prevRepos.map((r) => (r.id === prev.id ? updated : r)),
      );
      return updated;
    });
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

  const repoCountLabel = repos.length > 1 ? ` (+${repos.length - 1} more)` : "";
  const statusLabel = repo
    ? repo.status === "ready"
      ? `${repo.owner}/${repo.name}${repoCountLabel}`
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
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b px-4">
        <Breadcrumbs
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          repoOwner={repos.length <= 1 ? repo?.owner : undefined}
          repoName={repos.length <= 1 ? repo?.name : undefined}
          repoSegment={
            repos.length > 1 ? (
              <RepoSwitcher
                repos={repos}
                activeRepoId={repo?.id ?? null}
                onSwitch={handleSwitchRepo}
                onAddRepo={() => setShowRepoPicker(true)}
              />
            ) : undefined
          }
          activeFilePath={activeTabPath ?? undefined}
        />
        {repos.length >= 2 && (
          <a
            href={`/workspace/${workspaceId}/cross-repo`}
            className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Cross-Repo
          </a>
        )}
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
            <div className="flex h-10 shrink-0 items-center border-b px-3">
              <span className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                Chat
              </span>
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
    </div>
    </div>
  );
}
