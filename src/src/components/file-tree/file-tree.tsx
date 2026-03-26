"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { FileNode } from "./file-node";
import { FileSearch } from "./file-search";
import type { FileTreeNode } from "@/src/app/api/workspaces/[workspaceId]/repos/[repoId]/files/route";

interface FileTreeProps {
  workspaceId: string;
  repoId: string;
  selectedPath: string | null;
  onSelectFile: (path: string, language: string | null) => void;
}

/** Flatten tree to a list of file nodes (depth-first). */
function flattenFiles(nodes: FileTreeNode[]): FileTreeNode[] {
  const result: FileTreeNode[] = [];
  for (const node of nodes) {
    if (node.type === "file") {
      result.push(node);
    } else if (node.children) {
      result.push(...flattenFiles(node.children));
    }
  }
  return result;
}

export function FileTree({ workspaceId, repoId, selectedPath, onSelectFile }: FileTreeProps) {
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/repos/${repoId}/files`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load file tree");
      }
      const data = await res.json();
      setTree(data.tree ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, repoId]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  // When search is active, render a flat filtered list
  const searchTerm = search.trim().toLowerCase();
  const allFiles = searchTerm ? flattenFiles(tree) : [];
  const filteredFiles = searchTerm
    ? allFiles.filter((f) => f.path.toLowerCase().includes(searchTerm))
    : [];

  return (
    <div className="flex h-full flex-col">
      {/* Search bar */}
      <div className="shrink-0 border-b px-2 py-2">
        <FileSearch value={search} onChange={setSearch} />
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <div className="flex items-center justify-center p-4">
            <RefreshCw className="h-4 w-4 animate-spin text-[var(--muted-foreground)]" />
          </div>
        ) : error ? (
          <div className="p-3 text-center">
            <p className="text-xs text-red-500">{error}</p>
            <button
              onClick={loadTree}
              className="mt-2 text-xs text-[var(--muted-foreground)] underline hover:text-[var(--foreground)]"
            >
              Retry
            </button>
          </div>
        ) : searchTerm ? (
          filteredFiles.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-[var(--muted-foreground)]">
              No files match &ldquo;{search}&rdquo;
            </p>
          ) : (
            <div>
              {filteredFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => onSelectFile(file.path, file.language ?? null)}
                  className={`flex w-full items-center gap-2 px-3 py-1 text-left text-xs transition-colors ${
                    selectedPath === file.path
                      ? "bg-[var(--accent)] font-medium"
                      : "hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                  title={file.path}
                >
                  <span className="truncate font-mono">{file.path}</span>
                </button>
              ))}
            </div>
          )
        ) : tree.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-[var(--muted-foreground)]">
            No files found
          </p>
        ) : (
          <div>
            {tree.map((node) => (
              <FileNode
                key={node.path}
                node={node}
                depth={0}
                selectedPath={selectedPath}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer: file count */}
      {!loading && !error && tree.length > 0 && !searchTerm && (
        <div className="shrink-0 border-t px-3 py-1.5">
          <span className="text-[10px] text-[var(--muted-foreground)]">
            {flattenFiles(tree).length} files
          </span>
        </div>
      )}
    </div>
  );
}
