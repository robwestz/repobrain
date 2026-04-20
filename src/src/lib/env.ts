import { z } from "zod";
import { logger } from "./logger";

const envSchema = z.object({
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_REDIRECT_URI: z.string().url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OLLAMA_HOST: z.string().optional(),
  OLLAMA_MODEL: z.string().optional(),
  DEFAULT_LLM_PROVIDER: z.enum(["openai", "anthropic", "ollama"]).default("openai"),
  SESSION_SECRET: z.string().min(32),
  BLOB_STORAGE_PATH: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function env(): Env {
  if (!_env) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      logger.error({ fields: parsed.error.flatten().fieldErrors }, "Invalid environment variables");
      throw new Error("Invalid environment variables");
    }
    _env = parsed.data;
    if (process.env.NODE_ENV === "production") {
      if (_env.SESSION_SECRET === "this-is-a-secret-that-must-be-at-least-32-chars") {
        throw new Error("SESSION_SECRET is using the insecure default — set a real secret in production");
      }
      if (_env.DATABASE_URL.includes("localhost")) {
        throw new Error("DATABASE_URL points to localhost in production");
      }
    }
  }
  return _env;
}
