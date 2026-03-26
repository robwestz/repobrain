/**
 * Ingestion pipeline orchestrator.
 *
 * Full pipeline: walk repo → detect language → extract symbols →
 * build relations → chunk → embed → store.
 *
 * Idempotent: re-indexing the same commit produces identical results.
 * Uses content_hash to detect unchanged files and skip re-processing.
 */

import { db } from "@/src/lib/db";
import {
  files as filesTable,
  symbols as symbolsTable,
  symbolRelations as symbolRelationsTable,
  chunks as chunksTable,
  embeddings as embeddingsTable,
} from "@/src/lib/db/schema";
import { eq, sql, and, inArray } from "drizzle-orm";
import { walkRepo, type WalkedFile } from "./walker";
import { detectLanguage } from "./language";
import { extractSymbols, type ExtractionResult } from "./symbols";
import { buildSymbolRelations, type FileSymbolData } from "./relations";
import { chunkFile, type ChunkResult } from "./chunker";
import { generateEmbeddings, EMBEDDING_MODEL } from "./embedder";
import { createProgressReporter } from "./progress";

export interface IndexResult {
  filesProcessed: number;
  filesSkipped: number;
  symbolsExtracted: number;
  chunksCreated: number;
  embeddingsGenerated: number;
  errors: Array<{ file: string; error: string }>;
}

/**
 * Index an entire repository. This is the main entry point for the ingestion pipeline.
 *
 * Idempotent: uses content_hash to detect unchanged files and skip re-processing.
 * Files with matching path+hash are retained; changed/new files are (re)processed;
 * files that no longer exist on disk are cleaned up.
 *
 * @param repoConnectionId - UUID of the repo connection
 * @param clonePath - Absolute path to the cloned repository on disk
 * @param indexJobId - UUID of the index job for progress tracking
 */
export async function indexRepo(
  repoConnectionId: string,
  clonePath: string,
  indexJobId: string,
): Promise<IndexResult> {
  const errors: Array<{ file: string; error: string }> = [];

  // Step 1: Walk the repository
  console.log(`[ingestion] Walking repo at ${clonePath}`);
  const walkedFiles = await walkRepo(clonePath);
  console.log(`[ingestion] Found ${walkedFiles.length} files to process`);

  const reporter = createProgressReporter(repoConnectionId, indexJobId, walkedFiles.length);
  await reporter.report(true);

  // Step 2: Diff against existing indexed files for idempotency
  const { filesToProcess, filesToDelete, skippedCount } = await diffWithExisting(
    repoConnectionId,
    walkedFiles,
  );
  console.log(
    `[ingestion] Diff: ${filesToProcess.length} new/changed, ` +
      `${skippedCount} unchanged, ${filesToDelete.length} deleted`,
  );

  // Remove stale files (cascading deletes remove their symbols/chunks/embeddings)
  if (filesToDelete.length > 0) {
    await removeStaleFiles(filesToDelete);
  }

  // Step 3: Parse new/changed files and extract symbols
  reporter.setPhase("parsing");
  await reporter.report(true);

  const fileRecords: Array<{
    walkedFile: WalkedFile;
    fileId: string;
    language: string | null;
    extraction: ExtractionResult;
  }> = [];

  const FILE_BATCH_SIZE = 50;
  for (let i = 0; i < filesToProcess.length; i += FILE_BATCH_SIZE) {
    const batch = filesToProcess.slice(i, i + FILE_BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (wf) => {
        try {
          return await processFile(repoConnectionId, wf);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({ file: wf.relativePath, error: msg });
          return null;
        }
      }),
    );

    for (const result of batchResults) {
      if (result) {
        fileRecords.push(result);
        reporter.incrementFiles();
        reporter.addSymbols(result.extraction.symbols.length);
      }
    }

    await reporter.report();
  }

  // Count skipped files as processed for progress
  for (let i = 0; i < skippedCount; i++) {
    reporter.incrementFiles();
  }

  console.log(
    `[ingestion] Processed ${fileRecords.length} files, extracted ` +
      `${reporter.current.symbols_found} symbols`,
  );

  // Step 4: Insert symbols and get their IDs (only for new/changed files)
  reporter.setPhase("parsing");
  const fileSymbolData = await insertSymbols(fileRecords);

  // Step 5: Build and insert symbol relations across ALL files (including retained)
  // Fetch retained file symbol data for cross-file relation building
  const retainedSymbolData = await loadRetainedFileSymbolData(repoConnectionId, fileRecords);
  const allFileSymbolData = [...fileSymbolData, ...retainedSymbolData];

  const edges = buildSymbolRelations(allFileSymbolData);

  // Clear old symbol relations for the entire repo and rebuild
  await db.delete(symbolRelationsTable).where(
    sql`${symbolRelationsTable.fromSymbolId} IN (
      SELECT s.id FROM symbols s
      JOIN files f ON s.file_id = f.id
      WHERE f.repo_connection_id = ${repoConnectionId}
    )`,
  );
  if (edges.length > 0) {
    await insertSymbolRelations(edges);
  }
  console.log(`[ingestion] Created ${edges.length} symbol relations`);

  // Step 6: Chunk new/changed files
  reporter.setPhase("chunking");
  await reporter.report(true);

  const allChunks: Array<{
    fileId: string;
    chunk: ChunkResult;
  }> = [];

  for (const record of fileRecords) {
    const symbolsWithIds = buildSymbolsWithIds(record, fileSymbolData);

    try {
      const chunks = chunkFile(
        record.walkedFile.content,
        symbolsWithIds,
        record.walkedFile.relativePath,
      );
      for (const chunk of chunks) {
        allChunks.push({ fileId: record.fileId, chunk });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ file: record.walkedFile.relativePath, error: `Chunking error: ${msg}` });
    }
  }

  reporter.addChunks(allChunks.length);
  await reporter.report(true);
  console.log(`[ingestion] Created ${allChunks.length} chunks`);

  // Step 7: Insert chunks and get their IDs
  const chunkIds = await insertChunks(allChunks, fileSymbolData);

  // Step 8: Generate and store embeddings for new chunks only
  reporter.setPhase("embedding");
  await reporter.report(true);

  const chunkTexts = allChunks.map((c) => c.chunk.content);

  if (chunkTexts.length > 0) {
    const embeddingResults = await generateEmbeddings(
      chunkTexts,
      (completed) => {
        reporter.addEmbeddings(completed - reporter.current.embeddings_generated);
        reporter.report();
      },
    );

    await insertEmbeddings(chunkIds, embeddingResults);
    console.log(`[ingestion] Generated ${embeddingResults.length} embeddings`);
  }

  // Step 9: Create full-text search index on chunks (idempotent, IF NOT EXISTS)
  await createFullTextIndex();

  // Step 10: Create pgvector HNSW index on embeddings (idempotent, IF NOT EXISTS)
  await createVectorIndex();

  // Done
  reporter.setPhase("done");
  await reporter.finish();

  const result: IndexResult = {
    filesProcessed: fileRecords.length,
    filesSkipped: skippedCount,
    symbolsExtracted: reporter.current.symbols_found,
    chunksCreated: allChunks.length,
    embeddingsGenerated: reporter.current.embeddings_generated,
    errors,
  };

  console.log(`[ingestion] Indexing complete:`, result);
  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compare walked files against existing indexed files to determine what changed.
 * Uses content_hash for change detection — files with identical path + hash are skipped.
 */
