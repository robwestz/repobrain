/**
 * Manual retrieval quality testing script.
 *
 * Usage:
 *   npx tsx scripts/test-retrieval.ts <repo_connection_id>
 *
 * Runs a battery of test queries against an indexed repo and prints ranked
 * results so you can manually inspect retrieval quality.
 */

import { retrieve, formatContextForPrompt } from "../src/modules/retrieval";
import { assembleContext } from "../src/modules/retrieval/context";
import { rankAndMerge } from "../src/modules/retrieval/ranker";
import { extractSymbolCandidates } from "../src/modules/retrieval/structural";
import type { RankedChunk, VectorSearchResult, KeywordSearchResult } from "../src/types/retrieval";

// --- Test queries covering all retrieval strategies ---------------------------

const TEST_QUERIES = [
  // Conceptual / semantic questions
  { query: "How does authentication work?", type: "semantic" },
  { query: "What is the architecture of this project?", type: "semantic" },
  { query: "How are errors handled across the codebase?", type: "semantic" },

  // Exact symbol / lexical questions
  { query: "Where is UserService defined?", type: "lexical" },
  { query: "What functions export from the database module?", type: "lexical" },

  // Structural / dependency questions
  { query: "What depends on the User model?", type: "structural" },
  { query: "What files import from the config module?", type: "structural" },

  // Mixed questions (should trigger multiple strategies)
  { query: "How does the payment processing flow work end to end?", type: "mixed" },
  { query: "What are the main API endpoints and how are they organized?", type: "mixed" },

  // Edge cases
  { query: "What logging framework is used?", type: "semantic" },
];

// --- File-scoped test queries ------------------------------------------------

const FILE_SCOPED_QUERIES = [
  { query: "What does this file do?", filePath: "src/index.ts" },
  { query: "Explain the main function", filePath: "src/app.ts" },
];

// --- Helpers -----------------------------------------------------------------

function printSeparator(title: string) {
  console.log("\n" + "=".repeat(70));
  console.log(`  ${title}`);
  console.log("=".repeat(70));
}

function printChunk(chunk: RankedChunk, index: number) {
  console.log(`\n  #${index + 1}  [score: ${chunk.score.toFixed(3)}]  ${chunk.filePath}:${chunk.startLine}-${chunk.endLine}`);
  if (chunk.symbolName) {
    console.log(`       symbol: ${chunk.symbolName} (${chunk.symbolKind})`);
  }
  console.log(`       vec: ${chunk.vectorScore.toFixed(3)}  kw: ${chunk.keywordScore.toFixed(3)}  tokens: ${chunk.tokenCount}`);
  // Print first 2 lines of content
  const lines = chunk.content.split("\n").slice(0, 2);
  for (const line of lines) {
    console.log(`       > ${line.slice(0, 100)}`);
  }
}

// --- Test: Symbol extraction -------------------------------------------------

function testSymbolExtraction() {
  printSeparator("Symbol Extraction Tests");
  const testInputs = [
    "What depends on UserService?",
    'Where is `parseConfig` used?',
    "How does the auth_middleware work?",
    "What calls DatabaseConnection.query?",
    "Show me AuthController and UserModel",
  ];

  for (const input of testInputs) {
    const symbols = extractSymbolCandidates(input);
    console.log(`\n  "${input}"`);
    console.log(`  → symbols: [${symbols.join(", ")}]`);
  }
}

// --- Test: Ranker (unit test with synthetic data) ----------------------------

