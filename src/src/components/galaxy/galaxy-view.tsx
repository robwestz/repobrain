"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { GraphData, GraphNode, GraphEdge, ViewLevel } from "@/src/modules/dependency-graph/builder";
import { GraphCanvas } from "./graph-canvas";
import { NodeDetail } from "./node-detail";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GalaxyViewProps {
  workspaceId: string;
  repoId: string;
  initialLevel?: ViewLevel;
  initialFocus?: string;
}

const EDGE_TYPES = ["imports", "calls", "extends", "implements", "uses"] as const;
type EdgeType = typeof EDGE_TYPES[number];

const EDGE_TYPE_LABELS: Record<EdgeType, string> = {
  imports: "Imports",
  calls: "Calls",
  extends: "Extends",
  implements: "Implements",
  uses: "Uses",
};

// ---------------------------------------------------------------------------
// GalaxyView
// ---------------------------------------------------------------------------

export function GalaxyView({ workspaceId, repoId, initialLevel, initialFocus }: GalaxyViewProps) {
  const [level, setLevel] = useState<ViewLevel>(initialLevel ?? "module");
  const [focusInput, setFocusInput] = useState(initialFocus ?? "");
  const [maxNodes, setMaxNodes] = useState(200);
  const [edgeTypeFilter, setEdgeTypeFilter] = useState<Set<string>>(new Set());
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // ---------------------------------------------------------------------------
  // Fetch graph data
  // ---------------------------------------------------------------------------

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedNode(null);

    try {
      const params = new URLSearchParams({ level, maxNodes: String(maxNodes) });
      if (focusInput.trim()) params.set("focus", focusInput.trim());

      const res = await fetch(
        `/api/workspaces/${workspaceId}/repos/${repoId}/dependency-graph?${params.toString()}`,
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const data: GraphData = await res.json();
      setGraphData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load graph");
    } finally {
      setLoading(false);
    }
  }, [level, focusInput, maxNodes, workspaceId, repoId]);

  // Fetch on mount and when level/focus changes
  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // ---------------------------------------------------------------------------
  // Canvas sizing — fills container
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasSize({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ---------------------------------------------------------------------------
  // Interaction handlers
  // ---------------------------------------------------------------------------

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node);
    setHoveredNodeId(node.id);
  }, []);

  const handleNodeDoubleClick = useCallback(
    (node: GraphNode) => {
      if (node.filePath) {
        const url = `/workspace/${workspaceId}?repo=${repoId}&file=${encodeURIComponent(node.filePath)}`;
        window.location.href = url;
      }
    },
    [workspaceId, repoId],
  );

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    setHoveredNodeId(node?.id ?? null);
  }, []);

  const handleFocusNode = useCallback(
    (nodeId: string) => {
      if (!graphData) return;
      const node = graphData.nodes.find((n) => n.id === nodeId);
      if (node) {
        setSelectedNode(node);
        setHoveredNodeId(nodeId);
      }
    },
    [graphData],
  );

  const toggleEdgeType = useCallback((type: string) => {
    setEdgeTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Fullscreen
  // ---------------------------------------------------------------------------

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((v) => !v);
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const stats = graphData?.stats;

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-50 flex flex-col bg-[#0f0f14]"
          : "flex h-full flex-col bg-[#0f0f14] text-white"
      }
    >
      {/* ── Control bar ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/10 px-4 py-2">
        {/* View level toggle */}
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          {(["module", "file", "symbol"] as ViewLevel[]).map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                level === l
                  ? "bg-indigo-600 text-white"
                  : "text-neutral-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              {l.charAt(0).toUpperCase() + l.slice(1)}
            </button>
          ))}
        </div>

        {/* Focus filter */}
        <input
          type="text"
          value={focusInput}
          onChange={(e) => setFocusInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchGraph()}
          placeholder="Focus: src/modules/chat"
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs placeholder-neutral-500 focus:border-indigo-500 focus:outline-none w-48"
        />

        {/* Max nodes slider */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400">Nodes:</span>
          <input
            type="range"
            min={50}
            max={300}
            step={10}
            value={maxNodes}
            onChange={(e) => setMaxNodes(parseInt(e.target.value, 10))}
            className="w-24 accent-indigo-500"
          />
          <span className="w-8 text-xs text-neutral-300">{maxNodes}</span>
        </div>

        {/* Edge type filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-neutral-400">Edges:</span>
          {EDGE_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!edgeTypeFilter.has(t)}
                onChange={() => toggleEdgeType(t)}
                className="accent-indigo-500 h-3 w-3"
              />
              <span className="text-xs text-neutral-300">{EDGE_TYPE_LABELS[t]}</span>
            </label>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Stats */}
          {stats && (
            <span className="text-xs text-neutral-500">
              {stats.totalNodes} nodes · {stats.totalEdges} edges
            </span>
          )}

          {/* Refresh */}
          <button
            onClick={fetchGraph}
            className="rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
            disabled={loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Toggle fullscreen"
          >
            {isFullscreen ? (
              <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4">
                <path d="M5 11H1m0 0v4m0-4 4 4M11 5h4m0 0V1m0 4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4">
                <path d="M1 5V1h4M11 1h4v4M15 11v4h-4M5 15H1v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas area */}
        <div ref={containerRef} className="relative flex-1 overflow-hidden">
          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0f0f14]/80">
              <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              <p className="text-sm text-neutral-400">Building dependency graph…</p>
            </div>
          )}

          {error && !loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={fetchGraph}
                className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/10"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && graphData && graphData.nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-neutral-500">
                No dependency data found. Index the repository to generate graph data.
              </p>
            </div>
          )}

          {graphData && graphData.nodes.length > 0 && (
            <GraphCanvas
              data={graphData}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
              onNodeHover={handleNodeHover}
              highlightedNodeId={hoveredNodeId}
              edgeTypeFilter={edgeTypeFilter}
              width={canvasSize.width}
              height={canvasSize.height}
            />
          )}

          {/* Legend overlay */}
          {graphData && graphData.groups.length > 0 && (
            <div className="pointer-events-none absolute bottom-4 left-4 max-w-[200px] rounded-lg border border-white/10 bg-black/60 p-2 backdrop-blur-sm">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                Groups
              </p>
              <div className="space-y-1">
                {graphData.groups.slice(0, 10).map((g) => (
                  <div key={g.id} className="flex items-center gap-1.5">
                    <div
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: g.color }}
                    />
                    <span className="truncate text-[10px] text-neutral-300" title={g.label}>
                      {g.label}
                    </span>
                  </div>
                ))}
                {graphData.groups.length > 10 && (
                  <p className="text-[10px] text-neutral-500">
                    +{graphData.groups.length - 10} more
                  </p>
                )}
              </div>

              {/* Edge type legend */}
              <p className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                Edge types
              </p>
              <div className="space-y-1">
                {(
                  [
                    ["imports", "rgba(150,150,150,0.8)"],
                    ["calls", "rgba(96,165,250,0.9)"],
                    ["extends", "rgba(52,211,153,0.9)"],
                    ["implements", "rgba(167,139,250,0.9)"],
                    ["uses", "rgba(251,191,36,0.8)"],
                  ] as [string, string][]
                ).map(([type, color]) => (
                  <div key={type} className="flex items-center gap-1.5">
                    <div
                      className="h-0.5 w-4 shrink-0 rounded"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-[10px] text-neutral-300">{type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Detail panel ── */}
        {selectedNode && graphData && (
          <div className="flex w-72 shrink-0 flex-col border-l border-white/10 text-white">
            <NodeDetail
              node={selectedNode}
              edges={graphData.edges as GraphEdge[]}
              allNodes={graphData.nodes}
              workspaceId={workspaceId}
              repoId={repoId}
              onClose={() => setSelectedNode(null)}
              onFocusNode={handleFocusNode}
            />
          </div>
        )}
      </div>
    </div>
  );
}