async function diffWithExisting(
  repoConnectionId: string,
  walkedFiles: WalkedFile[],
): Promise<{
  filesToProcess: WalkedFile[];
  filesToDelete: string[]; // file IDs to remove
  skippedCount: number;
}> {
  // Fetch existing indexed files for this repo
  const existingFiles = await db
    .select({
      id: filesTable.id,
      path: filesTable.path,
      contentHash: filesTable.contentHash,
    })
    .from(filesTable)
    .where(eq(filesTable.repoConnectionId, repoConnectionId));

  // Build a lookup: path → { id, contentHash }
  const existingByPath = new Map(
    existingFiles.map((f) => [f.path, { id: f.id, contentHash: f.contentHash }]),
  );

  const filesToProcess: WalkedFile[] = [];
  const retainedPaths = new Set<string>();
  let skippedCount = 0;

  for (const wf of walkedFiles) {
    const existing = existingByPath.get(wf.relativePath);
    if (existing && existing.contentHash === wf.contentHash) {
      // File unchanged — skip re-processing
      retainedPaths.add(wf.relativePath);
      skippedCount++;
    } else {
      // New or changed file — needs processing
      // If it existed before with a different hash, delete old record first
      if (existing) {
        await db.delete(filesTable).where(eq(filesTable.id, existing.id));
      }
      filesToProcess.push(wf);
    }
  }

  // Find files that existed in DB but are no longer on disk (deleted from repo)
  const walkedPaths = new Set(walkedFiles.map((wf) => wf.relativePath));
  const filesToDelete = existingFiles
    .filter((f) => !walkedPaths.has(f.path) && !retainedPaths.has(f.path))
    .map((f) => f.id);

  return { filesToProcess, filesToDelete, skippedCount };
}

/**
 * Remove files that no longer exist in the repository.
 * Cascading deletes handle their symbols, chunks, and embeddings.
 */
