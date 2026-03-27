import { pgTable, uuid, text, varchar, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { repoConnections } from "./schema";

export const crossRepoRelations = pgTable(
  "cross_repo_relations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fromRepoId: uuid("from_repo_id")
      .notNull()
      .references(() => repoConnections.id, { onDelete: "cascade" }),
    toRepoId: uuid("to_repo_id")
      .notNull()
      .references(() => repoConnections.id, { onDelete: "cascade" }),
    relationType: varchar("relation_type", { length: 50 }).notNull(),
    // Types: "api-consumer", "shared-type", "npm-dependency", "shared-module", "import-pattern"
    fromFilePath: text("from_file_path").notNull(),
    toFilePath: text("to_file_path").notNull(),
    fromSymbolName: varchar("from_symbol_name", { length: 200 }),
    toSymbolName: varchar("to_symbol_name", { length: 200 }),
    evidence: text("evidence"), // the code/config that proves this relation
    confidence: varchar("confidence", { length: 20 }).default("medium"), // high, medium, low
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    fromRepoIdIdx: index("cross_repo_relations_from_repo_id_idx").on(table.fromRepoId),
    toRepoIdIdx: index("cross_repo_relations_to_repo_id_idx").on(table.toRepoId),
    relationTypeIdx: index("cross_repo_relations_relation_type_idx").on(table.relationType),
  }),
);

export const crossRepoSearchCache = pgTable(
  "cross_repo_search_cache",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    query: text("query").notNull(),
    results: jsonb("results").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdIdx: index("cross_repo_search_cache_workspace_id_idx").on(table.workspaceId),
  }),
);
