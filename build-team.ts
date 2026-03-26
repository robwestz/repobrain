/**
 * RepoBrain SDK Agent Team Orchestrator
 *
 * Runs the implementation in phases using parallel Opus/Sonnet agents.
 * Uses subscription auth (no API key cost).
 *
 * Usage:
 *   npx tsx build-team.ts bootstrap     # Phase 1: Generate implementation bootstrap
 *   npx tsx build-team.ts build         # Phase 2: Build workstreams in parallel
 *   npx tsx build-team.ts build --ws=1  # Build only workstream 1
 *   npx tsx build-team.ts review        # Opus reviews what was built
 */
delete process.env.ANTHROPIC_API_KEY;

import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const PROJECT_DIR = "D:/aktiva-projekt/mix/repobrain";
const MASTER_PACKAGE = join(PROJECT_DIR, "00_MASTER_PACKAGE.md");
const BOOTSTRAP_FILE = join(PROJECT_DIR, "01_BOOTSTRAP.md");
const BUILD_DIR = join(PROJECT_DIR, "src");
const LOG_DIR = join(PROJECT_DIR, "agent-logs");

// Ensure directories exist
[BUILD_DIR, LOG_DIR].forEach((d) => {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
});

function readFile(path: string): string {
  return readFileSync(path, "utf-8");
}

function writeLog(name: string, content: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = join(LOG_DIR, `${timestamp}_${name}.md`);
  writeFileSync(logPath, content);
  console.log(`  Log saved: ${logPath}`);
}