function testRanker() {
  printSeparator("Ranker Unit Tests");

  const makeChunk = (id: string, file: string, score: number): VectorSearchResult => ({
    chunkId: id,
    fileId: `f-${id}`,
    filePath: file,
    content: `content of ${id}`,
    startLine: 1,
    endLine: 10,
    similarity: score,
    symbolId: null,
    symbolName: null,
    symbolKind: null,
    language: "typescript",
    tokenCount: 50,
  });

  const makeKwChunk = (id: string, file: string, score: number): KeywordSearchResult => ({
    chunkId: id,
    fileId: `f-${id}`,
    filePath: file,
    content: `content of ${id}`,
    startLine: 1,
    endLine: 10,
    bm25Score: score,
    symbolId: null,
    symbolName: null,
    symbolKind: null,
    language: "typescript",
    tokenCount: 50,
  });

  // Test 1: intersection bonus
  const semantic = [makeChunk("A", "a.ts", 0.9), makeChunk("B", "b.ts", 0.7)];
  const lexical = [makeKwChunk("A", "a.ts", 0.8), makeKwChunk("C", "c.ts", 0.6)];
  const structural = [makeChunk("D", "d.ts", 0.5)];

  const ranked = rankAndMerge(semantic, lexical, structural, { topK: 10 });

  console.log("\n  Test: intersection bonus for chunk A (appears in semantic + lexical)");
  for (const r of ranked) {
    console.log(`    ${r.chunkId}: score=${r.score.toFixed(3)} (vec=${r.vectorScore.toFixed(3)}, kw=${r.keywordScore.toFixed(3)})`);
  }

  const chunkA = ranked.find((r) => r.chunkId === "A");
  if (chunkA && chunkA.score > 0.6) {
    console.log("  ✓ Chunk A has intersection bonus");
  } else {
    console.log("  ✗ Chunk A missing intersection bonus");
  }

  // Test 2: file-scope boost
  const ranked2 = rankAndMerge(semantic, lexical, structural, { filePath: "b.ts", topK: 10 });
  const chunkB = ranked2.find((r) => r.chunkId === "B");
  console.log("\n  Test: file-scope boost for b.ts");
  console.log(`    B score without boost: ${ranked.find((r) => r.chunkId === "B")?.score.toFixed(3)}`);
  console.log(`    B score with boost:    ${chunkB?.score.toFixed(3)}`);

  // Test 3: deduplication of overlapping chunks
  const overlapping: VectorSearchResult[] = [
    { ...makeChunk("X1", "x.ts", 0.9), startLine: 1, endLine: 20 },
    { ...makeChunk("X2", "x.ts", 0.7), startLine: 5, endLine: 15 },
  ];
  const deduped = rankAndMerge(overlapping, [], [], { topK: 10 });
  console.log("\n  Test: deduplication of overlapping chunks in x.ts");
  console.log(`    Input: 2 overlapping chunks, Output: ${deduped.length} chunk(s)`);
  if (deduped.length === 1) {
    console.log("  ✓ Overlapping chunk deduplicated");
  } else {
    console.log("  ✗ Overlapping chunk NOT deduplicated");
  }
}

// --- Main: run against a real indexed repo -----------------------------------

async function runRetrievalTests(repoConnectionId: string) {
  printSeparator("Retrieval Tests Against Indexed Repo");
  console.log(`  Repo connection: ${repoConnectionId}\n`);

  for (const test of TEST_QUERIES) {
    console.log(`\n  ─── [${test.type}] "${test.query}" ───`);

    try {
      const result = await retrieve(test.query, repoConnectionId);

      console.log(`  Found ${result.totalCandidates} candidates → ${result.chunks.length} ranked results`);
      console.log(`  Duration: ${result.durationMs}ms (vec=${result.timing.vectorSearchMs}ms, kw=${result.timing.keywordSearchMs}ms, rank=${result.timing.rerankingMs}ms)`);

      if (result.repoSummary) {
        console.log(`  Repo summary: ${result.repoSummary.slice(0, 80)}...`);
      }

      for (let i = 0; i < Math.min(5, result.chunks.length); i++) {
        printChunk(result.chunks[i], i);
      }

      if (result.chunks.length === 0) {
        console.log("  ⚠ No results returned — check indexing state");
      }
    } catch (err) {
      console.error(`  ✗ Error: ${err instanceof Error ? err.message : err}`);
    }
  }

  // File-scoped queries
  printSeparator("File-Scoped Retrieval Tests");
  for (const test of FILE_SCOPED_QUERIES) {
    console.log(`\n  ─── "${test.query}" (file: ${test.filePath}) ───`);

    try {
      const result = await retrieve(test.query, repoConnectionId, {
        fileFilter: test.filePath,
        maxResults: 10,
      });

      console.log(`  Found ${result.totalCandidates} candidates → ${result.chunks.length} ranked results`);
      const fromFile = result.chunks.filter((c) => c.filePath === test.filePath).length;
      console.log(`  Chunks from scoped file: ${fromFile}/${result.chunks.length}`);

      for (let i = 0; i < Math.min(3, result.chunks.length); i++) {
        printChunk(result.chunks[i], i);
      }
    } catch (err) {
      console.error(`  ✗ Error: ${err instanceof Error ? err.message : err}`);
    }
  }
}

// --- Entry point -------------------------------------------------------------

async function main() {
  const repoConnectionId = process.argv[2];

  // Always run unit tests (no DB required)
  testSymbolExtraction();
  testRanker();

  // Run live retrieval tests if a repo ID is provided
  if (repoConnectionId) {
    await runRetrievalTests(repoConnectionId);
  } else {
    console.log("\n\nTo run live retrieval tests, pass a repo_connection_id:");
    console.log("  npx tsx scripts/test-retrieval.ts <repo_connection_id>\n");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