async function removeStaleFiles(fileIds: string[]): Promise<void> {
  const BATCH_SIZE = 100;
  for (let i = 0; i < fileIds.length; i += BATCH_SIZE) {
    const batch = fileIds.slice(i, i + BATCH_SIZE);
    await db.delete(filesTable).where(inArray(filesTable.id, batch));
  }
  console.log(`[ingestion] Removed ${fileIds.length} stale files`);
}

async function processFile(
  repoConnectionId: string,
  wf: WalkedFile,
): Promise<{
  walkedFile: WalkedFile;
  fileId: string;
  language: string | null;
  extraction: ExtractionResult;
}> {
  const language = detectLanguage(wf.relativePath);

  // Insert file record
  const [fileRecord] = await db
    .insert(filesTable)
    .values({
      repoConnectionId,
      path: wf.relativePath,
      language,
      sizeBytes: wf.sizeBytes,
      contentHash: wf.contentHash,
      lineCount: wf.lineCount,
    })
    .returning({ id: filesTable.id });

  // Extract symbols
  let extraction: ExtractionResult = { symbols: [], imports: [], exports: [] };
  if (language) {
    extraction = await extractSymbols(wf.content, language, wf.relativePath);
  }

  return {
    walkedFile: wf,
    fileId: fileRecord.id,
    language,
    extraction,
  };
}

/**
 * Load symbol data for retained (unchanged) files so symbol relations
 * can be built across the entire repo, not just new/changed files.
 */
async function loadRetainedFileSymbolData(
  repoConnectionId: string,
  processedRecords: Array<{ fileId: string }>,
): Promise<FileSymbolData[]> {
  const processedFileIds = new Set(processedRecords.map((r) => r.fileId));
  const result: FileSymbolData[] = [];

  // Fetch all files for this repo that were NOT just processed
  const retainedFiles = await db
    .select({ id: filesTable.id, path: filesTable.path })
    .from(filesTable)
    .where(eq(filesTable.repoConnectionId, repoConnectionId));

  for (const file of retainedFiles) {
    if (processedFileIds.has(file.id)) continue;

    const syms = await db
      .select({
        id: symbolsTable.id,
        name: symbolsTable.name,
        kind: symbolsTable.kind,
      })
      .from(symbolsTable)
      .where(eq(symbolsTable.fileId, file.id));

    result.push({
      fileId: file.id,
      filePath: file.path,
      symbols: syms,
      imports: [], // Retained files' imports don't change
      exports: [], // Retained files' exports don't change
    });
  }

  return result;
}

/**
 * Build symbols with IDs for the chunker, matching extracted symbols to DB records.
 */
function buildSymbolsWithIds(
  record: {
    walkedFile: WalkedFile;
    fileId: string;
    extraction: ExtractionResult;
  },
  fileSymbolData: FileSymbolData[],
) {
  const fsd = fileSymbolData.find((f) => f.fileId === record.fileId);
  if (!fsd) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return fsd.symbols.map((s): any => {
    const extracted = record.extraction.symbols.find((es) => es.name === s.name);
    return {
      id: s.id,
      name: s.name,
      kind: s.kind,
      startLine: extracted?.startLine ?? 0,
      endLine: extracted?.endLine ?? 0,
      signature: extracted?.signature ?? null,
      children: [],
    };
  });
}

async function insertSymbols(
  fileRecords: Array<{
    walkedFile: WalkedFile;
    fileId: string;
    language: string | null;
    extraction: ExtractionResult;
  }>,
): Promise<FileSymbolData[]> {
  const result: FileSymbolData[] = [];

  for (const record of fileRecords) {
    const fileSymbols: FileSymbolData["symbols"] = [];

    // Insert top-level symbols in batches
    for (const sym of record.extraction.symbols) {
      try {
        const [inserted] = await db
          .insert(symbolsTable)
          .values({
            fileId: record.fileId,
            name: sym.name,
            kind: sym.kind,
            startLine: sym.startLine,
            endLine: sym.endLine,
            signature: sym.signature,
          })
          .returning({ id: symbolsTable.id });

        fileSymbols.push({
          id: inserted.id,
          name: sym.name,
          kind: sym.kind,
        });

        // Insert child symbols (methods inside classes, etc.)
        for (const child of sym.children) {
          const [childInserted] = await db
            .insert(symbolsTable)
            .values({
              fileId: record.fileId,
              name: child.name,
              kind: child.kind,
              startLine: child.startLine,
              endLine: child.endLine,
              parentSymbolId: inserted.id,
              signature: child.signature,
            })
            .returning({ id: symbolsTable.id });

          fileSymbols.push({
            id: childInserted.id,
            name: child.name,
            kind: child.kind,
          });
        }
      } catch (err) {
        console.warn(`[ingestion] Failed to insert symbol ${sym.name}:`, err);
      }
    }

    result.push({
      fileId: record.fileId,
      filePath: record.walkedFile.relativePath,
      symbols: fileSymbols,
      imports: record.extraction.imports,
      exports: record.extraction.exports,
    });
  }

  return result;
}