// ---------------------------------------------------------------------------
// Agent runner with streaming output
// ---------------------------------------------------------------------------
async function runAgent(opts: {
  name: string;
  model: "opus" | "sonnet" | "haiku";
  prompt: string;
  tools?: string[];
  cwd?: string;
  silent?: boolean;
}): Promise<string> {
  const modelMap = {
    opus: "claude-opus-4-6",
    sonnet: "claude-sonnet-4-6",
    haiku: "claude-haiku-4-5-20251001",
  };

  const startTime = Date.now();
  console.log(`\n[$${opts.name}] Starting (${opts.model})...`);

  const instance = query({
    prompt: opts.prompt,
    options: {
      model: modelMap[opts.model],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      cwd: opts.cwd || PROJECT_DIR,
      allowedTools: opts.tools || [
        "Read",
        "Write",
        "Edit",
        "Bash",
        "Glob",
        "Grep",
      ],
    },
  });

  let result = "";
  let lastText = "";
  for await (const message of instance) {
    if (message.type === "assistant" && !opts.silent) {
      for (const block of message.message.content) {
        if (block.type === "text" && block.text !== lastText) {
          // Show brief progress
          const preview = block.text.slice(0, 120).replace(/\n/g, " ");
          if (preview.length > 10) {
            process.stdout.write(`  [${opts.name}] ${preview}...\r`);
          }
          lastText = block.text;
        }
      }
    }
    if (message.type === "result") {
      result = message.result;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[${opts.name}] Done in ${elapsed}s`);
  writeLog(opts.name, result);
  return result;
}

// ---------------------------------------------------------------------------
// Phase 1: Bootstrap — Opus reads master package, produces implementation plan
// ---------------------------------------------------------------------------
async function runBootstrap() {
  console.log("=== PHASE 1: BOOTSTRAP (Opus) ===\n");
  const masterPackage = readFile(MASTER_PACKAGE);

  const prompt = `You are an implementation agent team lead tasked with building the foundation of RepoBrain.

You are NOT here to redesign the product.
You are here to implement the product foundation according to the attached master package.

The attached package is the source of truth.

Your job is to:
- read it carefully
- preserve its architecture and scope boundaries
- implement in the intended order
- avoid drift
- produce concrete implementation outputs

Treat the attached package as a contract, not inspiration.

## MASTER PACKAGE

${masterPackage}

## YOUR TASK

Produce the IMPLEMENTATION_BOOTSTRAP document with these exact sections:

## 1. Recommended repository/app structure
Propose a concrete codebase structure for implementation, aligned with the package.

## 2. Workstream decomposition
Break the build into the minimum correct workstreams.

## 3. Dependency graph between workstreams
Show what depends on what.

## 4. Phase-1 implementation order
State exactly what should be built first, second, third, etc.

## 5. Non-negotiable invariants
List the things that must not drift.

## 6. Escalation triggers
List the situations where agents must stop and ask for review rather than improvise.

## 7. First executable milestone
Define the first milestone that should produce a real, testable vertical slice.

Write the bootstrap document to: ${BOOTSTRAP_FILE}

Be concrete. Be specific. Include exact file paths, exact command sequences, exact package names.`;

  const result = await runAgent({
    name: "bootstrap-opus",
    model: "opus",
    prompt,
    tools: ["Read", "Write", "Bash", "Glob", "Grep"],
  });

  console.log("\n=== BOOTSTRAP COMPLETE ===");
  console.log(`Bootstrap document: ${BOOTSTRAP_FILE}`);
  return result;
}

// ---------------------------------------------------------------------------
// Phase 2: Build — Parallel agents implement workstreams
// ---------------------------------------------------------------------------

interface Workstream {
  id: number;
  name: string;
  model: "opus" | "sonnet";
  description: string;
  prompt: string;
}

function getWorkstreams(): Workstream[] {
  const masterPackage = readFile(MASTER_PACKAGE);
  const bootstrap = existsSync(BOOTSTRAP_FILE) ? readFile(BOOTSTRAP_FILE) : "";

  const sharedContext = `
## MASTER PACKAGE (source of truth)
${masterPackage}

## IMPLEMENTATION BOOTSTRAP
${bootstrap}

## CRITICAL RULES
- Follow the master package as a contract
- Stay inside your workstream boundary
- Do not build features from other workstreams
- Do not add speculative features
- Write clean, typed TypeScript
- Add comments only where logic is non-obvious
- Create files in ${PROJECT_DIR}/src/
- Run \`npm install\` if you need packages
`;

  return [
    {
      id: 1,
      name: "ws1-skeleton-auth",
      model: "opus",
      description: "Project skeleton, database, auth",
      prompt: `${sharedContext}

## YOUR WORKSTREAM: WS1 — Project Skeleton + Auth

You must:
1. Initialize a Next.js 15 project with App Router, TypeScript, Tailwind CSS in ${PROJECT_DIR}/src/
2. Set up Drizzle ORM with PostgreSQL + pgvector
3. Create all database migrations matching the domain model in §05
4. Set up Redis connection + BullMQ
5. Implement GitHub OAuth flow (login page, callback route, session middleware)
6. Create the User table and populate on first login
7. Create protected API route middleware
8. Create the three-panel layout shell (left/center/right panels, empty states)
9. Create Docker Compose file (Postgres with pgvector extension + Redis)
10. Create .env.example with all required variables

Start with \`npx create-next-app@latest\` in the src/ directory.
Install packages: drizzle-orm, drizzle-kit, pg, @neondatabase/serverless, bullmq, ioredis, next-auth

Produce working, runnable code. Test with \`npm run build\` at the end.`,
    },
    {
      id: 2,
      name: "ws2-workspace-repo",
      model: "sonnet",
      description: "Workspace + repo connection",
      prompt: `${sharedContext}

## YOUR WORKSTREAM: WS2 — Workspace + Repo Connection

Depends on WS1 being complete.

You must:
1. Create Workspace CRUD API routes
2. Create RepoConnection API routes
3. Implement GitHub repo listing endpoint (fetch user's repos via GitHub API)
4. Create repo picker UI component
5. Implement clone job (BullMQ job that clones repo to local storage)
6. Track RepoConnection status (pending → cloning → indexing → ready/failed)
7. Create workspace page with repo selector
8. Show clone/connection status in UI

Use the database schema and module boundaries from WS1.
Read existing files before modifying them.`,
    },
    {
      id: 3,
      name: "ws3-ingestion",
      model: "opus",
      description: "Ingestion pipeline — parsing, symbols, embeddings",
      prompt: `${sharedContext}

## YOUR WORKSTREAM: WS3 — Ingestion Pipeline

Depends on WS2 being complete (needs cloned repo path).

You must:
1. Create file walker (skip .git, node_modules, vendor, binary files)
2. Implement language detection (by extension)
3. Integrate tree-sitter WASM for symbol extraction (JS, TS, Python, Go, Rust, Java)
4. Extract: functions, classes, methods, interfaces, imports, exports
5. Build symbol relationship edges (import → export links)
6. Implement symbol-aware chunking (~500 tokens per chunk, never split mid-symbol)
7. Implement embedding generation (OpenAI text-embedding-3-small, batched)
8. Store files, symbols, symbol_relations, chunks, embeddings in database
9. Create pgvector HNSW index on embeddings
10. Create Postgres GIN full-text index on chunk content
11. Track IndexJob progress (files_total, files_processed, symbols_found, etc.)
12. Make the pipeline idempotent (re-indexing same commit = same result)

Install: web-tree-sitter, tree-sitter grammars, openai (for embeddings)`,
    },
    {
      id: 4,
      name: "ws4-retrieval",
      model: "opus",
      description: "Multi-strategy retrieval engine",
      prompt: `${sharedContext}

## YOUR WORKSTREAM: WS4 — Retrieval Engine

Depends on WS3 being complete (needs indexed data).

You must implement the retrieval design from §06 exactly:

1. Semantic search: embed query → pgvector k-NN (k=20)
2. Lexical search: Postgres full-text search with ts_vector + ts_query
3. Structural search: symbol graph traversal (1-2 hops from mentioned symbols)
4. Rank-and-merge: semantic=0.45, lexical=0.30, structural=0.25, intersection bonus +0.15
5. Context assembly: repo summary + top-K ranked chunks + file headers
6. Implement RetrievalOptions (scope to file, depth control)
7. Return RetrievalResult with ranked chunks including file, startLine, endLine, score, strategy

This module is PURE READ-ONLY. It must not mutate any data.
Write thorough tests with fixture data.`,
    },
    {
      id: 5,
      name: "ws5-llm-chat",
      model: "sonnet",
      description: "LLM orchestration + chat",
      prompt: `${sharedContext}

## YOUR WORKSTREAM: WS5 — LLM + Chat

Depends on WS4 (retrieval) and WS1 (auth).

You must:
1. Create LLM provider abstraction (start with Anthropic Claude)
2. Build system prompt with citation instructions (format: [file:path:L15-L30])
3. Construct full prompt from retrieval results (repo summary + chunks + history + question)
4. Implement streaming response handler
5. Parse citations from LLM response
6. Validate citations: file exists? lines exist? content matches?
7. Flag invalid citations (don't silently remove)
8. Persist conversations and messages
9. Create chat API: POST /api/chat (ask), GET /api/conversations
10. Build chat UI: message list, input, streaming indicator, citation badges

Install: @anthropic-ai/sdk

Citation badges should be clickable and emit an event to navigate the code viewer.`,
    },
    {
      id: 6,
      name: "ws6-file-viewer",
      model: "sonnet",
      description: "File tree + code viewer UI",
      prompt: `${sharedContext}

## YOUR WORKSTREAM: WS6 — File Tree + Code Viewer

Depends on WS2 (repo data) and WS3 (file records).

You must:
1. Create file tree API (returns nested structure from File records)
2. Create file content API (reads from blob storage / cloned repo)
3. Build collapsible file tree component with search/filter
4. Build code viewer with syntax highlighting (use Shiki)
5. Implement citation navigation: click citation → open file at line, highlight range
6. Implement "Ask about this file" button that pre-fills chat with file context
7. Tab bar for multiple open files
8. Line numbers (clickable)
9. Empty state when no file selected

Install: shiki (for syntax highlighting)`,
    },
  ];
}

async function runBuild(wsFilter?: number, fromWave: number = 1) {
  console.log("=== PHASE 2: BUILD (Parallel Agents) ===\n");

  if (!existsSync(BOOTSTRAP_FILE)) {
    console.error("Bootstrap not found. Run: npx tsx build-team.ts bootstrap");
    process.exit(1);
  }

  const allWorkstreams = getWorkstreams();
  const workstreams = wsFilter
    ? allWorkstreams.filter((ws) => ws.id === wsFilter)
    : allWorkstreams;

  if (wsFilter) {
    // Single workstream — run directly
    const ws = workstreams[0];
    console.log(`Running single workstream: ${ws.name} (${ws.model})`);
    await runAgent({
      name: ws.name,
      model: ws.model,
      prompt: ws.prompt,
    });
  } else {
    // Parallel execution in dependency waves
    const waves = [
      [1],       // WS1: foundation (must be first)
      [2],       // WS2: workspace + repo (depends on WS1)
      [3, 6],    // WS3 + WS6: ingestion + file UI (parallel, both depend on WS2)
      [4],       // WS4: retrieval (depends on WS3)
      [5],       // WS5: LLM + chat (depends on WS4)
    ];

    for (let i = fromWave - 1; i < waves.length; i++) {
      const wave = waves[i];
      const waveWorkstreams = allWorkstreams.filter((ws) =>
        wave.includes(ws.id)
      );

      console.log(
        `\n--- Wave ${i + 1}/${waves.length}: ${waveWorkstreams.map((ws) => ws.name).join(" + ")} ---`
      );

      if (waveWorkstreams.length === 1) {
        await runAgent({
          name: waveWorkstreams[0].name,
          model: waveWorkstreams[0].model,
          prompt: waveWorkstreams[0].prompt,
        });
      } else {
        // Run wave in parallel
        await Promise.all(
          waveWorkstreams.map((ws) =>
            runAgent({
              name: ws.name,
              model: ws.model,
              prompt: ws.prompt,
            })
          )
        );
      }
    }
  }

  console.log("\n=== BUILD COMPLETE ===");
}

// ---------------------------------------------------------------------------
// Phase 3: Review — Opus reviews what was built
// ---------------------------------------------------------------------------
async function runReview() {
  console.log("=== PHASE 3: ARCHITECTURE REVIEW (Opus) ===\n");

  const masterPackage = readFile(MASTER_PACKAGE);

  const result = await runAgent({
    name: "review-opus",
    model: "opus",
    prompt: `You are a principal architect reviewing an implementation against its master package.

## MASTER PACKAGE (source of truth)
${masterPackage}

## YOUR TASK

Review the codebase at ${PROJECT_DIR}/src/ against the master package.

For each workstream check:
1. Does the implementation match the module boundaries in §09?
2. Does the database schema match the domain model in §05?
3. Does the retrieval engine implement all three strategies per §06?
4. Are citations structured and validated per §06?
5. Is the change workflow properly stubbed (not implemented) per §07?
6. Do acceptance criteria in §11 pass?

Read the actual code files. Check imports, function signatures, database schemas.

Produce a review document with:
- PASS / FAIL per acceptance criterion
- Specific issues found (with file:line references)
- Recommended fixes (prioritized)
- Overall assessment: ship / fix-then-ship / significant-rework

Write the review to ${PROJECT_DIR}/02_REVIEW.md`,
  });

  console.log("\n=== REVIEW COMPLETE ===");
  return result;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const command = process.argv[2];
const wsArg = process.argv.find((a) => a.startsWith("--ws="));
const wsFilter = wsArg ? parseInt(wsArg.split("=")[1]) : undefined;
const fromWaveArg = process.argv.find((a) => a.startsWith("--from-wave="));
const fromWave = fromWaveArg ? parseInt(fromWaveArg.split("=")[1]) : 1;

switch (command) {
  case "bootstrap":
    await runBootstrap();
    break;
  case "build":
    await runBuild(wsFilter, fromWave);
    break;
  case "review":
    await runReview();
    break;
  default:
    console.log(`RepoBrain Agent Team Orchestrator

Usage:
  npx tsx build-team.ts bootstrap       Opus generates implementation bootstrap
  npx tsx build-team.ts build              Build all workstreams (waves)
  npx tsx build-team.ts build --ws=1       Build single workstream
  npx tsx build-team.ts build --from-wave=2  Skip completed waves
  npx tsx build-team.ts review             Opus reviews the implementation

Workstreams:
  1: Project skeleton + auth (Opus)
  2: Workspace + repo connection (Sonnet)
  3: Ingestion pipeline (Opus)
  4: Retrieval engine (Opus)
  5: LLM + chat (Sonnet)
  6: File tree + code viewer (Sonnet)

Wave execution order:
  Wave 1: WS1 (foundation)
  Wave 2: WS2 (workspace)
  Wave 3: WS3 + WS6 (parallel)
  Wave 4: WS4 (retrieval)
  Wave 5: WS5 (chat)
`);
}
