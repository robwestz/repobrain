/**
 * Dependency graph builder — transforms raw DB edges into GraphData
 * suitable for react-force-graph-2d.
 */

import {
  getModuleGraph,
  getFileGraph,
  getSymbolGraph,
  getNodeMetadata,
} from "./queries";

// ---------------------------------------------------------------------------
// Public types (shared with UI)
// ---------------------------------------------------------------------------

export type ViewLevel = "module" | "file" | "symbol";

export interface GraphNode {
  id: string;
  label: string;
  type: "module" | "file" | "class" | "function" | "method" | "interface" | "type" | "route";
  group: string; // module/directory group for colour
  size: number; // relative importance 1-10
  filePath?: string;
  symbolId?: string;
  metadata: {
    language?: string;
    lineCount?: number;
    symbolCount?: number;
    inDegree: number;
    outDegree: number;
  };
}

export interface GraphEdge {
  source: string; // node id
  target: string; // node id
  type: "imports" | "calls" | "extends" | "implements" | "uses";
  weight: number; // 1-5
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  groups: { id: string; label: string; color: string }[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    avgDegree: number;
    clusters: number;
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** A stable colour palette for up to 20 modules/groups */
const GROUP_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
  "#06b6d4", "#a855f7", "#e11d48", "#0ea5e9", "#22c55e",
  "#d946ef", "#fb923c", "#4ade80", "#818cf8", "#fbbf24",
];

function colorForIndex(i: number): string {
  return GROUP_COLORS[i % GROUP_COLORS.length];
}

/** Normalise raw relation_type to the canonical EdgeType union */
function normaliseEdgeType(raw: string): GraphEdge["type"] {
  const lower = raw.toLowerCase();
  if (lower.includes("import") || lower.includes("require")) return "imports";
  if (lower.includes("call") || lower.includes("invoke")) return "calls";
  if (lower.includes("extend") || lower.includes("inherit")) return "extends";
  if (lower.includes("implement")) return "implements";
  return "uses";
}

/** Scale a count into the 1-10 size range */
function scaleSize(value: number, min: number, max: number): number {
  if (max === min) return 5;
  return Math.round(1 + ((value - min) / (max - min)) * 9);
}

/** Scale edge count to 1-5 weight */
function scaleWeight(count: number): number {
  if (count >= 10) return 5;
  if (count >= 5) return 4;
  if (count >= 3) return 3;
  if (count >= 2) return 2;
  return 1;
}

/** Extract top-level directory from a path */
function topLevelDir(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? parts[0] : "<root>";
}

// ---------------------------------------------------------------------------
// Module-level builder
// ---------------------------------------------------------------------------

async function buildModuleGraph(
  repoConnectionId: string,
  maxNodes: number,
): Promise<GraphData> {
  const edges = await getModuleGraph(repoConnectionId);

  // Collect all module names
  const moduleSet = new Set<string>();
  for (const e of edges) {
    moduleSet.add(e.fromModule);
    moduleSet.add(e.toModule);
  }

  // Count file counts per module for sizing — we derive it from edges
  const edgeCountPerModule = new Map<string, number>();
  for (const e of edges) {
    edgeCountPerModule.set(e.fromModule, (edgeCountPerModule.get(e.fromModule) ?? 0) + e.edgeCount);
    edgeCountPerModule.set(e.toModule, (edgeCountPerModule.get(e.toModule) ?? 0) + e.edgeCount);
  }

  const modules = Array.from(moduleSet).slice(0, maxNodes);
  const moduleIndex = new Map(modules.map((m, i) => [m, i]));

  const groups = modules.map((m, i) => ({
    id: m,
    label: m,
    color: colorForIndex(i),
  }));

  // In/out degree maps
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  for (const e of edges) {
    if (!moduleIndex.has(e.fromModule) || !moduleIndex.has(e.toModule)) continue;
    outDegree.set(e.fromModule, (outDegree.get(e.fromModule) ?? 0) + e.edgeCount);
    inDegree.set(e.toModule, (inDegree.get(e.toModule) ?? 0) + e.edgeCount);
  }

  const countValues = Array.from(edgeCountPerModule.values());
  const minCount = Math.min(...countValues, 0);
  const maxCount = Math.max(...countValues, 1);

  const nodes: GraphNode[] = modules.map((m) => ({
    id: m,
    label: m,
    type: "module",
    group: m,
    size: scaleSize(edgeCountPerModule.get(m) ?? 0, minCount, maxCount),
    metadata: {
      inDegree: inDegree.get(m) ?? 0,
      outDegree: outDegree.get(m) ?? 0,
    },
  }));

  const graphEdges: GraphEdge[] = [];
  const seenEdges = new Set<string>();

  for (const e of edges) {
    if (!moduleIndex.has(e.fromModule) || !moduleIndex.has(e.toModule)) continue;
    const key = `${e.fromModule}|${e.toModule}|${e.relationType}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);

    graphEdges.push({
      source: e.fromModule,
      target: e.toModule,
      type: normaliseEdgeType(e.relationType),
      weight: scaleWeight(e.edgeCount),
    });
  }

  const totalDegree = nodes.reduce(
    (sum, n) => sum + n.metadata.inDegree + n.metadata.outDegree,
    0,
  );

  return {
    nodes,
    edges: graphEdges,
    groups,
    stats: {
      totalNodes: nodes.length,
      totalEdges: graphEdges.length,
      avgDegree: nodes.length > 0 ? totalDegree / nodes.length : 0,
      clusters: groups.length,
    },
  };
}

// ---------------------------------------------------------------------------
// File-level builder
// ---------------------------------------------------------------------------

async function buildFileGraph(
  repoConnectionId: string,
  focusModule: string | undefined,
  maxNodes: number,
): Promise<GraphData> {
  const [edges, nodeMeta] = await Promise.all([
    getFileGraph(repoConnectionId, focusModule),
    getNodeMetadata(repoConnectionId),
  ]);

  // Collect files that appear in edges (have at least 1 relation)
  const fileIdSet = new Set<string>();
  for (const e of edges) {
    fileIdSet.add(e.fromFileId);
    fileIdSet.add(e.toFileId);
  }

  // Sort by edge count (most connected first) and limit
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  for (const e of edges) {
    outDegree.set(e.fromFileId, (outDegree.get(e.fromFileId) ?? 0) + e.edgeCount);
    inDegree.set(e.toFileId, (inDegree.get(e.toFileId) ?? 0) + e.edgeCount);
  }

  const totalDegreeMap = new Map<string, number>();
  for (const id of fileIdSet) {
    totalDegreeMap.set(id, (inDegree.get(id) ?? 0) + (outDegree.get(id) ?? 0));
  }

  const sortedFileIds = Array.from(fileIdSet).sort(
    (a, b) => (totalDegreeMap.get(b) ?? 0) - (totalDegreeMap.get(a) ?? 0),
  ).slice(0, maxNodes);

  const fileIdIndex = new Set(sortedFileIds);

  // Assign groups by top-level directory
  const groupSet = new Set<string>();
  for (const id of sortedFileIds) {
    const meta = nodeMeta.get(id);
    if (meta?.filePath) groupSet.add(topLevelDir(meta.filePath));
  }

  const groupList = Array.from(groupSet);
  const groupColorMap = new Map(groupList.map((g, i) => [g, colorForIndex(i)]));

  const groups = groupList.map((g) => ({
    id: g,
    label: g,
    color: groupColorMap.get(g) ?? "#6366f1",
  }));

  const lineCounts = sortedFileIds
    .map((id) => nodeMeta.get(id)?.lineCount ?? 0)
    .filter((c) => c > 0);
  const minLines = Math.min(...lineCounts, 0);
  const maxLines = Math.max(...lineCounts, 1);

  const nodes: GraphNode[] = sortedFileIds.map((id) => {
    const meta = nodeMeta.get(id);
    const group = meta?.filePath ? topLevelDir(meta.filePath) : "<root>";
    return {
      id,
      label: meta?.label ?? id,
      type: "file",
      group,
      size: scaleSize(meta?.lineCount ?? 0, minLines, maxLines),
      filePath: meta?.filePath,
      metadata: {
        language: meta?.language,
        lineCount: meta?.lineCount,
        symbolCount: meta?.symbolCount,
        inDegree: inDegree.get(id) ?? 0,
        outDegree: outDegree.get(id) ?? 0,
      },
    };
  });

  const graphEdges: GraphEdge[] = [];
  const seenEdges = new Set<string>();

  for (const e of edges) {
    if (!fileIdIndex.has(e.fromFileId) || !fileIdIndex.has(e.toFileId)) continue;
    const key = `${e.fromFileId}|${e.toFileId}|${e.relationType}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);

    graphEdges.push({
      source: e.fromFileId,
      target: e.toFileId,
      type: normaliseEdgeType(e.relationType),
      weight: scaleWeight(e.edgeCount),
    });
  }

