import { NextResponse } from "next/server";
import { getRedis } from "@/src/lib/redis";

export interface RateLimitConfig {
  windowMs: number;     // time window in ms
  maxRequests: number;  // max requests per window
  keyPrefix: string;    // Redis key prefix
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;      // ms until window resets
}

/**
 * Sliding-window (fixed-window approximation) rate limiter using Redis INCR + EXPIRE.
 * Gracefully degrades — if Redis is unavailable the request is allowed.
 */
export async function checkRateLimit(
  userId: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const { windowMs, maxRequests, keyPrefix } = config;
  const windowId = Math.floor(Date.now() / windowMs);
  const key = `ratelimit:${keyPrefix}:${userId}:${windowId}`;
  const windowExpireSecs = Math.ceil(windowMs / 1000);

  // Time remaining until this window resets
  const windowStartMs = windowId * windowMs;
  const resetMs = windowStartMs + windowMs - Date.now();

  try {
    const redis = getRedis();
    const count = await redis.incr(key);

    // Set expiry only on the first increment to avoid extending the window
    if (count === 1) {
      await redis.expire(key, windowExpireSecs);
    }

    if (count > maxRequests) {
      return { allowed: false, remaining: 0, resetMs };
    }

    return { allowed: true, remaining: maxRequests - count, resetMs };
  } catch (err) {
    // Graceful degradation: Redis unavailable → allow the request
    console.warn("[rate-limit] Redis unavailable, allowing request:", err);
    return { allowed: true, remaining: maxRequests, resetMs };
  }
}

/**
 * Helper for API route handlers.
 * Returns a 429 NextResponse when the rate limit is exceeded,
 * or null when the request is allowed.
 *
 * Sets standard rate-limit headers on the 429 response.
 */
export async function enforceRateLimit(
  userId: string,
  config: RateLimitConfig,
): Promise<NextResponse | null> {
  const result = await checkRateLimit(userId, config);

  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(config.maxRequests),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetMs / 1000)),
  };

  if (!result.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers },
    );
  }

  return null;
}
