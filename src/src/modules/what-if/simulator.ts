/**
 * What-If Impact Simulator.
 *
 * 1. Parse the change description (no LLM)
 * 2. Resolve targets against the DB
 * 3. Graph analysis using symbol_relations
 * 4. AI enrichment for risk, effort, recommendations
 */

import { db } from "@/src/lib/db";
import { symbols, symbolRelations, files } from "@/src/lib/db/schema";
import { eq, and, or, inArray, ilike } from "drizzle-orm";
import { getProvider, getOpenAIClient, getAnthropicClient } from "@/src/modules/llm/provider";
import { parseChangeIntent, type ParsedIntent } from "./intent-parser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type EffortLevel = "trivial" | "small" | "medium" | "large" | "epic";
export type BreakType = "compile-error" | "runtime-error" | "behavior-change" | "performance";
export type Severity = "break" | "warning" | "info";

export interface AffectedItem {
  filePath: string;
  symbolName: string | null;
  startLine: number;
  endLine: number;
  impact: string;
  severity: Severity;
}

export interface PotentialBreak {
  filePath: string;
  symbolName: string;
  reason: string;
  breakType: BreakType;
}

export interface WhatIfResult {
  changeDescription: string;
  parsedIntent: ParsedIntent;

  // Graph-based analysis
  directlyAffected: AffectedItem[];
  indirectlyAffected: AffectedItem[];
  potentialBreaks: PotentialBreak[];

  // AI analysis
  riskAssessment: RiskLevel;
  riskExplanation: string;
  estimatedEffort: EffortLevel;
  recommendations: string[];
  sideEffects: string[];
  prerequisiteChanges: string[];

  summary: string;
}

// ---------------------------------------------------------------------------
// DB types (inferred from schema)
// ---------------------------------------------------------------------------

interface SymbolRow {
  id: string;
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
  signature: string | null;
  fileId: string;
}

interface FileRow {
  id: string;
  path: string;
  language: string | null;
}

// ---------------------------------------------------------------------------
// Target resolution: match parsed symbols/files against the DB
// ---------------------------------------------------------------------------

async function resolveTargets(
  repoConnectionId: string,
  intent: ParsedIntent,
): Promise<{ targetSymbols: SymbolRow[]; targetFiles: FileRow[] }> {
  // First get all files for this repo
  const repoFiles = await db
    .select()
    .from(files)
    .where(eq(files.repoConnectionId, repoConnectionId));

  const repoFileIds = repoFiles.map((f) => f.id);
  if (repoFileIds.length === 0) {
    return { targetSymbols: [], targetFiles: [] };
  }

  const resolvedFiles: FileRow[] = [];
  const resolvedSymbols: SymbolRow[] = [];

  // Match file paths from intent
  if (intent.targetFiles.length > 0) {
    for (const fp of intent.targetFiles) {
      const matched = repoFiles.filter(
        (f) => f.path === fp || f.path.endsWith("/" + fp) || f.path.endsWith(fp),
      );
      resolvedFiles.push(...matched);
    }
  }

  // Match module names against file paths
  if (intent.targetModules.length > 0) {
    for (const mod of intent.targetModules) {
      const matched = repoFiles.filter(
        (f) =>
          f.path.includes("/" + mod + "/") ||
          f.path.includes("/" + mod + ".") ||
          f.path.includes("\\" + mod + "\\") ||
          f.path.endsWith("/" + mod),
      );
      resolvedFiles.push(...matched);
    }
  }

  // Deduplicate resolved files
  const seenFileIds = new Set<string>();
  const uniqueFiles = resolvedFiles.filter((f) => {
    if (seenFileIds.has(f.id)) return false;
    seenFileIds.add(f.id);
    return true;
  });

  // Match symbols by name
  if (intent.targetSymbols.length > 0) {
    const symbolRows = await db
      .select({
        id: symbols.id,
        name: symbols.name,
        kind: symbols.kind,
        startLine: symbols.startLine,
        endLine: symbols.endLine,
        signature: symbols.signature,
        fileId: symbols.fileId,
      })
      .from(symbols)
      .where(
        and(
          inArray(symbols.fileId, repoFileIds),
          or(...intent.targetSymbols.map((s) => ilike(symbols.name, s))),
        ),
      )
      .limit(20);

    resolvedSymbols.push(...symbolRows);
  }

  // If we found symbols, also include their files
  if (resolvedSymbols.length > 0) {
    const symbolFileIds = [...new Set(resolvedSymbols.map((s) => s.fileId))];
    for (const fid of symbolFileIds) {
      if (!seenFileIds.has(fid)) {
        const f = repoFiles.find((rf) => rf.id === fid);
        if (f) {
          uniqueFiles.push(f);
          seenFileIds.add(fid);
        }
      }
    }
  }

  // Fallback: if nothing resolved, try partial name matching on module names in file paths
  if (uniqueFiles.length === 0 && resolvedSymbols.length === 0 && intent.targetSymbols.length > 0) {
    for (const sym of intent.targetSymbols) {
      const partialFiles = repoFiles.filter(
        (f) => f.path.toLowerCase().includes(sym.toLowerCase()),
      );
      for (const pf of partialFiles.slice(0, 5)) {
        if (!seenFileIds.has(pf.id)) {
          uniqueFiles.push(pf);
          seenFileIds.add(pf.id);
        }
      }
    }
  }

  return { targetSymbols: resolvedSymbols, targetFiles: uniqueFiles };
}