async function insertSymbolRelations(edges: Array<{ fromSymbolId: string; toSymbolId: string; relationType: string }>): Promise<void> {
  // Insert in batches to avoid query size limits
  const BATCH_SIZE = 200;
  for (let i = 0; i < edges.length; i += BATCH_SIZE) {
    const batch = edges.slice(i, i + BATCH_SIZE);
    try {
      await db.insert(symbolRelationsTable).values(
        batch.map((e) => ({
          fromSymbolId: e.fromSymbolId,
          toSymbolId: e.toSymbolId,
          relationType: e.relationType,
        })),
      );
    } catch (err) {
      console.warn(`[ingestion] Failed to insert symbol relations batch:`, err);
    }
  }
}

async function insertChunks(
  allChunks: Array<{ fileId: string; chunk: ChunkResult }>,
  fileSymbolData: FileSymbolData[],
): Promise<string[]> {
  const chunkIds: string[] = [];

  // Build a map from symbol name to ID for resolving chunk→symbol links
  const symbolNameToId = new Map<string, string>();
  for (const fsd of fileSymbolData) {
    for (const sym of fsd.symbols) {
      symbolNameToId.set(`${fsd.fileId}:${sym.name}`, sym.id);
    }
  }

  // Insert chunks in batches
  const BATCH_SIZE = 100;
  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const batch = allChunks.slice(i, i + BATCH_SIZE);
    try {
      const inserted = await db
        .insert(chunksTable)
        .values(
          batch.map(({ fileId, chunk }) => {
            // Resolve symbolId from name
            let symbolId: string | null = null;
            if (chunk.symbolName) {
              symbolId = symbolNameToId.get(`${fileId}:${chunk.symbolName}`) ?? null;
            }
            return {
              fileId,
              content: chunk.content,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
              symbolId,
              tokenCount: chunk.tokenCount,
              contentHash: chunk.contentHash,
            };
          }),
        )
        .returning({ id: chunksTable.id });

      for (const row of inserted) {
        chunkIds.push(row.id);
      }
    } catch (err) {
      console.warn(`[ingestion] Failed to insert chunk batch:`, err);
      // Push nulls to maintain index alignment
      for (let j = 0; j < batch.length; j++) {
        chunkIds.push("");
      }
    }
  }

  return chunkIds;
}

async function insertEmbeddings(
  chunkIds: string[],
  embeddingResults: Array<{ chunkIndex: number; vector: number[]; model: string }>,
): Promise<void> {
  // Insert in batches
  const BATCH_SIZE = 50;
  const validEmbeddings = embeddingResults.filter(
    (e) => chunkIds[e.chunkIndex] && chunkIds[e.chunkIndex] !== "",
  );

  for (let i = 0; i < validEmbeddings.length; i += BATCH_SIZE) {
    const batch = validEmbeddings.slice(i, i + BATCH_SIZE);
    try {
      await db.insert(embeddingsTable).values(
        batch.map((e) => ({
          chunkId: chunkIds[e.chunkIndex],
          vector: e.vector,
          model: e.model,
        })),
      );
    } catch (err) {
      console.warn(`[ingestion] Failed to insert embedding batch:`, err);
    }
  }
}

/**
 * Create GIN full-text search index on chunk content.
 * Uses Postgres tsvector for lexical retrieval (WS4).
 */
async function createFullTextIndex(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS chunks_content_fts_idx
      ON chunks USING GIN (to_tsvector('english', content))
    `);
    console.log("[ingestion] Created full-text search index on chunks");
  } catch (err) {
    console.warn("[ingestion] Failed to create FTS index:", err);
  }

  // Also create trigram index for partial matching
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS chunks_content_trgm_idx
      ON chunks USING GIN (content gin_trgm_ops)
    `);
    console.log("[ingestion] Created trigram index on chunks");
  } catch (err) {
    console.warn("[ingestion] Failed to create trigram index:", err);
  }
}

/**
 * Create pgvector HNSW index on embeddings for fast k-NN search.
 * Uses cosine distance operator (<=>).
 */
async function createVectorIndex(): Promise<void> {
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS embeddings_vector_hnsw_idx
      ON embeddings USING hnsw (vector vector_cosine_ops)
      WITH (m = 16, ef_construction = 200)
    `);
    console.log("[ingestion] Created HNSW vector index on embeddings");
  } catch (err) {
    console.warn("[ingestion] Failed to create HNSW index:", err);
  }
}

// Re-export for convenience
export { getProgress } from "./progress";
