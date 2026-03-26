import { z } from "zod";

const envSchema = z.object({
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_REDIRECT_URI: z.string().url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  BLOB_STORAGE_PATH: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export type Env = z.infer<typeof envSchema>;

// Lazy singleton — validated on first access
let _env: Env | null = null;

export function env(): Env {
  if (!_env) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
      throw new Error("Invalid environment variables");
    }
    _env = parsed.data;
  }
  return _env;
}