// ---------------------------------------------------------------------------
// Simplified blast radius: query symbol_relations recursively (2-3 hops)
// ---------------------------------------------------------------------------

interface BlastResult {
  directDependents: Array<{
    symbol: SymbolRow;
    file: FileRow;
    depth: number;
  }>;
  indirectDependents: Array<{
    symbol: SymbolRow;
    file: FileRow;
    depth: number;
  }>;
}

async function computeBlastRadius(
  targetSymbolIds: string[],
  repoConnectionId: string,
  maxDepth: number = 3,
): Promise<BlastResult> {
  if (targetSymbolIds.length === 0) return { directDependents: [], indirectDependents: [] };

  // Get all files for this repo (for lookups)
  const repoFiles = await db
    .select()
    .from(files)
    .where(eq(files.repoConnectionId, repoConnectionId));
  const fileMap = new Map<string, FileRow>(repoFiles.map((f) => [f.id, f]));

  // BFS over symbol_relations
  const visited = new Set<string>(targetSymbolIds);
  const direct: Array<{ symbol: SymbolRow; file: FileRow; depth: number }> = [];
  const indirect: Array<{ symbol: SymbolRow; file: FileRow; depth: number }> = [];

  let frontier = [...targetSymbolIds];
  let depth = 1;

  while (frontier.length > 0 && depth <= maxDepth) {
    // Find all symbols that depend on (import/call/extend/implement) current frontier
    const relations = await db
      .select({
        fromSymbolId: symbolRelations.fromSymbolId,
        toSymbolId: symbolRelations.toSymbolId,
        relationType: symbolRelations.relationType,
      })
      .from(symbolRelations)
      .where(inArray(symbolRelations.toSymbolId, frontier));

    const nextFrontier: string[] = [];

    for (const rel of relations) {
      if (visited.has(rel.fromSymbolId)) continue;
      visited.add(rel.fromSymbolId);
      nextFrontier.push(rel.fromSymbolId);

      // Fetch the symbol
      const symRows = await db
        .select({
          id: symbols.id,
          name: symbols.name,
          kind: symbols.kind,
          startLine: symbols.startLine,
          endLine: symbols.endLine,
          signature: symbols.signature,
          fileId: symbols.fileId,
        })
        .from(symbols)
        .where(eq(symbols.id, rel.fromSymbolId))
        .limit(1);

      if (symRows.length === 0) continue;
      const sym = symRows[0];
      const file = fileMap.get(sym.fileId);
      if (!file) continue;

      if (depth === 1) {
        direct.push({ symbol: sym, file, depth });
      } else {
        indirect.push({ symbol: sym, file, depth });
      }
    }

    frontier = nextFrontier;
    depth++;
  }

  return { directDependents: direct, indirectDependents: indirect };
}

// ---------------------------------------------------------------------------
// Build affected item / potential break lists
// ---------------------------------------------------------------------------

function buildAffectedItems(
  items: Array<{ symbol: SymbolRow; file: FileRow; depth: number }>,
  changeType: string,
): { affectedItems: AffectedItem[]; breaks: PotentialBreak[] } {
  const affectedItems: AffectedItem[] = [];
  const breaks: PotentialBreak[] = [];

  for (const { symbol, file } of items) {
    let severity: Severity = "warning";
    let impact: string;

    switch (changeType) {
      case "remove":
        severity = "break";
        impact = `Would break — references removed symbol '${symbol.name}'`;
        breaks.push({
          filePath: file.path,
          symbolName: symbol.name,
          reason: `This ${symbol.kind} references '${symbol.name}' which would be removed`,
          breakType: "compile-error",
        });
        break;

      case "modify":
        severity = "warning";
        impact = `May be affected — calls or uses '${symbol.name}'`;
        break;

      case "move":
        severity = "warning";
        impact = `Import path will need updating for '${symbol.name}'`;
        breaks.push({
          filePath: file.path,
          symbolName: symbol.name,
          reason: `Import path for '${symbol.name}' will change after move`,
          breakType: "compile-error",
        });
        break;

      case "split":
        severity = "warning";
        impact = `Will need to be updated to import from new location(s)`;
        breaks.push({
          filePath: file.path,
          symbolName: symbol.name,
          reason: `Callers of '${symbol.name}' must be updated after split`,
          breakType: "compile-error",
        });
        break;

      case "merge":
        severity = "warning";
        impact = `May need import path adjustment after merge`;
        break;

      case "replace":
        severity = "break";
        impact = `Uses '${symbol.name}' which is being replaced`;
        breaks.push({
          filePath: file.path,
          symbolName: symbol.name,
          reason: `'${symbol.name}' will be replaced — all usages need updating`,
          breakType: "compile-error",
        });
        break;

      case "add":
        severity = "info";
        impact = `Nearby symbol '${symbol.name}' — check for naming conflicts`;
        break;

      default:
        severity = "warning";
        impact = `May be affected by change to '${symbol.name}'`;
    }

    affectedItems.push({
      filePath: file.path,
      symbolName: symbol.name,
      startLine: symbol.startLine,
      endLine: symbol.endLine,
      impact,
      severity,
    });
  }

  return { affectedItems, breaks };
}

