/**
 * Blast Radius Analysis Engine
 *
 * Traverses the symbol dependency graph and produces a risk-scored
 * impact report for any symbol or file.
 *
 * Export: analyzeBlastRadius — also used by Job 14 (What If Sandbox)
 */

import {
  getDownstreamSymbols,
  getFileSymbolIds,
  getSymbolByName,
  getSymbolById,
  getAfferentCouplingCount,
  type RawImpactRow,
} from "./queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImpactNode {
  symbolId: string;
  symbolName: string;
  symbolKind: string;
  filePath: string;
  fileId: string;
  startLine: number;
  endLine: number;
  impactLevel: "direct" | "indirect" | "transitive";
  depth: number;
  /** Relation types traversed to reach this node, e.g. ["calls", "imports"] */
  relationPath: string[];
  /** The relation type that directly connects this node to its parent */
  dependencyType: string;
  /** 0-100, higher = more critical */
  riskScore: number;
}

export interface ImpactedFile {
  filePath: string;
  nodeCount: number;
  maxRisk: number;
}

export interface BlastRadiusResult {
  source: {
    symbolName: string;
    symbolKind: string;
    filePath: string;
    startLine: number;
    endLine: number;
  };
  impactedNodes: ImpactNode[];
  impactedFiles: ImpactedFile[];
  summary: {
    directCount: number;
    indirectCount: number;
    transitiveCount: number;
    totalFiles: number;
    totalSymbols: number;
    highRiskCount: number;
  };
}

// ---------------------------------------------------------------------------
// Risk scoring helpers
// ---------------------------------------------------------------------------

const API_ROUTE_PATTERNS = [
  /\/api\//,
  /route\.(ts|js|tsx|jsx)$/,
  /handler\.(ts|js)$/,
  /controller\.(ts|js)$/,
];

function isApiRoute(filePath: string): boolean {
  return API_ROUTE_PATTERNS.some((p) => p.test(filePath));
}

async function computeRiskScore(
  row: RawImpactRow,
  afferentCouplingCache: Map<string, number>,
): Promise<number> {
  // Base score by depth
  const baseScore = row.depth === 1 ? 80 : row.depth === 2 ? 50 : 30;

  let bonus = 0;

  // Structural coupling bonus
  if (row.relationType === "extends" || row.relationType === "implements") {
    bonus += 10;
  }

  // API route bonus
  if (isApiRoute(row.filePath)) {
    bonus += 10;
  }

  // High afferent coupling bonus
  if (!afferentCouplingCache.has(row.fileId)) {
    const count = await getAfferentCouplingCount(row.fileId);
    afferentCouplingCache.set(row.fileId, count);
  }
  const afferent = afferentCouplingCache.get(row.fileId) ?? 0;
  if (afferent > 5) {
    bonus += 5;
  }

  return Math.min(100, baseScore + bonus);
}

function classifyDepth(depth: number): "direct" | "indirect" | "transitive" {
  if (depth === 1) return "direct";
  if (depth === 2) return "indirect";
  return "transitive";
}

// ---------------------------------------------------------------------------
// Core analysis
// ---------------------------------------------------------------------------

