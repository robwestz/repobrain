/**
 * ADR Generator — reverse-engineers Architecture Decision Records from code.
 *
 * Phase 1: Broad retrieval to discover architectural decisions
 * Phase 2: N parallel specialists each write a full ADR document
 * Phase 3: Coordinator creates an index with cross-references
 *
 * Adapted from DeepWiki's adr_generator.py.
 */

import { retrieve } from "../retrieval/index";
import { getProvider, getOpenAIClient, getAnthropicClient, LLM_MODEL, LLM_MAX_TOKENS } from "../llm/provider";
import { logger } from "../../lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ADRDecision {
  id: string;
  title: string;
  domain: string;
  evidenceFiles: string[];
  summary: string;
}

export interface ADRDocument {
  id: string;
  title: string;
  content: string;
  success: boolean;
  error?: string;
}

export interface ADRGeneratorResult {
  index: string;
  adrs: ADRDocument[];
  decisions: ADRDecision[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Prompts (adapted from DeepWiki adr_prompts.py)
// ---------------------------------------------------------------------------

const DISCOVERY_PROMPT = `You are an expert software architect analyzing a codebase to reverse-engineer Architecture Decision Records (ADRs).

Identify 6-12 significant architectural decisions visible in the code.

Look for:
1. Framework/library choices (e.g., "chose Next.js over CRA", "uses Drizzle ORM")
2. Design patterns in use (e.g., "repository pattern", "event-driven architecture")
3. Database/storage decisions (e.g., "PostgreSQL with pgvector", "Redis for caching")
4. API design choices (e.g., "REST API routes", "Server-Sent Events for streaming")
5. Authentication/authorization approach
6. Deployment/infrastructure choices (e.g., "Docker-based", "BullMQ for job queues")
7. Testing strategy
8. State management approach
9. Error handling strategy
10. Code organization and module structure

Output ONLY a JSON array (no markdown fences, no commentary):
[
  {
    "id": "ADR-001",
    "title": "Short title of the decision",
    "domain": "framework|database|api|security|deployment|testing|architecture|other",
    "evidenceFiles": ["path/to/file.ts"],
    "summary": "One-line summary of what was decided"
  }
]

Only report decisions you can see evidence for. Do not speculate.`;

const ADR_SPECIALIST_TEMPLATE = (decisionId: string, title: string, domain: string, evidenceFiles: string) =>
  `You are an expert software architect writing an Architecture Decision Record (ADR).

Write a complete ADR for:
**Decision ID**: ${decisionId}
**Title**: ${title}
**Domain**: ${domain}
**Evidence files**: ${evidenceFiles || "infer from context"}

Use this standard ADR format:

# ${decisionId}: ${title}

## Status
Accepted (inferred from codebase)

## Context
What issue is this decision addressing? What forces and constraints are at play?
(Infer from codebase structure, dependencies, and patterns)

## Decision
What was chosen? Be specific about the choice and likely alternatives considered.

## Consequences

### Positive
- What becomes easier or possible?

### Negative
- What becomes harder? What are the trade-offs?

### Risks
- What risks does this decision introduce?

## Evidence
Reference specific files and code patterns that show this decision in action.

---
Base your analysis on the actual code context provided. Be factual and specific.`;

const INDEX_PROMPT = `You are an expert software architect creating an ADR index document.

Given the ADR summaries provided, create a well-organized index with cross-references.

Output format:

# Architecture Decision Records — Index

## Overview
Brief paragraph about the architectural philosophy visible in these decisions.

## Decision Index

| ID | Title | Domain | Status | Key Trade-off |
|----|-------|--------|--------|---------------|
(Fill from the summaries)

## Architecture Overview
Describe how these decisions fit together to form the overall architecture.
Include a Mermaid diagram showing relationships between major components:

\`\`\`mermaid
graph TD
    ...
\`\`\`

## Key Trade-offs
Summarize the most significant trade-offs visible across all decisions.

## Recommendations
Based on the patterns observed, suggest 2-3 areas where decisions should be revisited or documented more formally.`;

// ---------------------------------------------------------------------------
// LLM helper
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
// Parse decision list from LLM response
// ---------------------------------------------------------------------------

function parseDecisions(response: string): ADRDecision[] {
  // Strip markdown fences if present
  const cleaned = response.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  // Try to find a JSON array
  const match = cleaned.match(/\[[\s\S]*?\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        return parsed.map((d, i) => ({
          id: d.id ?? `ADR-${String(i + 1).padStart(3, "0")}`,
          title: d.title ?? "Unknown Decision",
          domain: d.domain ?? "architecture",
          evidenceFiles: Array.isArray(d.evidenceFiles) ? d.evidenceFiles : [],
          summary: d.summary ?? "",
        }));
      }
    } catch {
      // Fall through to line parsing
    }
  }

  // Fallback: parse numbered lines
  const decisions: ADRDecision[] = [];
  for (const line of response.split("\n")) {
    const m = line.trim().match(/^(?:ADR-)?(\d+)[.:]\s+(.*)/);
    if (m) {
      decisions.push({
        id: `ADR-${m[1].padStart(3, "0")}`,
        title: m[2].split(" - ")[0].trim(),
        domain: "architecture",
        evidenceFiles: [],
        summary: m[2],
      });
    }
  }

  return decisions;
}

// ---------------------------------------------------------------------------
// Generate a single ADR document
// ---------------------------------------------------------------------------

async function generateADR(
  decision: ADRDecision,
  repoConnectionId: string,
): Promise<ADRDocument> {
  try {
    const query = `${decision.domain} ${decision.title} ${decision.evidenceFiles.join(" ")}`;
    const retrievalResult = await retrieve(query, repoConnectionId, {
      maxResults: 10,
      maxContextTokens: 5000,
    });

    const contextText = retrievalResult.chunks
      .map((c) => `### File: ${c.filePath} (L${c.startLine}-L${c.endLine})\n${c.content}`)
      .join("\n\n")
      .slice(0, 16000);

    const prompt = ADR_SPECIALIST_TEMPLATE(
      decision.id,
      decision.title,
      decision.domain,
      decision.evidenceFiles.join(", "),
    );

    const userMessage = contextText
      ? `<codebase_context>\n${contextText}\n</codebase_context>\n\nWrite the ADR based on this evidence.`
      : "Write the ADR based on what you know about this type of decision.";

    const content = await callLLM(prompt, userMessage);

    return { id: decision.id, title: decision.title, content, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ adrId: decision.id, error: message }, "ADR specialist failed");
    return {
      id: decision.id,
      title: decision.title,
      content: `[Failed to generate ADR: ${message}]`,
      success: false,
      error: message,
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runADRGenerator(repoConnectionId: string): Promise<ADRGeneratorResult> {
  // Phase 1: Broad retrieval to discover decisions
  const discoveryQueries = [
    "framework library technology stack dependencies package.json",
    "architecture design patterns structure modules",
    "database storage schema migrations",
    "api routes endpoints handlers",
    "authentication authorization security",
    "deployment docker configuration infrastructure",
  ];

  // Gather context from multiple domain queries
  const allChunks: Array<{ filePath: string; startLine: number; endLine: number; content: string }> = [];
  const seenPaths = new Set<string>();

  for (const query of discoveryQueries) {
    try {
      const result = await retrieve(query, repoConnectionId, {
        maxResults: 8,
        maxContextTokens: 3000,
      });
      for (const chunk of result.chunks) {
        if (!seenPaths.has(chunk.filePath)) {
          seenPaths.add(chunk.filePath);
          allChunks.push(chunk);
        }
      }
    } catch {
      // Continue with other queries
    }
  }

  const discoveryContext = allChunks
    .slice(0, 25)
    .map((c) => `### File: ${c.filePath} (L${c.startLine}-L${c.endLine})\n${c.content.slice(0, 1500)}`)
    .join("\n\n");

  // Call LLM to discover decisions
  const discoveryUserMessage = `<codebase_context>\n${discoveryContext}\n</codebase_context>\n\nIdentify the architectural decisions in this codebase.`;
  const discoveryResponse = await callLLM(DISCOVERY_PROMPT, discoveryUserMessage);

  let decisions = parseDecisions(discoveryResponse);

  // Fallback if parsing fails
  if (decisions.length === 0) {
    decisions = [
      { id: "ADR-001", title: "Technology Stack Choice", domain: "framework", evidenceFiles: [], summary: "Primary framework and language selection" },
      { id: "ADR-002", title: "Data Storage Strategy", domain: "database", evidenceFiles: [], summary: "Database and caching layer choices" },
      { id: "ADR-003", title: "API Design Approach", domain: "api", evidenceFiles: [], summary: "API patterns and communication protocols" },
    ];
  }

  // Cap at 10 ADRs
  const cappedDecisions = decisions.slice(0, 10);

  // Phase 2: Generate all ADR documents in parallel
  const adrDocuments = await Promise.all(
    cappedDecisions.map((decision) => generateADR(decision, repoConnectionId)),
  );

  // Phase 3: Build index
  const adrSummaries = adrDocuments
    .map((doc, i) => {
      const decision = cappedDecisions[i];
      const summary = doc.success ? doc.content.slice(0, 600) : `[Failed: ${doc.error}]`;
      return `### ${decision.id}: ${decision.title}\n${summary}`;
    })
    .join("\n\n");

  const indexUserMessage = `<adr_summaries>\n${adrSummaries}\n</adr_summaries>\n\nCreate the ADR index document.`;
  const index = await callLLM(INDEX_PROMPT, indexUserMessage);

  return {
    index,
    adrs: adrDocuments,
    decisions: cappedDecisions,
    generatedAt: new Date().toISOString(),
  };
}