// ---------------------------------------------------------------------------
// AI enrichment
// ---------------------------------------------------------------------------

interface AIEnrichment {
  riskAssessment: RiskLevel;
  riskExplanation: string;
  estimatedEffort: EffortLevel;
  sideEffects: string[];
  prerequisiteChanges: string[];
  recommendations: string[];
  summary: string;
}

async function enrichWithAI(
  description: string,
  intent: ParsedIntent,
  directlyAffected: AffectedItem[],
  potentialBreaks: PotentialBreak[],
  targetSymbolCount: number,
): Promise<AIEnrichment> {
  const directList = directlyAffected
    .slice(0, 15)
    .map((a) => `  - ${a.filePath} (${a.symbolName ?? "file-level"}): ${a.impact}`)
    .join("\n");

  const breakList = potentialBreaks
    .slice(0, 10)
    .map((b) => `  - ${b.filePath} → ${b.symbolName}: ${b.reason} [${b.breakType}]`)
    .join("\n");

  const totalAffected = directlyAffected.length;
  const breakCount = potentialBreaks.length;

  const prompt = `You are analyzing the impact of a proposed code change.

Proposed change: "${description}"

Parsed intent:
- Change type: ${intent.changeType}
- Target symbols: ${intent.targetSymbols.join(", ") || "none identified"}
- Target files: ${intent.targetFiles.join(", ") || "none identified"}
- Target modules: ${intent.targetModules.join(", ") || "none identified"}

Graph analysis found:
- ${targetSymbolCount} target symbol(s) identified in the codebase
- ${totalAffected} directly affected item(s)
- ${breakCount} potential break(s)

Directly affected items (sample):
${directList || "  (none found)"}

Potential breaks (sample):
${breakList || "  (none found)"}

Based on this analysis, respond with a JSON object with exactly these fields:
{
  "riskAssessment": "low" | "medium" | "high" | "critical",
  "riskExplanation": "One sentence explaining the risk level",
  "estimatedEffort": "trivial" | "small" | "medium" | "large" | "epic",
  "sideEffects": ["array of 2-4 potential side effects graph analysis wouldn't catch"],
  "prerequisiteChanges": ["array of 0-3 things that must be done first"],
  "recommendations": ["array of 3 concrete recommendations for safely making this change"],
  "summary": "2-3 sentence executive summary of the impact"
}

Guidelines:
- "low": trivial change, 0-2 affected items, no breaks
- "medium": moderate change, 3-10 affected items or 1-3 breaks
- "high": significant change, 10+ affected items or 4+ breaks
- "critical": systemic change affecting core infrastructure or causing many compile errors

Only return valid JSON. No markdown, no explanation outside the JSON.`;

  try {
    const provider = getProvider();

    if (provider === "anthropic") {
      const client = getAnthropicClient();
      const response = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      const text = response.content[0].type === "text" ? response.content[0].text : "";
      return parseAIResponse(text);
    } else {
      const client = getOpenAIClient();
      const response = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? "gpt-4o",
        max_tokens: 1024,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      });
      const text = response.choices[0]?.message?.content ?? "";
      return parseAIResponse(text);
    }
  } catch {
    // Fallback if AI fails
    return buildFallbackEnrichment(totalAffected, breakCount, intent.changeType);
  }
}

