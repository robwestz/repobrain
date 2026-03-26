import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const isLocal = (process.env.DATABASE_URL || "").includes("localhost");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://repobrain:repobrain@localhost:5432/repobrain",
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });
export type Database = typeof db;
