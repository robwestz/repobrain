import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const connString = process.env.DATABASE_URL;
  if (!connString) {
    throw new Error("DATABASE_URL environment variable is required for migrations");
  }
  const isLocal = connString.includes("localhost") || connString.includes("127.0.0.1");
  const pool = new Pool({
    connectionString: connString,
    ssl: isLocal ? false : { rejectUnauthorized: true },
  });

  // Ensure pgvector extension exists
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
  await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");

  const db = drizzle(pool);
  const { logger } = await import("../logger");
  logger.info("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  logger.info("Migrations complete.");
  await pool.end();
}

main().catch(async (err) => {
  const { logger } = await import("../logger");
  logger.error({ err }, "Migration failed");
  process.exit(1);
});
