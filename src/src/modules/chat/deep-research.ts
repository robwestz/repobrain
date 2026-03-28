/**
 * Deep Research module — multi-iteration, gap-driven codebase research.
 *
 * Inspired by DeepWiki's iterative research approach:
 *   - Iteration 1:  Plan the research approach, run initial retrieval, surface gaps
 *   - Iteration 2–N: Use identified gaps to generate fresh queries, retrieve more context,
 *                    accumulate findings
 *   - Final:        Synthesize everything into a comprehensive cited answer
 *
 * The generator yields a ResearchIteration after each iteration so the caller can
 * stream progress to the client over SSE in real time.
 */

import { retrieve } from "../retrieval/index";
import {
  getProvider,
  getOpenAIClient,
  getAnthropicClient,
  LLM_MODEL,
  LLM_MAX_TOKENS,
} from "../llm/provider";
import { formatContextForPrompt } from "../retrieval/context";
import type { RetrievalResult } from "../../types/retrieval";
import { logger } from "../../lib/logger";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ResearchIteration {
  iteration: number;
  phase: "planning" | "investigating" | "synthesizing";
  content: string;
  queries: string[];
  newFindings: string[];
  gaps: string[];
}

export interface DeepResearchResult {
  question: string;
  iterations: ResearchIteration[];
  finalSynthesis: string;
  totalChunksRetrieved: number;
  totalDurationMs: number;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const DEEP_RESEARCH_SYSTEM_PROMPT = `You are RepoBrain, an expert codebase intelligence assistant performing deep iterative research.

## Citation Format
When you reference specific code, you MUST cite it using this exact format:
  [file:path/to/file.ts:L15-L30]

Replace each part with actual values from the provided context.

## Rules
1. Every factual claim about the codebase MUST have at least one citation.
2. ONLY cite files and line ranges that appear in the provided "Relevant Code" section.
3. Be thorough, analytical, and precise.
4. Always ground your answers in actual code evidence.`;

function buildFirstIterationPrompt(question: string, contextText: string): string {
  return `You are beginning a deep research session about a codebase. Your task for this first iteration is to:

1. Analyse the provided code context carefully
2. Extract key findings relevant to the question
3. Identify what aspects of the question you can ALREADY answer from the current context
4. Identify GAPS — what important information is still missing to give a complete answer

## Retrieved Code Context
${contextText}

## Research Question
${question}

## Your Response Format
Respond in this exact JSON structure (no markdown fences, pure JSON):
{
  "analysis": "Your detailed analysis of what the current context reveals about the question. Include specific code observations and cite evidence using [file:path:L1-L10] format.",
  "findings": ["Key finding 1", "Key finding 2", "..."],
  "gaps": ["What is still unknown or unclear 1", "What needs further investigation 2", "..."],
  "nextQueries": ["Specific search query to investigate gap 1", "Specific search query 2", "..."]
}

Be specific about gaps and make nextQueries targeted technical searches (e.g. "AuthMiddleware class implementation", "session token validation logic").`;
}

function buildIntermediateIterationPrompt(
  question: string,
  contextText: string,
  previousFindings: string[],
  previousGaps: string[],
  iterationNumber: number,
  totalIterations: number,
): string {
  return `You are continuing deep research (iteration ${iterationNumber} of ${totalIterations}).

## Previous Findings
${previousFindings.map((f, i) => `${i + 1}. ${f}`).join("\n")}

## Remaining Gaps to Investigate
${previousGaps.map((g, i) => `${i + 1}. ${g}`).join("\n")}

## Newly Retrieved Code Context
${contextText}

## Original Research Question
${question}

## Your Response Format
Respond in this exact JSON structure (no markdown fences, pure JSON):
{
  "analysis": "Your analysis of the new context and how it addresses the gaps. Build on the previous findings. Cite evidence using [file:path:L1-L10] format.",
  "findings": ["New finding 1", "New finding 2", "..."],
  "gaps": ["Remaining unknown 1", "Still unclear 2", "..."],
  "nextQueries": ["Query to investigate remaining gap 1", "Query 2", "..."]
}

Focus on what is NEW in this iteration. Only list gaps that are still genuinely unresolved.
${iterationNumber >= totalIterations - 1 ? "\nThis is the second-to-last iteration. List only the most critical remaining gaps." : ""}`;
}

function buildFinalSynthesisPrompt(
  question: string,
  allContextTexts: string[],
  allFindings: string[],
): string {
  return `You are completing a deep research session. Synthesize ALL findings into a comprehensive, well-structured answer.

## All Research Findings
${allFindings.map((f, i) => `${i + 1}. ${f}`).join("\n")}

## Combined Code Context (all iterations)
${allContextTexts.join("\n\n---\n\n")}

## Original Research Question
${question}

## Instructions
Write a comprehensive, expert-level answer that:
1. Directly and thoroughly answers the question
2. References specific code with citations [file:path:L1-L10]
3. Explains HOW and WHY, not just what
4. Organises the information logically with clear sections
5. Highlights important architectural decisions and patterns found
6. Notes any limitations or caveats where context was incomplete

Write the answer as flowing prose with markdown formatting (headers, code references). Do NOT include JSON — this is the final synthesis.`;
}

// ---------------------------------------------------------------------------
// Core deep research generator
// ---------------------------------------------------------------------------

export async function* deepResearch(
  question: string,
  repoConnectionId: string,
  maxIterations = 3,
): AsyncGenerator<ResearchIteration> {
  const startTime = Date.now();
  const clampedMax = Math.max(2, Math.min(5, maxIterations));

  logger.info({ repoConnectionId, question: question.slice(0, 120), maxIterations: clampedMax }, "deep-research: starting");

  const allFindings: string[] = [];
  const allContextTexts: string[] = [];
  let totalChunks = 0;
  let currentGaps: string[] = [];
  let nextQueries: string[] = [];

  // -------------------------------------------------------------------------
  // Iteration 1 — Planning / initial retrieval
  // -------------------------------------------------------------------------

  const iter1RetrievalResult = await retrieve(question, repoConnectionId, { maxResults: 15 });
  totalChunks += iter1RetrievalResult.chunks.length;
  const iter1ContextText = buildContextText(iter1RetrievalResult);
  allContextTexts.push(iter1ContextText);

  const iter1Prompt = buildFirstIterationPrompt(question, iter1ContextText);
  const iter1Response = await callLlmOnce(iter1Prompt, DEEP_RESEARCH_SYSTEM_PROMPT);

  const iter1Parsed = parseIterationJson(iter1Response);

  const iter1: ResearchIteration = {
    iteration: 1,
    phase: "planning",
    content: iter1Parsed.analysis,
    queries: [question],
    newFindings: iter1Parsed.findings,
    gaps: iter1Parsed.gaps,
  };

  allFindings.push(...iter1Parsed.findings);
  currentGaps = iter1Parsed.gaps;
  nextQueries = iter1Parsed.nextQueries;

  logger.info({
    repoConnectionId,
    iteration: 1,
    findings: iter1Parsed.findings.length,
    gaps: iter1Parsed.gaps.length,
  }, "deep-research: iteration 1 complete");

  yield iter1;

  // -------------------------------------------------------------------------
  // Iterations 2..N-1 — Investigating gaps
  // -------------------------------------------------------------------------

  for (let i = 2; i < clampedMax; i++) {
    // Pick the top queries from the previous iteration's suggestions
    const queriesToRun = nextQueries.slice(0, 3).filter(Boolean);
    if (queriesToRun.length === 0) queriesToRun.push(question);

    // Run retrieval for each gap query and merge unique chunks
    const allChunks = await retrieveForQueries(queriesToRun, repoConnectionId);
    totalChunks += allChunks.length;

    // Build merged context from new chunks
    const mergedContextText = allChunks.length > 0
      ? allChunks.map((c) => `### ${c.filePath} (L${c.startLine}–L${c.endLine})\n\`\`\`\n${c.content}\n\`\`\``).join("\n\n")
      : "(No new context found for these queries)";
    allContextTexts.push(mergedContextText);

    const interPrompt = buildIntermediateIterationPrompt(
      question,
      mergedContextText,
      allFindings,
      currentGaps,
      i,
      clampedMax,
    );
    const interResponse = await callLlmOnce(interPrompt, DEEP_RESEARCH_SYSTEM_PROMPT);
    const interParsed = parseIterationJson(interResponse);

    const iterResult: ResearchIteration = {
      iteration: i,
      phase: "investigating",
      content: interParsed.analysis,
      queries: queriesToRun,
      newFindings: interParsed.findings,
      gaps: interParsed.gaps,
    };

    allFindings.push(...interParsed.findings);
    currentGaps = interParsed.gaps;
    nextQueries = interParsed.nextQueries;

    logger.info({
      repoConnectionId,
      iteration: i,
      findings: interParsed.findings.length,
      gaps: interParsed.gaps.length,
    }, `deep-research: iteration ${i} complete`);

    yield iterResult;
  }

  // -------------------------------------------------------------------------
  // Final iteration — Synthesis
  // -------------------------------------------------------------------------

  const finalPrompt = buildFinalSynthesisPrompt(question, allContextTexts, allFindings);
  const finalSynthesis = await callLlmOnce(finalPrompt, DEEP_RESEARCH_SYSTEM_PROMPT);

  const totalDurationMs = Date.now() - startTime;

  logger.info({
    repoConnectionId,
    totalIterations: clampedMax,
    totalChunks,
    totalDurationMs,
  }, "deep-research: synthesis complete");

  const finalIteration: ResearchIteration = {
    iteration: clampedMax,
    phase: "synthesizing",
    content: finalSynthesis,
    queries: nextQueries.slice(0, 3),
    newFindings: [],
    gaps: [],
  };

  yield finalIteration;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildContextText(result: RetrievalResult): string {
  const contextWindow = {
    repoSummary: result.repoSummary,
    contextChunks: result.chunks.map((c) => ({
      filePath: c.filePath,
      startLine: c.startLine,
      endLine: c.endLine,
      content: c.content,
      symbolName: c.symbolName,
      language: c.language,
      score: c.score,
    })),
    totalTokens: result.totalTokens,
  };
  return formatContextForPrompt(contextWindow);
}

interface RetrievedChunk {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
}

async function retrieveForQueries(
  queries: string[],
  repoConnectionId: string,
): Promise<RetrievedChunk[]> {
  const results = await Promise.all(
    queries.map((q) =>
      retrieve(q, repoConnectionId, { maxResults: 10 }).catch(() => null),
    ),
  );

  // Deduplicate by filePath+startLine
  const seen = new Set<string>();
  const merged: RetrievedChunk[] = [];

  for (const result of results) {
    if (!result) continue;
    for (const chunk of result.chunks) {
      const key = `${chunk.filePath}:${chunk.startLine}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({
          filePath: chunk.filePath,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          content: chunk.content,
        });
      }
    }
  }

  return merged;
}

interface IterationJsonParsed {
  analysis: string;
  findings: string[];
  gaps: string[];
  nextQueries: string[];
}

function parseIterationJson(raw: string): IterationJsonParsed {
  // Strip any accidental markdown code fences
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as Partial<IterationJsonParsed>;
    return {
      analysis: typeof parsed.analysis === "string" ? parsed.analysis : raw,
      findings: Array.isArray(parsed.findings) ? parsed.findings.filter((f) => typeof f === "string") : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.filter((g) => typeof g === "string") : [],
      nextQueries: Array.isArray(parsed.nextQueries) ? parsed.nextQueries.filter((q) => typeof q === "string") : [],
    };
  } catch {
    // Fallback: treat the whole response as analysis
    return {
      analysis: raw,
      findings: [],
      gaps: [],
      nextQueries: [],
    };
  }
}

/**
 * Make a single (non-streaming) LLM call and return the full text.
 * Used for each research iteration since we want the complete JSON before
 * yielding the iteration result.
 */
async function callLlmOnce(userMessage: string, systemPrompt: string): Promise<string> {
  const provider = getProvider();

  if (provider === "openai") {
    const client = getOpenAIClient();
    const completion = await client.chat.completions.create({
      model: LLM_MODEL,
      max_tokens: LLM_MAX_TOKENS,
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });
    return completion.choices[0]?.message?.content ?? "";
  } else {
    const client = getAnthropicClient();
    const message = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: LLM_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    const block = message.content[0];
    return block && block.type === "text" ? block.text : "";
  }
}
