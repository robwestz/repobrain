import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgresql://repobrain:repobrain@localhost:5432/repobrain",
  });

  // Ensure pgvector extension exists
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
  await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");

  const db = drizzle(pool);
  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete.");
  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