function parseAIResponse(text: string): AIEnrichment {
  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
    const parsed = JSON.parse(cleaned);

    const validRiskLevels: RiskLevel[] = ["low", "medium", "high", "critical"];
    const validEffortLevels: EffortLevel[] = ["trivial", "small", "medium", "large", "epic"];

    return {
      riskAssessment: validRiskLevels.includes(parsed.riskAssessment) ? parsed.riskAssessment : "medium",
      riskExplanation: typeof parsed.riskExplanation === "string" ? parsed.riskExplanation : "Risk level assessed based on dependency analysis.",
      estimatedEffort: validEffortLevels.includes(parsed.estimatedEffort) ? parsed.estimatedEffort : "medium",
      sideEffects: Array.isArray(parsed.sideEffects) ? parsed.sideEffects.map(String) : [],
      prerequisiteChanges: Array.isArray(parsed.prerequisiteChanges) ? parsed.prerequisiteChanges.map(String) : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
      summary: typeof parsed.summary === "string" ? parsed.summary : "Impact analysis complete.",
    };
  } catch {
    return buildFallbackEnrichment(0, 0, "modify");
  }
}

function buildFallbackEnrichment(
  affectedCount: number,
  breakCount: number,
  changeType: string,
): AIEnrichment {
  let risk: RiskLevel = "low";
  if (breakCount > 10 || affectedCount > 30) risk = "critical";
  else if (breakCount > 4 || affectedCount > 10) risk = "high";
  else if (breakCount > 0 || affectedCount > 2) risk = "medium";

  let effort: EffortLevel = "small";
  if (affectedCount > 30) effort = "epic";
  else if (affectedCount > 15) effort = "large";
  else if (affectedCount > 5) effort = "medium";
  else if (affectedCount > 0) effort = "small";
  else effort = "trivial";

  const changeVerb = changeType === "remove" ? "removing" : changeType === "modify" ? "modifying" : changeType;

  return {
    riskAssessment: risk,
    riskExplanation: `${affectedCount} item(s) directly affected with ${breakCount} potential break(s).`,
    estimatedEffort: effort,
    sideEffects: [
      "Runtime behavior changes may not be caught by static analysis",
      "Test coverage may be affected",
    ],
    prerequisiteChanges: breakCount > 0 ? ["Update all callers before making the change"] : [],
    recommendations: [
      `Write tests before ${changeVerb} to capture current behavior`,
      "Run the full test suite after each incremental change",
      "Update documentation and comments that reference the changed code",
    ],
    summary: `This change affects ${affectedCount} item(s) in the codebase with ${breakCount} potential break(s). ${risk === "critical" || risk === "high" ? "Proceed with care and incremental updates." : "Proceed with standard caution."}`,
  };
}

// ---------------------------------------------------------------------------
// Main simulation function
// ---------------------------------------------------------------------------

export async function simulateChange(
  repoConnectionId: string,
  description: string,
): Promise<WhatIfResult> {
  // 1. Parse intent (no LLM)
  const intent = parseChangeIntent(description);

  // 2. Resolve targets against DB
  const { targetSymbols, targetFiles } = await resolveTargets(repoConnectionId, intent);

  // 3. Graph analysis
  const targetSymbolIds = targetSymbols.map((s) => s.id);

  const blast = await computeBlastRadius(targetSymbolIds, repoConnectionId, 3);

  // 4. Build affected items and breaks
  const { affectedItems: directItems, breaks: directBreaks } = buildAffectedItems(
    blast.directDependents,
    intent.changeType,
  );

  const { affectedItems: indirectItems } = buildAffectedItems(
    blast.indirectDependents,
    intent.changeType === "remove" ? "modify" : intent.changeType,
  );

  // For target files with no symbol matches, add file-level items
  const filePathsInDirect = new Set(directItems.map((a) => a.filePath));
  const additionalFileItems: AffectedItem[] = [];

  for (const tf of targetFiles) {
    if (!filePathsInDirect.has(tf.path) && intent.changeType !== "add") {
      additionalFileItems.push({
        filePath: tf.path,
        symbolName: null,
        startLine: 1,
        endLine: 1,
        impact: `Target file — contains the ${intent.changeType} target`,
        severity: "info",
      });
    }
  }

  const directlyAffected = [...additionalFileItems, ...directItems];
  const indirectlyAffected = indirectItems;
  const potentialBreaks = directBreaks;

  // 5. AI enrichment
  const aiResult = await enrichWithAI(
    description,
    intent,
    directlyAffected,
    potentialBreaks,
    targetSymbols.length,
  );

  return {
    changeDescription: description,
    parsedIntent: intent,
    directlyAffected,
    indirectlyAffected,
    potentialBreaks,
    riskAssessment: aiResult.riskAssessment,
    riskExplanation: aiResult.riskExplanation,
    estimatedEffort: aiResult.estimatedEffort,
    recommendations: aiResult.recommendations,
    sideEffects: aiResult.sideEffects,
    prerequisiteChanges: aiResult.prerequisiteChanges,
    summary: aiResult.summary,
  };
}