  const totalDeg = nodes.reduce(
    (sum, n) => sum + n.metadata.inDegree + n.metadata.outDegree,
    0,
  );

  return {
    nodes,
    edges: graphEdges,
    groups,
    stats: {
      totalNodes: nodes.length,
      totalEdges: graphEdges.length,
      avgDegree: nodes.length > 0 ? totalDeg / nodes.length : 0,
      clusters: groups.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Symbol-level builder
// ---------------------------------------------------------------------------

async function buildSymbolGraph(
  repoConnectionId: string,
  focusFile: string | undefined,
  maxNodes: number,
): Promise<GraphData> {
  const edges = await getSymbolGraph(repoConnectionId, focusFile);

  // Collect symbols that appear in edges
  const symbolSet = new Set<string>();
  for (const e of edges) {
    symbolSet.add(e.fromSymbolId);
    symbolSet.add(e.toSymbolId);
  }

  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  for (const e of edges) {
    outDegree.set(e.fromSymbolId, (outDegree.get(e.fromSymbolId) ?? 0) + 1);
    inDegree.set(e.toSymbolId, (inDegree.get(e.toSymbolId) ?? 0) + 1);
  }

  // Sort by total degree, limit to maxNodes
  const sortedSymbolIds = Array.from(symbolSet)
    .sort(
      (a, b) =>
        ((inDegree.get(b) ?? 0) + (outDegree.get(b) ?? 0)) -
        ((inDegree.get(a) ?? 0) + (outDegree.get(a) ?? 0)),
    )
    .slice(0, maxNodes);

  const symbolIndex = new Set(sortedSymbolIds);

  // Build lookup maps from edges
  const symbolMeta = new Map<
    string,
    {
      name: string;
      kind: string;
      filePath: string;
      startLine: number;
      endLine: number;
    }
  >();

  for (const e of edges) {
    if (!symbolMeta.has(e.fromSymbolId)) {
      symbolMeta.set(e.fromSymbolId, {
        name: e.fromSymbolName,
        kind: e.fromSymbolKind,
        filePath: e.fromFilePath,
        startLine: e.fromStartLine,
        endLine: e.fromEndLine,
      });
    }
    if (!symbolMeta.has(e.toSymbolId)) {
      symbolMeta.set(e.toSymbolId, {
        name: e.toSymbolName,
        kind: e.toSymbolKind,
        filePath: e.toFilePath,
        startLine: e.toStartLine,
        endLine: e.toEndLine,
      });
    }
  }

  // Groups = top-level dirs
  const groupSet = new Set<string>();
  for (const id of sortedSymbolIds) {
    const meta = symbolMeta.get(id);
    if (meta) groupSet.add(topLevelDir(meta.filePath));
  }
  const groupList = Array.from(groupSet);
  const groupColorMap = new Map(groupList.map((g, i) => [g, colorForIndex(i)]));
  const groups = groupList.map((g) => ({
    id: g,
    label: g,
    color: groupColorMap.get(g) ?? "#6366f1",
  }));

  const lineLengths = sortedSymbolIds
    .map((id) => {
      const m = symbolMeta.get(id);
      return m ? m.endLine - m.startLine : 0;
    })
    .filter((l) => l > 0);

  const minLen = Math.min(...lineLengths, 0);
  const maxLen = Math.max(...lineLengths, 1);

  const nodes: GraphNode[] = sortedSymbolIds.map((id) => {
    const meta = symbolMeta.get(id)!;
    const len = meta.endLine - meta.startLine;
    const group = topLevelDir(meta.filePath);

    const nodeType = ((): GraphNode["type"] => {
      switch (meta.kind) {
        case "class": return "class";
        case "function": return "function";
        case "method": return "method";
        case "interface": return "interface";
        case "type": return "type";
        default: return "function";
      }
    })();

    return {
      id,
      label: meta.name,
      type: nodeType,
      group,
      size: scaleSize(len, minLen, maxLen),
      filePath: meta.filePath,
      symbolId: id,
      metadata: {
        lineCount: len,
        inDegree: inDegree.get(id) ?? 0,
        outDegree: outDegree.get(id) ?? 0,
      },
    };
  });

  const graphEdges: GraphEdge[] = [];
  const seenEdges = new Set<string>();

  for (const e of edges) {
    if (!symbolIndex.has(e.fromSymbolId) || !symbolIndex.has(e.toSymbolId)) continue;
    const key = `${e.fromSymbolId}|${e.toSymbolId}|${e.relationType}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);

    graphEdges.push({
      source: e.fromSymbolId,
      target: e.toSymbolId,
      type: normaliseEdgeType(e.relationType),
      weight: 1,
    });
  }

  const totalDeg = nodes.reduce(
    (sum, n) => sum + n.metadata.inDegree + n.metadata.outDegree,
    0,
  );

  return {
    nodes,
    edges: graphEdges,
    groups,
    stats: {
      totalNodes: nodes.length,
      totalEdges: graphEdges.length,
      avgDegree: nodes.length > 0 ? totalDeg / nodes.length : 0,
      clusters: groups.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function buildGraph(
  repoConnectionId: string,
  level: ViewLevel,
  options?: {
    focusModule?: string;
    maxNodes?: number;
    minEdgeWeight?: number;
  },
): Promise<GraphData> {
  const maxNodes = options?.maxNodes ?? 200;

  switch (level) {
    case "module":
      return buildModuleGraph(repoConnectionId, maxNodes);

    case "file":
      return buildFileGraph(repoConnectionId, options?.focusModule, maxNodes);

    case "symbol":
      return buildSymbolGraph(repoConnectionId, options?.focusModule, Math.min(maxNodes, 150));

    default:
      return buildModuleGraph(repoConnectionId, maxNodes);
  }
}
