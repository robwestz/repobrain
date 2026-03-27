/**
 * git-timeline/service.ts
 *
 * Orchestrates git log retrieval + AI-powered semantic summarization.
 *
 * Flow:
 *  1. Look up clonePath from repo_connections
 *  2. Run git log via simple-git
 *  3. For each commit, get diff stats (files + additions/deletions)
 *  4. Match diffs to DB symbols via symbol-matcher
 *  5. Batch commits in groups of 10 → send to LLM for semantic summaries
 *  6. Cache in Redis (key: timeline:{repoConnectionId}[:{filePath}], TTL 10 min)
 *  7. Return enriched TimelineEntry[]
 */

import simpleGit from "simple-git";
import { db } from "@/src/lib/db";
import { repoConnections } from "@/src/lib/db/schema";
import { eq } from "drizzle-orm";
import { getRedis } from "@/src/lib/redis";
import { getOpenAIClient, getProvider, getAnthropicClient, LLM_MODEL } from "@/src/modules/llm/provider";
import { matchDiffToSymbols } from "./symbol-matcher";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AffectedFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface TimelineEntry {
  id: string;              // same as sha (used as React key)
  sha: string;
  shortSha: string;
  date: string;            // ISO 8601
  author: string;
  originalMessage: string;
  semanticSummary: string; // AI-generated
  impactLevel: "minor" | "moderate" | "major";
  affectedFiles: AffectedFile[];
  affectedSymbols: string[];
  tags: string[];          // e.g. ["auth", "refactor", "bugfix", "feature", "deps"]
}

export interface TimelineOptions {
  limit?: number;   // default 50, max 200
  since?: string;   // ISO date string
  filePath?: string;
}

export interface TimelineResult {
  entries: TimelineEntry[];
  total: number;
  cached: boolean;
}

// ---------------------------------------------------------------------------
// Raw commit data (before LLM enrichment)
// ---------------------------------------------------------------------------

