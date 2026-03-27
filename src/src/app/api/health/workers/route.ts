/**
 * GET /api/health/workers
 *
 * Returns queue sizes and active job counts from BullMQ.
 * Requires auth (session cookie).
 */

import { NextResponse } from "next/server";
import { Queue } from "bullmq";
import { getSession } from "@/src/lib/auth";

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

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = parseRedisUrl(process.env.REDIS_URL ?? "redis://localhost:6379");

  const cloneQueue = new Queue("clone", { connection });
  const ingestQueue = new Queue("ingest", { connection });
  const summaryQueue = new Queue("summary", { connection });

  const [cloneCounts, ingestCounts, summaryCounts] = await Promise.all([
    cloneQueue.getJobCounts("waiting", "active", "failed", "completed"),
    ingestQueue.getJobCounts("waiting", "active", "failed", "completed"),
    summaryQueue.getJobCounts("waiting", "active", "failed", "completed"),
  ]);

  await Promise.all([
    cloneQueue.close(),
    ingestQueue.close(),
    summaryQueue.close(),
  ]);

  return NextResponse.json({
    queues: {
      clone: cloneCounts,
      ingest: ingestCounts,
      summary: summaryCounts,
    },
  });
}
