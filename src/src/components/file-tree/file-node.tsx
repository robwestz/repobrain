"use client";

import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
} from "lucide-react";
import type { FileTreeNode } from "@/src/app/api/workspaces/[workspaceId]/repos/[repoId]/files/route";

interface FileNodeProps {
  node: FileTreeNode;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string, language: string | null) => void;
}

export function FileNode({ node, depth, selectedPath, onSelectFile }: FileNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);

  const indent = depth * 12;

  if (node.type === "directory") {
    return (
      <div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-1 rounded px-2 py-0.5 text-left text-sm hover:bg-[var(--accent)] transition-colors"
          style={{ paddingLeft: `${8 + indent}px` }}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]" />
          )}
          {expanded ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400" />
          )}
          <span className="truncate text-xs font-medium">{node.name}</span>
        </button>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
              <FileNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isSelected = selectedPath === node.path;

  return (
    <button
      onClick={() => onSelectFile(node.path, node.language ?? null)}
      className={`flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-left text-xs transition-colors ${
        isSelected
          ? "bg-[var(--accent)] text-[var(--accent-foreground)] font-medium"
          : "hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      }`}
      style={{ paddingLeft: `${20 + indent}px` }}
      title={node.path}
    >
      <File className="h-3 w-3 shrink-0" />
      <span className="truncate">{node.name}</span>
      {node.lineCount && node.lineCount > 0 ? (
        <span className="ml-auto shrink-0 text-[10px] opacity-50">{node.lineCount}</span>
      ) : null}
    </button>
  );
}
