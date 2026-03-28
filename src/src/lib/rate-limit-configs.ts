import type { RateLimitConfig } from "@/src/lib/rate-limit";

export const RATE_LIMITS = {
  chat: { windowMs: 60_000, maxRequests: 10, keyPrefix: "chat" },
  search: { windowMs: 60_000, maxRequests: 30, keyPrefix: "search" },
  llmGeneration: { windowMs: 60_000, maxRequests: 5, keyPrefix: "llm-gen" },
  cloneIndex: { windowMs: 300_000, maxRequests: 3, keyPrefix: "clone" },
  deepResearch: { windowMs: 60_000, maxRequests: 3, keyPrefix: "deep-research" },
} as const satisfies Record<string, RateLimitConfig>;
