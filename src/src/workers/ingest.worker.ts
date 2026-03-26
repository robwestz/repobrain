/**
 * Ingest worker: processes "ingest-repo" jobs from the "ingest" BullMQ queue.
 *
 * Job data shape:
 *   { repoConnectionId, clonePath }
 *
 * Status transitions:
 *   indexing → ready     (success)
 *   indexing → failed    (error)
 *
 * After successful ingestion, the repo is searchable.
 * Optionally triggers a "summary" job (WS7) for repo summary generation.
 */

import { Worker, Queue, type Job } from "bullmq";
import { indexRepo } from "@/src/modules/ingestion";
import {
  updateRepoConnectionStatus,
  updateRepoConnectionIndexedCommit,
  updateIndexJobStatus,
  findLatestIndexJob,
} from "@/src/modules/workspace/queries";
import * as fs from "fs";
import * as path from "path";

interface IngestJobData {
  repoConnectionId: string;
  clonePath: string;
}

export function createIngestWorker(redisConnection: { host?: string; port?: number } | string) {
  // Queue for summary jobs — WS7 implements the consumer
  const summaryQueue = new Queue("summary", {
    connection:
      typeof redisConnection === "string"
        ? { host: "localhost", port: 6379 }
        : redisConnection,
  });

  const worker = new Worker<IngestJobData>(
    "ingest",
    async (job: Job<IngestJobData>) => {
      const { repoConnectionId, clonePath } = job.data;

      console.log(`[ingest-worker] Starting ingestion for repo ${repoConnectionId}`);
      console.log(`[ingest-worker] Clone path: ${clonePath}`);

      // Verify clone path exists
      if (!fs.existsSync(clonePath)) {
        throw new Error(`Clone path does not exist: ${clonePath}`);
      }

      // Find the index job for progress tracking
      const indexJob = await findLatestIndexJob(repoConnectionId);
      if (!indexJob) {
        throw new Error(`No index job found for repo connection ${repoConnectionId}`);
      }

      // Read current commit SHA from the cloned repo
      const commitSha = await readHeadCommit(clonePath);

      try {
        // Run the full ingestion pipeline
        const result = await indexRepo(repoConnectionId, clonePath, indexJob.id);

        // Update repo connection to "ready"
        await updateRepoConnectionStatus(repoConnectionId, "ready");

        // Store the indexed commit SHA
        if (commitSha) {
          await updateRepoConnectionIndexedCommit(repoConnectionId, commitSha);
        }

        // Mark index job as completed
        await updateIndexJobStatus(indexJob.id, "completed", {
          phase: "done",
          files_total: result.filesProcessed + result.filesSkipped,
          files_processed: result.filesProcessed + result.filesSkipped,
          files_skipped: result.filesSkipped,
          symbols_found: result.symbolsExtracted,
          chunks_created: result.chunksCreated,
          embeddings_generated: result.embeddingsGenerated,
          errors: result.errors.length,
        });

        console.log(
          `[ingest-worker] Ingestion complete for ${repoConnectionId}: ` +
            `${result.filesProcessed} files processed, ${result.filesSkipped} unchanged, ` +
            `${result.symbolsExtracted} symbols, ` +
            `${result.chunksCreated} chunks, ${result.embeddingsGenerated} embeddings`,
        );

        // Enqueue summary generation job (WS7 will implement the worker)
        try {
          await summaryQueue.add(
            "generate-summary",
            { repoConnectionId, commitSha: commitSha ?? "" },
            {
              attempts: 2,
              backoff: { type: "exponential", delay: 5000 },
              removeOnComplete: 50,
              removeOnFail: 50,
            },
          );
        } catch (err) {
          // Non-fatal: summary generation is a nice-to-have for v1
          console.warn("[ingest-worker] Failed to enqueue summary job:", err);
        }

        if (result.errors.length > 0) {
          console.warn(
            `[ingest-worker] ${result.errors.length} files had errors:`,
            result.errors.slice(0, 10),
          );
        }

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[ingest-worker] Ingestion failed: ${errorMessage}`);

        await updateRepoConnectionStatus(repoConnectionId, "failed", errorMessage);
        await updateIndexJobStatus(indexJob.id, "failed", undefined, errorMessage);

        throw err;
      }
    },
    {
      connection:
        typeof redisConnection === "string"
          ? { host: "localhost", port: 6379 }
          : redisConnection,
      concurrency: 1, // Only one ingestion at a time (CPU/memory intensive)
    },
  );

  worker.on("completed", (job) => {
    console.log(
      `[ingest-worker] Job ${job.id} completed for repo ${job.data.repoConnectionId}`,
    );
  });

  worker.on("failed", (job, err) => {
    console.error(`[ingest-worker] Job ${job?.id} failed:`, err.message);
  });

  return { worker, summaryQueue };
}

/**
 * Read the HEAD commit SHA from a cloned git repository.
 */
async function readHeadCommit(clonePath: string): Promise<string | null> {
  try {
    const headPath = path.join(clonePath, ".git", "HEAD");
    const headContent = await fs.promises.readFile(headPath, "utf-8");
    const trimmed = headContent.trim();

    // Direct SHA reference
    if (/^[0-9a-f]{40}$/.test(trimmed)) {
      return trimmed;
    }

    // Symbolic ref: "ref: refs/heads/main"
    const refMatch = trimmed.match(/^ref:\s*(.+)$/);
    if (refMatch) {
      const refPath = path.join(clonePath, ".git", refMatch[1]);
      try {
        const sha = await fs.promises.readFile(refPath, "utf-8");
        return sha.trim();
      } catch {
        // Packed refs — read from packed-refs file
        try {
          const packedRefsPath = path.join(clonePath, ".git", "packed-refs");
          const packedRefs = await fs.promises.readFile(packedRefsPath, "utf-8");
          const refLine = packedRefs.split("\n").find((l) => l.includes(refMatch[1]));
          if (refLine) {
            return refLine.split(" ")[0];
          }
        } catch {
          return null;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}
