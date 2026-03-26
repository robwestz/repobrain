/**
 * Clone worker: processes "clone-repo" jobs from the "clone" BullMQ queue.
 *
 * Job data shape:
 *   { repoConnectionId, owner, name, token, clonePath }
 *
 * Status transitions:
 *   pending → cloning → indexing  (success)
 *   pending → cloning → failed    (error)
 *
 * After successful clone, enqueues an "ingest-repo" job on the "ingest" queue
 * (WS3 will implement the ingest worker that processes it).
 */

import { Worker, Queue, type Job } from "bullmq";
import { cloneRepo } from "@/src/modules/github/clone";
import {
  updateRepoConnectionStatus,
  updateIndexJobStatus,
  findLatestIndexJob,
} from "@/src/modules/workspace/queries";

interface CloneJobData {
  repoConnectionId: string;
  owner: string;
  name: string;
  token: string;
  clonePath: string;
}

export function createCloneWorker(redisConnection: { host?: string; port?: number } | string) {
  // Queue for ingest jobs — WS3 implements the consumer
  const ingestQueue = new Queue("ingest", {
    connection:
      typeof redisConnection === "string"
        ? { host: "localhost", port: 6379 }
        : redisConnection,
  });

  const worker = new Worker<CloneJobData>(
    "clone",
    async (job: Job<CloneJobData>) => {
      const { repoConnectionId, owner, name, token, clonePath } = job.data;

      console.log(`[clone-worker] Starting clone: ${owner}/${name} → ${clonePath}`);

      // Update status to "cloning"
      await updateRepoConnectionStatus(repoConnectionId, "cloning");

      // Find the associated index job to update its status
      const indexJob = await findLatestIndexJob(repoConnectionId);
      if (indexJob) {
        await updateIndexJobStatus(indexJob.id, "running");
      }

      try {
        await cloneRepo(token, owner, name, clonePath);

        console.log(`[clone-worker] Clone complete: ${owner}/${name}`);

        // Transition to "indexing" — WS3 ingest worker will move it to "ready"
        await updateRepoConnectionStatus(repoConnectionId, "indexing");

        // Enqueue ingest job (WS3 will implement the worker)
        await ingestQueue.add(
          "ingest-repo",
          { repoConnectionId, clonePath },
          {
            attempts: 2,
            backoff: { type: "exponential", delay: 10000 },
            removeOnComplete: 100,
            removeOnFail: 100,
          },
        );

        if (indexJob) {
          await updateIndexJobStatus(indexJob.id, "running", {
            phase: "clone_complete",
            files_total: 0,
            files_processed: 0,
            symbols_found: 0,
            chunks_created: 0,
            embeddings_generated: 0,
          });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[clone-worker] Clone failed: ${owner}/${name} — ${errorMessage}`);

        await updateRepoConnectionStatus(repoConnectionId, "failed", errorMessage);

        if (indexJob) {
          await updateIndexJobStatus(
            indexJob.id,
            "failed",
            undefined,
            errorMessage,
          );
        }

        // Re-throw so BullMQ can retry
        throw err;
      }
    },
    {
      connection:
        typeof redisConnection === "string"
          ? { host: "localhost", port: 6379 }
          : redisConnection,
      concurrency: 3,
    },
  );

  worker.on("completed", (job) => {
    console.log(`[clone-worker] Job ${job.id} completed for repo connection ${job.data.repoConnectionId}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[clone-worker] Job ${job?.id} failed:`, err.message);
  });

  return { worker, ingestQueue };
}
