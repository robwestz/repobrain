/**
 * Worker bootstrap: starts all BullMQ workers.
 * Run with: npm run worker
 *
 * Workers started here:
 *   - clone worker  (WS2)
 *   - ingest worker (WS3)
 *   - summary worker (WS7 — started once implemented)
 */

import "dotenv/config";
import { createCloneWorker } from "./clone.worker";
import { createIngestWorker } from "./ingest.worker";
import { logger } from "../lib/logger";

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  throw new Error(
    "REDIS_URL environment variable is required but was not set. " +
      "Example: redis://user:password@host:6379",
  );
}

// Parse Redis URL into host/port for BullMQ connection options
function parseRedisUrl(url: string): { host: string; port: number; password?: string; username?: string } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379", 10),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(parsed.username && parsed.username !== "default" ? { username: parsed.username } : {}),
  };
}

const redisConnection = parseRedisUrl(REDIS_URL);

logger.info({ host: redisConnection.host, port: redisConnection.port }, "workers: connecting to Redis");

// Start clone worker
const { worker: cloneWorker } = createCloneWorker(redisConnection);
logger.info("workers: clone worker started");

// Start ingest worker
const { worker: ingestWorker } = createIngestWorker(redisConnection);
logger.info("workers: ingest worker started");

// Graceful shutdown
async function shutdown() {
  logger.info("workers: shutting down...");
  await Promise.all([cloneWorker.close(), ingestWorker.close()]);
  logger.info("workers: all workers stopped");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

logger.info("workers: all workers running. Press Ctrl+C to stop.");
