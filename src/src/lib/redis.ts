import Redis from "ioredis";

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error(
        "REDIS_URL environment variable is required but was not set. " +
          "Example: redis://user:password@host:6379",
      );
    }
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null, // Required for BullMQ
    });
  }
  return redis;
}
