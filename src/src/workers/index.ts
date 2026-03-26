/**
 * Worker bootstrap: starts all BullMQ workers.
 * Run with: npm run worker
 *
 * Workers started here:
 *   - clone worker  (WS2)
 *   - ingest worker (WS3)
 *   - summary worker (WS7 — started once implemented)
 */

import { createCloneWorker } from "./clone.worker";
import { createIngestWorker } from "./ingest.worker";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// Parse Redis URL into host/port for BullMQ connection options
function parseRedisUrl(url: string): { host: string; port: number } {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || "localhost",
      port: parseInt(parsed.port || "6379", 10),
    };
  } catch {
    return { host: "localhost", port: 6379 };
  }
}

const redisConnection = parseRedisUrl(REDIS_URL);

console.log(`[workers] Connecting to Redis at ${redisConnection.host}:${redisConnection.port}`);

// Start clone worker
const { worker: cloneWorker } = createCloneWorker(redisConnection);
console.log("[workers] Clone worker started");

// Start ingest worker
const { worker: ingestWorker } = createIngestWorker(redisConnection);
console.log("[workers] Ingest worker started");

// Graceful shutdown
async function shutdown() {
  console.log("[workers] Shutting down workers...");
  await Promise.all([cloneWorker.close(), ingestWorker.close()]);
  console.log("[workers] All workers stopped");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log("[workers] All workers running. Press Ctrl+C to stop.");