interface RawCommit {
  sha: string;
  date: string;
  author: string;
  message: string;
  affectedFiles: AffectedFile[];
  affectedSymbols: string[];
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

const CACHE_TTL_SECONDS = 600; // 10 minutes

function cacheKey(repoConnectionId: string, options: TimelineOptions): string {
  const parts = [`timeline:${repoConnectionId}`];
  if (options.limit) parts.push(`limit:${options.limit}`);
  if (options.since) parts.push(`since:${options.since}`);
  if (options.filePath) parts.push(`file:${options.filePath}`);
  return parts.join(":");
}

// ---------------------------------------------------------------------------
// LLM batch summarisation
// ---------------------------------------------------------------------------

interface LLMCommitSummary {
  sha: string;
  semanticSummary: string;
  impactLevel: "minor" | "moderate" | "major";
  tags: string[];
}

const SUMMARISE_SYSTEM_PROMPT = `You are a code intelligence assistant that produces concise semantic summaries of git commits.
For each commit provided, return a JSON array where each object has:
- "sha": the commit SHA (copy from input)
- "semanticSummary": one sentence (max 120 chars) describing WHAT changed semantically (e.g. "Added rate limiting to login endpoint to prevent brute-force attacks")
- "impactLevel": one of "minor", "moderate", or "major"
  - minor: docs, formatting, small refactors, dependency bumps
  - moderate: new features, significant refactors, behavior changes
  - major: breaking changes, security fixes, database migrations, API changes
- "tags": array of 1-5 lowercase strings from: ["feature", "bugfix", "refactor", "docs", "deps", "security", "auth", "api", "test", "config", "perf", "ui"]

Respond with ONLY valid JSON — no prose, no markdown code fences. Example:
[{"sha":"abc123","semanticSummary":"Fixed null check in session validation","impactLevel":"moderate","tags":["bugfix","auth"]}]`;

async function summariseBatch(
  batch: RawCommit[],
): Promise<LLMCommitSummary[]> {
  const input = batch.map((c) => ({
    sha: c.sha,
    message: c.message,
    files: c.affectedFiles.map((f) => `${f.path} (+${f.additions}/-${f.deletions})`),
  }));

  const userContent = `Summarise these ${batch.length} commits:\n${JSON.stringify(input, null, 2)}`;

  let rawText = "";

  try {
    const provider = getProvider();

    if (provider === "anthropic") {
      const anthropic = getAnthropicClient();
      const resp = await anthropic.messages.create({
        model: LLM_MODEL,
        max_tokens: 2048,
        system: SUMMARISE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      });
      const block = resp.content[0];
      rawText = block.type === "text" ? block.text : "";
    } else {
      const openai = getOpenAIClient();
      const resp = await openai.chat.completions.create({
        model: LLM_MODEL,
        max_tokens: 2048,
        messages: [
          { role: "system", content: SUMMARISE_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      });
      rawText = resp.choices[0]?.message?.content ?? "";
    }

    // Strip markdown code fences if present
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    const parsed = JSON.parse(cleaned) as LLMCommitSummary[];
    return parsed;
  } catch {
    // Fallback: return safe defaults for all commits in the batch
    return batch.map((c) => ({
      sha: c.sha,
      semanticSummary: c.message.slice(0, 120),
      impactLevel: "minor" as const,
      tags: [],
    }));
  }
}

// ---------------------------------------------------------------------------
// Git log helpers
// ---------------------------------------------------------------------------

async function getRawCommits(
  clonePath: string,
  repoConnectionId: string,
  options: TimelineOptions,
): Promise<{ commits: RawCommit[]; total: number }> {
  const git = simpleGit(clonePath);

  const limit = Math.min(options.limit ?? 50, 200);

  // Build git log args
  const logArgs: string[] = [
    "--format=%H|%aI|%an|%s",
    `--max-count=${limit}`,
  ];

  if (options.since) {
    logArgs.push(`--since=${options.since}`);
  }

  if (options.filePath) {
    logArgs.push("--", options.filePath);
  }

  // Get commit list
  const logOutput = await git.raw(["log", ...logArgs]);
  const lines = logOutput.trim().split("\n").filter(Boolean);

  // Count total (without limit)
  const countArgs = ["log", "--format=%H"];
  if (options.since) countArgs.push(`--since=${options.since}`);
  if (options.filePath) countArgs.push("--", options.filePath);
  const countOutput = await git.raw(countArgs);
  const total = countOutput.trim().split("\n").filter(Boolean).length;

  // Parse each commit and get diff stats
  const commits: RawCommit[] = [];

  for (const line of lines) {
    const [sha, date, author, ...messageParts] = line.split("|");
    if (!sha) continue;

    const message = messageParts.join("|").trim();

    let affectedFiles: AffectedFile[] = [];

    try {
      // Get diff --numstat for this commit (additions/deletions per file)
      const numstatOutput = await git.raw([
        "diff",
        "--numstat",
        `${sha}^`,
        sha,
      ]);

      const fileLines = numstatOutput.trim().split("\n").filter(Boolean);
      const parsedFiles: AffectedFile[] = [];
      const changedLinesByFile: Map<string, number[]> = new Map();

      for (const fileLine of fileLines) {
        // numstat format: "<additions>\t<deletions>\t<filename>"
        // Binary files show "-\t-\tfilename"
        const parts = fileLine.split("\t");
        if (parts.length < 3) continue;

        const addStr = parts[0].trim();
        const delStr = parts[1].trim();
        const filePath = parts.slice(2).join("\t").trim();

        if (!filePath) continue;

        const additions = addStr === "-" ? 0 : parseInt(addStr, 10) || 0;
        const deletions = delStr === "-" ? 0 : parseInt(delStr, 10) || 0;

        parsedFiles.push({ path: filePath, additions, deletions });
      }

      // For symbol matching: get diff with line numbers (only for text files, capped at 5 files)
      const filesToMatch = parsedFiles
        .filter((f) => f.additions > 0 || f.deletions > 0)
        .slice(0, 5);

      for (const f of filesToMatch) {
        try {
          const diffOutput = await git.raw([
            "diff",
            "--unified=0",
            `${sha}^`,
            sha,
            "--",
            f.path,
          ]);

          // Parse hunk headers to extract changed line numbers: @@ -a,b +c,d @@
          const changedLines: number[] = [];
          const hunkRegex = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;
          let match: RegExpExecArray | null;
          while ((match = hunkRegex.exec(diffOutput)) !== null) {
            const startLine = parseInt(match[1], 10);
            const count = match[2] !== undefined ? parseInt(match[2], 10) : 1;
            for (let i = 0; i < Math.max(count, 1); i++) {
              changedLines.push(startLine + i);
            }
          }

          if (changedLines.length > 0) {
            changedLinesByFile.set(f.path, changedLines);
          }
        } catch {
          // Diff for this file failed — skip symbol matching for it
        }
      }

      affectedFiles = parsedFiles;

      // Match symbols
      const allSymbols: string[] = [];
      for (const [filePath, lines] of changedLinesByFile.entries()) {
        const matched = await matchDiffToSymbols(repoConnectionId, filePath, lines);
        allSymbols.push(...matched);
      }
      const uniqueSymbols = Array.from(new Set(allSymbols));

      commits.push({
        sha,
        date: date ?? new Date().toISOString(),
        author: author ?? "Unknown",
        message,
        affectedFiles,
        affectedSymbols: uniqueSymbols,
      });
    } catch {
      // Root commit or diff failed — include with empty files
      commits.push({
        sha,
        date: date ?? new Date().toISOString(),
        author: author ?? "Unknown",
        message,
        affectedFiles: [],
        affectedSymbols: [],
      });
    }
  }

  return { commits, total };
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

export async function getTimeline(
  repoConnectionId: string,
  options: TimelineOptions = {},
): Promise<TimelineResult> {
  const redis = getRedis();
  const key = cacheKey(repoConnectionId, options);

  // 1. Try Redis cache
  try {
    const cached = await redis.get(key);
    if (cached) {
      const parsed = JSON.parse(cached) as TimelineResult;
      return { ...parsed, cached: true };
    }
  } catch {
    // Redis unavailable — continue without cache
  }

  // 2. Look up clone path
  const repoConn = await db.query.repoConnections.findFirst({
    where: eq(repoConnections.id, repoConnectionId),
  });

  if (!repoConn) {
    throw new Error(`Repo connection not found: ${repoConnectionId}`);
  }

  // 3. Get raw commits + diff stats + symbol matches
  const { commits: rawCommits, total } = await getRawCommits(
    repoConn.clonePath,
    repoConnectionId,
    options,
  );

  if (rawCommits.length === 0) {
    const result: TimelineResult = { entries: [], total: 0, cached: false };
    return result;
  }

  // 4. Batch LLM summarisation (groups of 10)
  const BATCH_SIZE = 10;
  const summaryMap = new Map<string, LLMCommitSummary>();

  for (let i = 0; i < rawCommits.length; i += BATCH_SIZE) {
    const batch = rawCommits.slice(i, i + BATCH_SIZE);
    const summaries = await summariseBatch(batch);
    for (const s of summaries) {
      summaryMap.set(s.sha, s);
    }
  }

  // 5. Merge raw data with LLM summaries
  const entries: TimelineEntry[] = rawCommits.map((raw) => {
    const summary = summaryMap.get(raw.sha);
    return {
      id: raw.sha,
      sha: raw.sha,
      shortSha: raw.sha.slice(0, 7),
      date: raw.date,
      author: raw.author,
      originalMessage: raw.message,
      semanticSummary: summary?.semanticSummary ?? raw.message.slice(0, 120),
      impactLevel: summary?.impactLevel ?? "minor",
      affectedFiles: raw.affectedFiles,
      affectedSymbols: raw.affectedSymbols,
      tags: summary?.tags ?? [],
    };
  });

  const result: TimelineResult = { entries, total, cached: false };

  // 6. Cache in Redis
  try {
    await redis.set(key, JSON.stringify(result), "EX", CACHE_TTL_SECONDS);
  } catch {
    // Cache write failed — not fatal
  }

  return result;
}
