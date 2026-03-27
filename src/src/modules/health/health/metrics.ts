/**
 * Health metric calculation engine.
 * Combines data from DB queries to produce per-file and repo-level health scores.
 */

import {
  getFileMetrics,
  getSymbolCounts,
  getCouplingData,
  getChunkStats,
  getRepoStats,
} from "./queries";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface FileHealth {
  fileId: string;
  filePath: string;
  language: string | null;
  metrics: {
    sizeBytes: number;
    lineCount: number;
    symbolCount: number;
    complexity: number;
    coupling: {
      afferent: number;
      efferent: number;
      instability: number;
    };
    chunkDensity: number;
    avgChunkTokens: number;
    documentationRatio: number;
  };
  healthScore: number;
  issues: string[];
}

export interface RepoHealth {
  repoConnectionId: string;
  overallScore: number;
  fileCount: number;
  totalSymbols: number;
  totalRelations: number;
  languageBreakdown: { language: string; fileCount: number; lineCount: number }[];
  hotspots: FileHealth[];
  bestFiles: FileHealth[];
  metrics: {
    avgComplexity: number;
    avgCoupling: number;
    maxFileSize: number;
    avgFileSize: number;
  };
  allFiles: FileHealth[];
}

// ---------------------------------------------------------------------------
// Score formula (as specified in job spec)
// ---------------------------------------------------------------------------

function computeHealthScore(
  complexity: number,
  instability: number,
  lineCount: number,
  documentationRatio: number,
  symbolCount: number,
): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;

  if (complexity > 50) {
    score -= 20;
    issues.push("Very high complexity (>50)");
  } else if (complexity > 20) {
    score -= 10;
    issues.push("High complexity (>20)");
  }

  if (instability > 0.8) {
    score -= 15;
    issues.push("Very unstable coupling (instability >0.8)");
  } else if (instability > 0.5) {
    score -= 5;
    issues.push("Moderate instability (>0.5)");
  }

  if (lineCount > 500) {
    score -= 15;
    issues.push("Very large file (>500 lines)");
  } else if (lineCount > 300) {
    score -= 5;
    issues.push("Large file (>300 lines)");
  }

  if (documentationRatio < 0.05) {
    score -= 10;
    issues.push("Low documentation coverage (<5%)");
  }

  if (symbolCount > 30) {
    score -= 10;
    issues.push("High symbol density (>30 symbols)");
  }

  return { score: Math.max(0, Math.min(100, score)), issues };
}

// ---------------------------------------------------------------------------
// Main computation function
// ---------------------------------------------------------------------------

export async function computeRepoHealth(repoConnectionId: string): Promise<RepoHealth> {
  // Fetch all data sources in parallel
  const [fileMetrics, symbolCounts, couplingData, chunkStats, repoStats] = await Promise.all([
    getFileMetrics(repoConnectionId),
    getSymbolCounts(repoConnectionId),
    getCouplingData(repoConnectionId),
    getChunkStats(repoConnectionId),
    getRepoStats(repoConnectionId),
  ]);

  // Build per-file health records
  const allFiles: FileHealth[] = fileMetrics.map((file) => {
    const symData = symbolCounts.get(file.fileId);
    const coupling = couplingData.get(file.fileId);
    const chunks = chunkStats.get(file.fileId);

    const symbolCount = symData?.symbolCount ?? 0;
    const complexity = symData?.totalComplexity ?? 0;

    const afferent = coupling?.afferent ?? 0;
    const efferent = coupling?.efferent ?? 0;
    const total = afferent + efferent;
    const instability = total > 0 ? efferent / total : 0;

    const chunkCount = chunks?.chunkCount ?? 0;
    const avgChunkTokens = chunks?.avgTokens ?? 0;
    const commentChunks = chunks?.commentChunks ?? 0;
    const documentationRatio = chunkCount > 0 ? commentChunks / chunkCount : 0;
    const chunkDensity = file.lineCount > 0 ? (chunkCount / file.lineCount) * 100 : 0;

    const { score, issues } = computeHealthScore(
      complexity,
      instability,
      file.lineCount,
      documentationRatio,
      symbolCount,
    );

    return {
      fileId: file.fileId,
      filePath: file.filePath,
      language: file.language,
      metrics: {
        sizeBytes: file.sizeBytes,
        lineCount: file.lineCount,
        symbolCount,
        complexity,
        coupling: {
          afferent,
          efferent,
          instability,
        },
        chunkDensity,
        avgChunkTokens,
        documentationRatio,
      },
      healthScore: score,
      issues,
    };
  });

  // Aggregate metrics
  const fileCount = allFiles.length;

  const avgComplexity =
    fileCount > 0
      ? allFiles.reduce((sum, f) => sum + f.metrics.complexity, 0) / fileCount
      : 0;

  const avgCouplingInstability =
    fileCount > 0
      ? allFiles.reduce((sum, f) => sum + f.metrics.coupling.instability, 0) / fileCount
      : 0;

  const maxFileSize =
    fileCount > 0 ? Math.max(...allFiles.map((f) => f.metrics.sizeBytes)) : 0;

  const avgFileSize =
    fileCount > 0
      ? allFiles.reduce((sum, f) => sum + f.metrics.sizeBytes, 0) / fileCount
      : 0;

  // Overall score: weighted average of all file scores
  const overallScore =
    fileCount > 0
      ? Math.round(allFiles.reduce((sum, f) => sum + f.healthScore, 0) / fileCount)
      : 100;

  // Hotspots: worst 10 files by health score
  const sorted = [...allFiles].sort((a, b) => a.healthScore - b.healthScore);
  const hotspots = sorted.slice(0, 10);

  // Best: top 5 scoring files (only include files with at least 1 line)
  const bestFiles = [...allFiles]
    .filter((f) => f.metrics.lineCount > 0)
    .sort((a, b) => b.healthScore - a.healthScore)
    .slice(0, 5);

  return {
    repoConnectionId,
    overallScore,
    fileCount: repoStats.totalFiles,
    totalSymbols: repoStats.totalSymbols,
    totalRelations: repoStats.totalRelations,
    languageBreakdown: repoStats.languageBreakdown,
    hotspots,
    bestFiles,
    metrics: {
      avgComplexity,
      avgCoupling: avgCouplingInstability,
      maxFileSize,
      avgFileSize,
    },
    allFiles,
  };
}