async function buildResultFromRows(
  source: BlastRadiusResult["source"],
  rows: RawImpactRow[],
): Promise<BlastRadiusResult> {
  const afferentCouplingCache = new Map<string, number>();

  // Score all rows (in parallel, but batched to avoid DB overload)
  const impactedNodes: ImpactNode[] = await Promise.all(
    rows.map(async (row) => {
      const riskScore = await computeRiskScore(row, afferentCouplingCache);
      return {
        symbolId: row.symbolId,
        symbolName: row.name,
        symbolKind: row.kind,
        filePath: row.filePath,
        fileId: row.fileId,
        startLine: row.startLine,
        endLine: row.endLine,
        impactLevel: classifyDepth(row.depth),
        depth: row.depth,
        relationPath: row.relationPath,
        dependencyType: row.relationType,
        riskScore,
      };
    }),
  );

  // Aggregate by file
  const fileMap = new Map<string, { nodeCount: number; maxRisk: number }>();
  for (const node of impactedNodes) {
    const existing = fileMap.get(node.filePath);
    if (existing) {
      existing.nodeCount += 1;
      existing.maxRisk = Math.max(existing.maxRisk, node.riskScore);
    } else {
      fileMap.set(node.filePath, { nodeCount: 1, maxRisk: node.riskScore });
    }
  }

  const impactedFiles: ImpactedFile[] = Array.from(fileMap.entries()).map(
    ([filePath, { nodeCount, maxRisk }]) => ({ filePath, nodeCount, maxRisk }),
  );

  const directCount = impactedNodes.filter((n) => n.impactLevel === "direct").length;
  const indirectCount = impactedNodes.filter((n) => n.impactLevel === "indirect").length;
  const transitiveCount = impactedNodes.filter((n) => n.impactLevel === "transitive").length;
  const highRiskCount = impactedNodes.filter((n) => n.riskScore >= 70).length;

  return {
    source,
    impactedNodes,
    impactedFiles,
    summary: {
      directCount,
      indirectCount,
      transitiveCount,
      totalFiles: impactedFiles.length,
      totalSymbols: impactedNodes.length,
      highRiskCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze blast radius for a specific symbol.
 * Exported for reuse by Job 14 (What If Sandbox).
 */
export async function analyzeBlastRadius(
  repoConnectionId: string,
  targetSymbolId: string,
  maxDepth: number = 4,
): Promise<BlastRadiusResult> {
  const sym = await getSymbolById(targetSymbolId);
  if (!sym) {
    return {
      source: {
        symbolName: "Unknown",
        symbolKind: "unknown",
        filePath: "",
        startLine: 0,
        endLine: 0,
      },
      impactedNodes: [],
      impactedFiles: [],
      summary: {
        directCount: 0,
        indirectCount: 0,
        transitiveCount: 0,
        totalFiles: 0,
        totalSymbols: 0,
        highRiskCount: 0,
      },
    };
  }

  const rows = await getDownstreamSymbols(targetSymbolId, maxDepth);

  return buildResultFromRows(
    {
      symbolName: sym.name,
      symbolKind: sym.kind,
      filePath: sym.filePath,
      startLine: sym.startLine,
      endLine: sym.endLine,
    },
    rows,
  );
}

/**
 * Analyze blast radius for all symbols in a file.
 * Merges results from all symbols and deduplicates.
 */
export async function analyzeFileBlastRadius(
  repoConnectionId: string,
  filePath: string,
  maxDepth: number = 4,
): Promise<BlastRadiusResult> {
  const symbolIds = await getFileSymbolIds(repoConnectionId, filePath);

  if (symbolIds.length === 0) {
    return {
      source: {
        symbolName: filePath.split("/").pop() ?? filePath,
        symbolKind: "file",
        filePath,
        startLine: 1,
        endLine: 1,
      },
      impactedNodes: [],
      impactedFiles: [],
      summary: {
        directCount: 0,
        indirectCount: 0,
        transitiveCount: 0,
        totalFiles: 0,
        totalSymbols: 0,
        highRiskCount: 0,
      },
    };
  }

  // Fetch rows for all symbols, then deduplicate by symbolId (keeping smallest depth)
  const allRowArrays = await Promise.all(
    symbolIds.map((id) => getDownstreamSymbols(id, maxDepth)),
  );

  // Deduplicate: keep the shallowest occurrence of each impacted symbol
  const bestBySymbolId = new Map<string, RawImpactRow>();
  for (const rows of allRowArrays) {
    for (const row of rows) {
      const existing = bestBySymbolId.get(row.symbolId);
      if (!existing || row.depth < existing.depth) {
        bestBySymbolId.set(row.symbolId, row);
      }
    }
  }

  const mergedRows = Array.from(bestBySymbolId.values());

  return buildResultFromRows(
    {
      symbolName: filePath.split("/").pop() ?? filePath,
      symbolKind: "file",
      filePath,
      startLine: 1,
      endLine: 1,
    },
    mergedRows,
  );
}

/**
 * Resolve a symbol by name within a repo.
 */
export async function resolveSymbolByName(
  repoConnectionId: string,
  symbolName: string,
): Promise<{ id: string; name: string; kind: string; filePath: string } | null> {
  const sym = await getSymbolByName(repoConnectionId, symbolName);
  if (!sym) return null;
  return { id: sym.id, name: sym.name, kind: sym.kind, filePath: sym.filePath };
}
