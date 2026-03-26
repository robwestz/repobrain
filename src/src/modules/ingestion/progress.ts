/**
 * Ingestion progress tracking via Redis and database.
 * Tracks: phase, files_total, files_processed, symbols_found,
 * chunks_created, embeddings_generated.
 */

import { getRedis } from "@/src/lib/redis";
import { updateIndexJobStatus } from "@/src/modules/workspace/queries";

export interface IngestionProgress {
  phase: "parsing" | "chunking" | "embedding" | "finalizing" | "done";
  files_total: number;
  files_processed: number;
  symbols_found: number;
  chunks_created: number;
  embeddings_generated: number;
}

const PROGRESS_KEY_PREFIX = "ingestion:progress:";

/**
 * Update progress in both Redis (for fast polling) and database (for persistence).
 */
export async function updateProgress(
  repoConnectionId: string,
  indexJobId: string,
  progress: IngestionProgress,
): Promise<void> {
  const redis = getRedis();
  const key = PROGRESS_KEY_PREFIX + repoConnectionId;

  // Write to Redis for fast frontend polling (expires in 1 hour)
  await redis.set(key, JSON.stringify(progress), "EX", 3600);

  // Also update the database index job
  await updateIndexJobStatus(indexJobId, "running", progress as unknown as Record<string, unknown>);
}

/**
 * Get current progress from Redis.
 */
export async function getProgress(repoConnectionId: string): Promise<IngestionProgress | null> {
  const redis = getRedis();
  const key = PROGRESS_KEY_PREFIX + repoConnectionId;
  const data = await redis.get(key);
  if (!data) return null;
  return JSON.parse(data) as IngestionProgress;
}

/**
 * Clear progress data from Redis after completion.
 */
export async function clearProgress(repoConnectionId: string): Promise<void> {
  const redis = getRedis();
  const key = PROGRESS_KEY_PREFIX + repoConnectionId;
  await redis.del(key);
}

/**
 * Helper to create a progress reporter that can be called incrementally.
 */
export function createProgressReporter(
  repoConnectionId: string,
  indexJobId: string,
  totalFiles: number,
) {
  const progress: IngestionProgress = {
    phase: "parsing",
    files_total: totalFiles,
    files_processed: 0,
    symbols_found: 0,
    chunks_created: 0,
    embeddings_generated: 0,
  };

  // Throttle updates: don't write more than once per second
  let lastUpdate = 0;
  const UPDATE_INTERVAL = 1000;

  async function report(force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - lastUpdate < UPDATE_INTERVAL) return;
    lastUpdate = now;
    await updateProgress(repoConnectionId, indexJobId, progress);
  }

  return {
    get current() {
      return { ...progress };
    },

    setPhase(phase: IngestionProgress["phase"]) {
      progress.phase = phase;
    },

    incrementFiles() {
      progress.files_processed++;
    },

    addSymbols(count: number) {
      progress.symbols_found += count;
    },

    addChunks(count: number) {
      progress.chunks_created += count;
    },

    addEmbeddings(count: number) {
      progress.embeddings_generated += count;
    },

    report,

    async finish(): Promise<void> {
      progress.phase = "done";
      await report(true);
    },
  };
}
