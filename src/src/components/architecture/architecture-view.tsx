"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { MermaidRenderer } from "./mermaid-renderer";
import { DiagramLegend } from "./diagram-legend";
import type { DiagramType, DiagramNode } from "@/src/modules/architecture/diagram-generator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GeneratedDiagram {
  type: DiagramType;
  title: string;
  description: string;
  mermaidCode: string;
  nodes: DiagramNode[];
  edges: Array<{
    from: string;
    to: string;
    label?: string;
    type: string;
  }>;
}

interface ArchitectureViewProps {
  workspaceId: string;
  repoId: string;
  repoName: string;
}

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------

const DIAGRAM_TABS: Array<{ type: DiagramType; label: string; icon: string }> = [
  { type: "module-dependency", label: "Modules", icon: "⬡" },
  { type: "component", label: "Components", icon: "◉" },
  { type: "data-flow", label: "Data Flow", icon: "→" },
  { type: "class-hierarchy", label: "Class Hierarchy", icon: "◈" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ArchitectureView({ workspaceId, repoId, repoName }: ArchitectureViewProps) {
  const [activeDiagramType, setActiveDiagramType] = useState<DiagramType>("module-dependency");
  const [focusFilter, setFocusFilter] = useState("");
  const [diagram, setDiagram] = useState<GeneratedDiagram | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<DiagramNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  // ---------------------------------------------------------------------------
  // Fetch diagram
  // ---------------------------------------------------------------------------

  const fetchDiagram = useCallback(
    async (type: DiagramType, focus?: string, bustCache = false) => {
      setLoading(true);
      setError(null);
      setDiagram(null);
      setSelectedNode(null);

      try {
        const params = new URLSearchParams({ type });
        if (focus) params.set("focus", focus);
        if (bustCache) params.set("_bust", Date.now().toString());

        const res = await fetch(
          `/api/workspaces/${workspaceId}/repos/${repoId}/architecture?${params}`,
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }

        const data = await res.json();
        setDiagram(data.diagram);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load diagram");
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, repoId],
  );

  // fetchDiagram ref to avoid stale closure issues
  const fetchDiagramRef = useRef(fetchDiagram);
  fetchDiagramRef.current = fetchDiagram;

  // Fetch when diagram type or refresh key changes
  useEffect(() => {
    fetchDiagramRef.current(activeDiagramType, focusFilter || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDiagramType, refreshKey]);

  // ---------------------------------------------------------------------------
  // Node click handler
  // ---------------------------------------------------------------------------

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (!diagram) return;
      // Find node by id (exact match) or by label (cleaned)
      const node =
        diagram.nodes.find((n) => n.id === nodeId) ??
        diagram.nodes.find(
          (n) =>
            n.id.toLowerCase() === nodeId.toLowerCase() ||
            n.label.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() === nodeId.toLowerCase(),
        );
      if (node) {
        setSelectedNode(node);
      }
    },
    [diagram],
  );

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  const navigateToFile = useCallback(
    (filePath: string) => {
      // The workspace root page handles file navigation — redirect there with query
      window.location.href = `/workspace/${workspaceId}?file=${encodeURIComponent(filePath)}`;
    },
    [workspaceId],
  );

  // ---------------------------------------------------------------------------
  // Focus filter submit
  // ---------------------------------------------------------------------------

  const handleFocusSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      fetchDiagram(activeDiagramType, focusFilter || undefined);
    },
    [activeDiagramType, focusFilter, fetchDiagram],
  );

  // ---------------------------------------------------------------------------
  // Connections for selected node
  // ---------------------------------------------------------------------------

  const nodeConnections = selectedNode && diagram
    ? {
        outgoing: diagram.edges.filter((e) => e.from === selectedNode.id),
        incoming: diagram.edges.filter((e) => e.to === selectedNode.id),
      }
    : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
        <div className="flex items-center gap-3">
          <a
            href="/dashboard"
            className="text-sm font-semibold hover:opacity-70 transition-opacity"
          >
            RepoBrain
          </a>
          <span className="text-[var(--muted-foreground)]">/</span>
          <a
            href={`/workspace/${workspaceId}`}
            className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            {repoName}
          </a>
          <span className="text-[var(--muted-foreground)]">/</span>
          <span className="text-sm font-medium">Architecture</span>
        </div>
      </header>

      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-2">
        {/* Diagram type tabs */}
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
          {DIAGRAM_TABS.map((tab) => (
            <button
              key={tab.type}
              onClick={() => {
                setActiveDiagramType(tab.type);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                activeDiagramType === tab.type
                  ? "bg-[var(--accent)] text-[var(--foreground)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]/50"
              }`}
            >
              <span aria-hidden="true">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Focus filter */}
        <form onSubmit={handleFocusSubmit} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Focus path (e.g. src/modules/chat)"
            value={focusFilter}
            onChange={(e) => setFocusFilter(e.target.value)}
            className="h-8 w-56 rounded border border-[var(--border)] bg-[var(--background)] px-2.5 text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          />
          <button
            type="submit"
            className="h-8 rounded border border-[var(--border)] px-3 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
          >
            Filter
          </button>
        </form>

        {/* Zoom controls */}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
            className="flex h-8 w-8 items-center justify-center rounded border border-[var(--border)] text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
            title="Zoom out"
          >
            −
          </button>
          <span className="w-12 text-center text-xs text-[var(--muted-foreground)]">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            className="flex h-8 w-8 items-center justify-center rounded border border-[var(--border)] text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
            title="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => setZoom(1)}
            className="ml-1 h-8 rounded border border-[var(--border)] px-2.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
            title="Reset zoom"
          >
            Fit
          </button>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="ml-1 flex h-8 w-8 items-center justify-center rounded border border-[var(--border)] text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
            title="Refresh diagram"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Diagram area */}
        <div className="relative flex-1 overflow-hidden">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--background)]/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                {/* Skeleton diagram placeholder */}
                <div className="w-64 space-y-2 animate-pulse">
                  <div className="h-10 rounded bg-[var(--muted)]/20" />
                  <div className="flex gap-4 justify-center">
                    <div className="h-8 w-20 rounded bg-[var(--muted)]/20" />
                    <div className="h-8 w-16 rounded bg-[var(--muted)]/20" />
                    <div className="h-8 w-24 rounded bg-[var(--muted)]/20" />
                  </div>
                  <div className="flex gap-2 justify-center">
                    <div className="h-0.5 w-16 rounded bg-[var(--muted)]/20 self-center" />
                    <div className="h-8 w-20 rounded bg-[var(--muted)]/20" />
                  </div>
                </div>
                <p className="text-sm text-[var(--muted-foreground)]">Generating diagram…</p>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="flex h-full items-center justify-center p-8">
              <div className="max-w-sm rounded-lg border border-red-800 bg-red-950/30 p-6 text-center">
                <p className="font-medium text-red-400">Failed to generate diagram</p>
                <p className="mt-1 text-sm text-red-300/80">{error}</p>
                <button
                  onClick={() => fetchDiagram(activeDiagramType, focusFilter || undefined)}
                  className="mt-4 rounded border border-red-700 px-4 py-1.5 text-sm text-red-400 hover:bg-red-900/30 transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {!loading && !error && diagram && (
            <div
              style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
              className="h-full w-full transition-transform duration-200"
            >
              <MermaidRenderer
                key={`${activeDiagramType}-${refreshKey}-${focusFilter}`}
                code={diagram.mermaidCode}
                onNodeClick={handleNodeClick}
              />
            </div>
          )}

          {!loading && !error && !diagram && (
            <div className="flex h-full items-center justify-center text-sm text-[var(--muted-foreground)]">
              Select a diagram type above to get started
            </div>
          )}
        </div>

        {/* Side panel — shown when a node is selected */}
        {selectedNode && (
          <div className="w-72 shrink-0 overflow-y-auto border-l border-[var(--border)] bg-[var(--background)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <h3 className="text-sm font-semibold">Node Details</h3>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-lg leading-none text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                aria-label="Close panel"
              >
                ×
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Node info */}
              <div>
                <p className="text-base font-medium">{selectedNode.label}</p>
                <span className="inline-block mt-1 rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
                  {selectedNode.type}
                </span>
              </div>

              {selectedNode.filePath && (
                <div>
                  <p className="mb-1 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                    File Path
                  </p>
                  <p className="break-all font-mono text-xs text-[var(--foreground)]">
                    {selectedNode.filePath}
                  </p>
                </div>
              )}

              {selectedNode.symbolId && (
                <div>
                  <p className="mb-1 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                    Symbol ID
                  </p>
                  <p className="break-all font-mono text-xs text-[var(--muted-foreground)]">
                    {selectedNode.symbolId.slice(0, 8)}…
                  </p>
                </div>
              )}

              {/* Connections */}
              {nodeConnections && nodeConnections.outgoing.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                    Outgoing ({nodeConnections.outgoing.length})
                  </p>
                  <ul className="space-y-1">
                    {nodeConnections.outgoing.slice(0, 10).map((edge, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-[var(--accent)] cursor-pointer transition-colors"
                        onClick={() => {
                          const toNode = diagram?.nodes.find((n) => n.id === edge.to);
                          if (toNode) setSelectedNode(toNode);
                        }}
                      >
                        <span className="text-[var(--muted-foreground)]">{edge.type}</span>
                        <span className="flex-1 truncate">{edge.to}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {nodeConnections && nodeConnections.incoming.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                    Incoming ({nodeConnections.incoming.length})
                  </p>
                  <ul className="space-y-1">
                    {nodeConnections.incoming.slice(0, 10).map((edge, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-[var(--accent)] cursor-pointer transition-colors"
                        onClick={() => {
                          const fromNode = diagram?.nodes.find((n) => n.id === edge.from);
                          if (fromNode) setSelectedNode(fromNode);
                        }}
                      >
                        <span className="text-[var(--muted-foreground)]">{edge.type}</span>
                        <span className="flex-1 truncate">{edge.from}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Navigate to code */}
              {selectedNode.filePath && (
                <button
                  onClick={() => navigateToFile(selectedNode.filePath!)}
                  className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
                >
                  Open in Code Viewer
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      {diagram && <DiagramLegend diagramType={activeDiagramType} />}
    </div>
  );
}
