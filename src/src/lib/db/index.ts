import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let _db: NodePgDatabase<typeof schema> | null = null;

function getDb(): NodePgDatabase<typeof schema> {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL environment variable is required but was not set. " +
          "Example: postgresql://user:password@host:5432/dbname",
      );
    }
    const isLocal =
      connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
    const pool = new Pool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: true },
    });
    _db = drizzle(pool, { schema });
  }
  return _db;
}

// Proxy that defers pool creation to the first request-time access.
// Throws a clear error immediately if DATABASE_URL is missing.
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export type Database = typeof db;
