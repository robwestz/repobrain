/**
 * Multi-agent specialist executor.
 *
 * Runs N specialist agents in parallel via Promise.all.
 * Each specialist retrieves domain-scoped context, then calls the LLM.
 * A coordinator takes all specialist findings and synthesizes a final report.
 */

import { retrieve } from "../retrieval/index";
import { getProvider, getOpenAIClient, getAnthropicClient, LLM_MODEL, LLM_MAX_TOKENS } from "../llm/provider";
import { logger } from "../../lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpecialistConfig {
  /** Human-readable role label, e.g. "Security Auditor" */
  role: string;
  /** Full task prompt injected before the retrieved context */
  prompt: string;
  /** Optional keyword to focus retrieval query on a domain */
  domainFilter?: string;
  /** Max characters of retrieved context to include (rough guard) */
  contextBudget?: number;
}

export interface SpecialistResult {
  role: string;
  findings: string;
  severity?: "info" | "warning" | "critical";
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Low-level LLM call (non-streaming, for specialists)
// ---------------------------------------------------------------------------

async function callLLM(systemPrompt: string, userMessage: string): Promise<string> {
  const provider = getProvider();

  if (provider === "openai") {
    const client = getOpenAIClient();
    const resp = await client.chat.completions.create({
      model: LLM_MODEL,
      max_tokens: LLM_MAX_TOKENS,
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });
    return resp.choices[0]?.message?.content ?? "";
  } else {
    const client = getAnthropicClient();
    const resp = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: LLM_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    const block = resp.content[0];
    return block.type === "text" ? block.text : "";
  }
}

// ---------------------------------------------------------------------------
// Run a single specialist
// ---------------------------------------------------------------------------

async function runSpecialist(
  repoConnectionId: string,
  config: SpecialistConfig,
): Promise<SpecialistResult> {
  const contextBudget = config.contextBudget ?? 8000;
  const query = config.domainFilter
    ? `${config.domainFilter} ${config.role}`
    : config.role;

  try {
    // Retrieve domain-scoped context
    const retrievalResult = await retrieve(query, repoConnectionId, {
      maxResults: 12,
      maxContextTokens: 6000,
    });

    // Build context text from ranked chunks
    const contextText = retrievalResult.chunks
      .map((c) => `### File: ${c.filePath} (L${c.startLine}-L${c.endLine})\n${c.content}`)
      .join("\n\n")
      .slice(0, contextBudget * 4); // rough char budget (4 chars ≈ 1 token)

    const userMessage = contextText
      ? `<context>\n${contextText}\n</context>\n\nAnalyze the code above and provide your findings.`
      : "No code context was retrieved for this domain. Provide general guidance based on what you know about this codebase type.";

    const findings = await callLLM(config.prompt, userMessage);

    return { role: config.role, findings, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ role: config.role, error: message }, "specialist failed");
    return {
      role: config.role,
      findings: `[Analysis failed: ${message}]`,
      success: false,
      error: message,
    };
  }
}

// ---------------------------------------------------------------------------
// Coordinator synthesis
// ---------------------------------------------------------------------------

async function runCoordinator(
  synthesisPrompt: string,
  specialistResults: SpecialistResult[],
): Promise<string> {
  const findings = specialistResults
    .map((r) =>
      r.success
        ? `## ${r.role.toUpperCase()} Analysis\n${r.findings}`
        : `## ${r.role.toUpperCase()} Analysis\n[Failed: ${r.error}]`,
    )
    .join("\n\n");

  const userMessage = `<specialist_findings>\n${findings}\n</specialist_findings>\n\nSynthesize the above findings into a comprehensive report.`;

  return callLLM(synthesisPrompt, userMessage);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runSpecialists(
  repoConnectionId: string,
  specialists: SpecialistConfig[],
  synthesisPrompt: string,
): Promise<{ specialists: SpecialistResult[]; synthesis: string }> {
  // Run all specialists in parallel
  const results = await Promise.all(
    specialists.map((spec) => runSpecialist(repoConnectionId, spec)),
  );

  // Synthesize
  const synthesis = await runCoordinator(synthesisPrompt, results);

  return { specialists: results, synthesis };
}
