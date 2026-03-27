"use client";

import { useRef, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import type { GraphNode, GraphEdge, GraphData } from "@/src/modules/dependency-graph/builder";

// Must be dynamically imported — uses canvas, no SSR
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false }) as any;

// ---------------------------------------------------------------------------
// Edge type colour map
// ---------------------------------------------------------------------------

const EDGE_TYPE_COLORS: Record<string, string> = {
  imports: "rgba(150,150,150,0.6)",
  calls: "rgba(96,165,250,0.7)",
  extends: "rgba(52,211,153,0.7)",
  implements: "rgba(167,139,250,0.7)",
  uses: "rgba(251,191,36,0.6)",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GraphCanvasProps {
  data: GraphData;
  onNodeClick: (node: GraphNode) => void;
  onNodeDoubleClick: (node: GraphNode) => void;
  onNodeHover: (node: GraphNode | null) => void;
  highlightedNodeId?: string | null;
  edgeTypeFilter: Set<string>;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GraphCanvas({
  data,
  onNodeClick,
  onNodeDoubleClick,
  onNodeHover,
  highlightedNodeId,
  edgeTypeFilter,
  width,
  height,
}: GraphCanvasProps) {
  const graphRef = useRef<unknown>(null);

  // Build a set of connected edge sources/targets for the highlighted node
  const connectedNodeIds = useMemo(() => {
    if (!highlightedNodeId) return new Set<string>();
    const ids = new Set<string>();
    for (const edge of data.edges) {
      const src = typeof edge.source === "object"
        ? (edge.source as GraphNode).id
        : (edge.source as string);
      const tgt = typeof edge.target === "object"
        ? (edge.target as GraphNode).id
        : (edge.target as string);
      if (src === highlightedNodeId || tgt === highlightedNodeId) {
        ids.add(src);
        ids.add(tgt);
      }
    }
    return ids;
  }, [highlightedNodeId, data.edges]);

  // Build a group-to-color map
  const groupColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of data.groups) map.set(g.id, g.color);
    return map;
  }, [data.groups]);

  // Filter edges by type
  const filteredData = useMemo(() => ({
    nodes: data.nodes,
    links: data.edges
      .filter((e) => edgeTypeFilter.size === 0 || edgeTypeFilter.has(e.type))
      .map((e) => ({
        ...e,
        // react-force-graph-2d uses "links" not "edges"
      })),
  }), [data, edgeTypeFilter]);

  // Node colour function
  const nodeColor = useCallback(
    (node: GraphNode) => {
      if (highlightedNodeId) {
        if (node.id === highlightedNodeId) return "#ffffff";
        if (connectedNodeIds.has(node.id)) return groupColorMap.get(node.group) ?? "#6366f1";
        return "rgba(100,100,100,0.3)";
      }
      return groupColorMap.get(node.group) ?? "#6366f1";
    },
    [highlightedNodeId, connectedNodeIds, groupColorMap],
  );

  // Node size function
  const nodeVal = useCallback((node: GraphNode) => {
    return Math.max(1, node.size);
  }, []);

  // Link colour function
  const linkColor = useCallback(
    (link: GraphEdge) => {
      if (highlightedNodeId) {
        const src = typeof link.source === "object"
          ? (link.source as GraphNode).id
          : (link.source as string);
        const tgt = typeof link.target === "object"
          ? (link.target as GraphNode).id
          : (link.target as string);
        if (src === highlightedNodeId || tgt === highlightedNodeId) {
          return EDGE_TYPE_COLORS[link.type] ?? "rgba(150,150,150,0.6)";
        }
        return "rgba(80,80,80,0.1)";
      }
      return EDGE_TYPE_COLORS[link.type] ?? "rgba(150,150,150,0.6)";
    },
    [highlightedNodeId],
  );

  // Link width
  const linkWidth = useCallback((link: GraphEdge) => link.weight ?? 1, []);

  // Node label (shown when zoomed in)
  const nodeLabel = useCallback((node: GraphNode) => node.label, []);

  // Click vs double-click detection
  const lastClickTime = useRef(0);
  const lastClickNode = useRef<GraphNode | null>(null);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      const now = Date.now();
      if (lastClickNode.current?.id === node.id && now - lastClickTime.current < 400) {
        onNodeDoubleClick(node);
      } else {
        onNodeClick(node);
      }
      lastClickTime.current = now;
      lastClickNode.current = node;
    },
    [onNodeClick, onNodeDoubleClick],
  );

  // Center on highlighted node when it changes
  useEffect(() => {
    if (!highlightedNodeId || !graphRef.current) return;
    const fg = graphRef.current as { centerAt?: (x: number, y: number, ms: number) => void; zoom?: (scale: number, ms: number) => void };
    const node = data.nodes.find((n) => n.id === highlightedNodeId);
    if (node && fg.centerAt) {
      // react-force-graph nodes have x/y after simulation
      const n = node as GraphNode & { x?: number; y?: number };
      if (n.x !== undefined && n.y !== undefined) {
        fg.centerAt(n.x, n.y, 500);
        if (fg.zoom) fg.zoom(2, 500);
      }
    }
  }, [highlightedNodeId, data.nodes]);

  return (
    <ForceGraph2D
      ref={graphRef}
      graphData={filteredData}
      width={width}
      height={height}
      backgroundColor="#0f0f14"
      nodeId="id"
      nodeLabel={nodeLabel}
      nodeColor={nodeColor}
      nodeVal={nodeVal}
      nodeRelSize={4}
      linkColor={linkColor}
      linkWidth={linkWidth}
      linkDirectionalArrowLength={3}
      linkDirectionalArrowRelPos={1}
      onNodeClick={handleNodeClick}
      onNodeHover={onNodeHover}
      warmupTicks={50}
      cooldownTime={3000}
      d3VelocityDecay={0.3}
    />
  );
}
