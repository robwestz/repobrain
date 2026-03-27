"use client";

import type { GraphNode, GraphEdge } from "@/src/modules/dependency-graph/builder";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_BADGE_COLORS: Record<string, string> = {
  module: "bg-indigo-500/20 text-indigo-300",
  file: "bg-sky-500/20 text-sky-300",
  class: "bg-emerald-500/20 text-emerald-300",
  function: "bg-amber-500/20 text-amber-300",
  method: "bg-orange-500/20 text-orange-300",
  interface: "bg-purple-500/20 text-purple-300",
  type: "bg-rose-500/20 text-rose-300",
  route: "bg-teal-500/20 text-teal-300",
};

function TypeBadge({ type }: { type: string }) {
  const cls = TYPE_BADGE_COLORS[type] ?? "bg-neutral-500/20 text-neutral-300";
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NodeDetailProps {
  node: GraphNode;
  edges: GraphEdge[];
  allNodes: GraphNode[];
  workspaceId: string;
  repoId: string;
  onClose: () => void;
  onFocusNode: (nodeId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NodeDetail({
  node,
  edges,
  allNodes,
  workspaceId,
  repoId,
  onClose,
  onFocusNode,
}: NodeDetailProps) {
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

  const incomingEdges = edges.filter((e) => {
    const target = typeof e.target === "object"
      ? (e.target as GraphNode).id
      : e.target;
    return target === node.id;
  });

  const outgoingEdges = edges.filter((e) => {
    const source = typeof e.source === "object"
      ? (e.source as GraphNode).id
      : e.source;
    return source === node.id;
  });

  // Group by relation type
  const inByType = new Map<string, GraphNode[]>();
  for (const e of incomingEdges) {
    const sourceId = typeof e.source === "object"
      ? (e.source as GraphNode).id
      : e.source;
    const sourceNode = nodeMap.get(sourceId as string);
    if (!sourceNode) continue;
    const arr = inByType.get(e.type) ?? [];
    arr.push(sourceNode);
    inByType.set(e.type, arr);
  }

  const outByType = new Map<string, GraphNode[]>();
  for (const e of outgoingEdges) {
    const targetId = typeof e.target === "object"
      ? (e.target as GraphNode).id
      : e.target;
    const targetNode = nodeMap.get(targetId as string);
    if (!targetNode) continue;
    const arr = outByType.get(e.type) ?? [];
    arr.push(targetNode);
    outByType.set(e.type, arr);
  }

  const codeViewerUrl = node.filePath
    ? `/workspace/${workspaceId}?repo=${repoId}&file=${encodeURIComponent(node.filePath)}`
    : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between border-b border-white/10 p-3 gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge type={node.type} />
            <span className="text-sm font-semibold truncate">{node.label}</span>
          </div>
          {node.filePath && (
            <p className="mt-1 truncate text-xs text-neutral-400" title={node.filePath}>
              {node.filePath}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded p-1 text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
          aria-label="Close panel"
        >
          <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Metrics */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Metrics
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <MetricBox label="In-degree" value={node.metadata.inDegree} />
            <MetricBox label="Out-degree" value={node.metadata.outDegree} />
            {node.metadata.lineCount != null && (
              <MetricBox label="Lines" value={node.metadata.lineCount} />
            )}
            {node.metadata.symbolCount != null && (
              <MetricBox label="Symbols" value={node.metadata.symbolCount} />
            )}
            {node.metadata.language && (
              <MetricBox label="Language" value={node.metadata.language} />
            )}
            <MetricBox label="Group" value={node.group} />
          </div>
        </section>

        {/* Incoming */}
        {inByType.size > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Incoming ({incomingEdges.length})
            </h3>
            {Array.from(inByType.entries()).map(([type, nodes]) => (
              <RelationGroup
                key={type}
                label={`${capitalise(type)} by`}
                nodes={nodes}
                onNodeClick={onFocusNode}
              />
            ))}
          </section>
        )}

        {/* Outgoing */}
        {outByType.size > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Outgoing ({outgoingEdges.length})
            </h3>
            {Array.from(outByType.entries()).map(([type, nodes]) => (
              <RelationGroup
                key={type}
                label={capitalise(type)}
                nodes={nodes}
                onNodeClick={onFocusNode}
              />
            ))}
          </section>
        )}

        {inByType.size === 0 && outByType.size === 0 && (
          <p className="text-xs text-neutral-500">No connections visible in current view.</p>
        )}
      </div>

      {/* Footer actions */}
      <div className="shrink-0 border-t border-white/10 p-3 space-y-2">
        {codeViewerUrl && (
          <a
            href={codeViewerUrl}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/15 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
              <path
                d="M4 6l-2 2 2 2M12 6l2 2-2 2M9 4l-2 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Open in Code Viewer
          </a>
        )}
        <button
          onClick={() => onFocusNode(node.id)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/10 transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
            <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 2v2M8 12v2M2 8h2M12 8h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Focus on this node
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded bg-white/5 px-2 py-1.5">
      <p className="text-[10px] text-neutral-500">{label}</p>
      <p className="truncate text-xs font-medium">{value}</p>
    </div>
  );
}

function RelationGroup({
  label,
  nodes,
  onNodeClick,
}: {
  label: string;
  nodes: GraphNode[];
  onNodeClick: (id: string) => void;
}) {
  return (
    <div className="mb-2">
      <p className="mb-1 text-[10px] font-medium text-neutral-400">{label}:</p>
      <div className="flex flex-wrap gap-1">
        {nodes.slice(0, 12).map((n) => (
          <button
            key={n.id}
            onClick={() => onNodeClick(n.id)}
            className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-neutral-300 hover:bg-white/10 transition-colors max-w-[120px] truncate"
            title={n.label}
          >
            {n.label}
          </button>
        ))}
        {nodes.length > 12 && (
          <span className="text-[11px] text-neutral-500">+{nodes.length - 12} more</span>
        )}
      </div>
    </div>
  );
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
