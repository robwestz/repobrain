import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  bigint,
  integer,
  jsonb,
  uniqueIndex,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Custom pgvector type
// ---------------------------------------------------------------------------

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    // pgvector returns "[0.1,0.2,...]" format
    return value
      .slice(1, -1)
      .split(",")
      .map(Number);
  },
});

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    githubId: bigint("github_id", { mode: "number" }).notNull().unique(),
    githubLogin: varchar("github_login", { length: 255 }).notNull(),
    githubAccessToken: text("github_access_token").notNull(),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    githubIdIdx: uniqueIndex("users_github_id_idx").on(table.githubId),
    githubLoginIdx: index("users_github_login_idx").on(table.githubLogin),
  }),
);

// ---------------------------------------------------------------------------
// workspaces
// ---------------------------------------------------------------------------

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("workspaces_user_id_idx").on(table.userId),
  }),
);

// ---------------------------------------------------------------------------
// repo_connections
// ---------------------------------------------------------------------------

export const repoConnections = pgTable(
  "repo_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    githubRepoId: bigint("github_repo_id", { mode: "number" }).notNull(),
    owner: varchar("owner", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    defaultBranch: varchar("default_branch", { length: 255 }).notNull().default("main"),
    clonePath: text("clone_path").notNull(),
    indexedCommitSha: text("indexed_commit_sha"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdIdx: index("repo_connections_workspace_id_idx").on(table.workspaceId),
    githubRepoIdIdx: index("repo_connections_github_repo_id_idx").on(table.githubRepoId),
    statusIdx: index("repo_connections_status_idx").on(table.status),
  }),
);

// ---------------------------------------------------------------------------
// files
// ---------------------------------------------------------------------------

export const files = pgTable(
  "files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repoConnectionId: uuid("repo_connection_id")
      .notNull()
      .references(() => repoConnections.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    language: varchar("language", { length: 100 }),
    sizeBytes: integer("size_bytes").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    lineCount: integer("line_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    repoPathUniq: uniqueIndex("files_repo_connection_id_path_idx").on(
      table.repoConnectionId,
      table.path,
    ),
    repoConnectionIdIdx: index("files_repo_connection_id_idx").on(table.repoConnectionId),
    languageIdx: index("files_language_idx").on(table.language),
  }),
);

// ---------------------------------------------------------------------------
// symbols
// ---------------------------------------------------------------------------

export const symbols = pgTable(
  "symbols",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 500 }).notNull(),
    kind: varchar("kind", { length: 50 }).notNull(),
    startLine: integer("start_line").notNull(),
    endLine: integer("end_line").notNull(),
    // Self-reference for nested symbols (e.g., method inside class)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parentSymbolId: uuid("parent_symbol_id").references((): any => symbols.id, {
      onDelete: "set null",
    }),
    signature: text("signature"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    fileIdIdx: index("symbols_file_id_idx").on(table.fileId),
    nameIdx: index("symbols_name_idx").on(table.name),
    kindIdx: index("symbols_kind_idx").on(table.kind),
    parentSymbolIdIdx: index("symbols_parent_symbol_id_idx").on(table.parentSymbolId),
  }),
);

// ---------------------------------------------------------------------------
// symbol_relations
// ---------------------------------------------------------------------------

export const symbolRelations = pgTable(
  "symbol_relations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fromSymbolId: uuid("from_symbol_id")
      .notNull()
      .references(() => symbols.id, { onDelete: "cascade" }),
    toSymbolId: uuid("to_symbol_id")
      .notNull()
      .references(() => symbols.id, { onDelete: "cascade" }),
    relationType: varchar("relation_type", { length: 50 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    fromSymbolIdIdx: index("symbol_relations_from_symbol_id_idx").on(table.fromSymbolId),
    toSymbolIdIdx: index("symbol_relations_to_symbol_id_idx").on(table.toSymbolId),
    relationTypeIdx: index("symbol_relations_relation_type_idx").on(table.relationType),
  }),
);

// ---------------------------------------------------------------------------
// chunks
// ---------------------------------------------------------------------------

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    startLine: integer("start_line").notNull(),
    endLine: integer("end_line").notNull(),
    symbolId: uuid("symbol_id").references(() => symbols.id, { onDelete: "set null" }),
    tokenCount: integer("token_count").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    fileIdIdx: index("chunks_file_id_idx").on(table.fileId),
    symbolIdIdx: index("chunks_symbol_id_idx").on(table.symbolId),
    contentHashIdx: index("chunks_content_hash_idx").on(table.contentHash),
  }),
);

// ---------------------------------------------------------------------------
// embeddings
// ---------------------------------------------------------------------------

export const embeddings = pgTable(
  "embeddings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chunkId: uuid("chunk_id")
      .notNull()
      .unique()
      .references(() => chunks.id, { onDelete: "cascade" }),
    vector: vector("vector").notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    chunkIdIdx: uniqueIndex("embeddings_chunk_id_idx").on(table.chunkId),
  }),
);

// ---------------------------------------------------------------------------
// repo_summaries
// ---------------------------------------------------------------------------

export const repoSummaries = pgTable(
  "repo_summaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repoConnectionId: uuid("repo_connection_id")
      .notNull()
      .unique()
      .references(() => repoConnections.id, { onDelete: "cascade" }),
    summaryText: text("summary_text").notNull(),
    componentList: jsonb("component_list").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    commitSha: varchar("commit_sha", { length: 40 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    repoConnectionIdIdx: uniqueIndex("repo_summaries_repo_connection_id_idx").on(
      table.repoConnectionId,
    ),
  }),
);

// ---------------------------------------------------------------------------
// conversations
// ---------------------------------------------------------------------------

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    repoConnectionId: uuid("repo_connection_id")
      .notNull()
      .references(() => repoConnections.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdIdx: index("conversations_workspace_id_idx").on(table.workspaceId),
    repoConnectionIdIdx: index("conversations_repo_connection_id_idx").on(table.repoConnectionId),
  }),
);

// ---------------------------------------------------------------------------
// messages
// ---------------------------------------------------------------------------

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(),
    content: text("content").notNull(),
    citations: jsonb("citations").notNull().default([]),
    retrievalTrace: jsonb("retrieval_trace"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    conversationIdIdx: index("messages_conversation_id_idx").on(table.conversationId),
    roleIdx: index("messages_role_idx").on(table.role),
  }),
);

// ---------------------------------------------------------------------------
// index_jobs
// ---------------------------------------------------------------------------

export const indexJobs = pgTable(
  "index_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repoConnectionId: uuid("repo_connection_id")
      .notNull()
      .references(() => repoConnections.id, { onDelete: "cascade" }),
    jobType: varchar("job_type", { length: 20 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    progress: jsonb("progress").notNull().default({}),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    repoConnectionIdIdx: index("index_jobs_repo_connection_id_idx").on(table.repoConnectionId),
    statusIdx: index("index_jobs_status_idx").on(table.status),
  }),
);

// ---------------------------------------------------------------------------
// suggested_changes (Phase 3 stub)
// ---------------------------------------------------------------------------

export const suggestedChanges = pgTable(
  "suggested_changes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    diffText: text("diff_text").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    conversationIdIdx: index("suggested_changes_conversation_id_idx").on(table.conversationId),
    messageIdIdx: index("suggested_changes_message_id_idx").on(table.messageId),
    statusIdx: index("suggested_changes_status_idx").on(table.status),
  }),
);

// ---------------------------------------------------------------------------
// branch_actions (Phase 3 stub)
// ---------------------------------------------------------------------------

export const branchActions = pgTable(
  "branch_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repoConnectionId: uuid("repo_connection_id")
      .notNull()
      .references(() => repoConnections.id, { onDelete: "cascade" }),
    branchName: varchar("branch_name", { length: 255 }).notNull(),
    sourceBranch: varchar("source_branch", { length: 255 }).notNull(),
    commitSha: varchar("commit_sha", { length: 40 }),
    commitMessage: text("commit_message"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    suggestedChangeIds: jsonb("suggested_change_ids").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    repoConnectionIdIdx: index("branch_actions_repo_connection_id_idx").on(table.repoConnectionId),
    statusIdx: index("branch_actions_status_idx").on(table.status),
  }),
);

// ---------------------------------------------------------------------------
// Drizzle ORM relations (for query builder)
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  workspaces: many(workspaces),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  user: one(users, { fields: [workspaces.userId], references: [users.id] }),
  repoConnections: many(repoConnections),
  conversations: many(conversations),
}));

export const repoConnectionsRelations = relations(repoConnections, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [repoConnections.workspaceId], references: [workspaces.id] }),
  files: many(files),
  indexJobs: many(indexJobs),
  conversations: many(conversations),
  repoSummary: one(repoSummaries),
  branchActions: many(branchActions),
}));

export const filesRelations = relations(files, ({ one, many }) => ({
  repoConnection: one(repoConnections, { fields: [files.repoConnectionId], references: [repoConnections.id] }),
  symbols: many(symbols),
  chunks: many(chunks),
}));

export const symbolsRelations = relations(symbols, ({ one, many }) => ({
  file: one(files, { fields: [symbols.fileId], references: [files.id] }),
  parentSymbol: one(symbols, { fields: [symbols.parentSymbolId], references: [symbols.id], relationName: "parentChild" }),
  childSymbols: many(symbols, { relationName: "parentChild" }),
  outgoingRelations: many(symbolRelations, { relationName: "fromSymbol" }),
  incomingRelations: many(symbolRelations, { relationName: "toSymbol" }),
  chunks: many(chunks),
}));

export const symbolRelationsRelations = relations(symbolRelations, ({ one }) => ({
  fromSymbol: one(symbols, { fields: [symbolRelations.fromSymbolId], references: [symbols.id], relationName: "fromSymbol" }),
  toSymbol: one(symbols, { fields: [symbolRelations.toSymbolId], references: [symbols.id], relationName: "toSymbol" }),
}));

export const chunksRelations = relations(chunks, ({ one }) => ({
  file: one(files, { fields: [chunks.fileId], references: [files.id] }),
  symbol: one(symbols, { fields: [chunks.symbolId], references: [symbols.id] }),
  embedding: one(embeddings),
}));

export const embeddingsRelations = relations(embeddings, ({ one }) => ({
  chunk: one(chunks, { fields: [embeddings.chunkId], references: [chunks.id] }),
}));

export const repoSummariesRelations = relations(repoSummaries, ({ one }) => ({
  repoConnection: one(repoConnections, { fields: [repoSummaries.repoConnectionId], references: [repoConnections.id] }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [conversations.workspaceId], references: [workspaces.id] }),
  repoConnection: one(repoConnections, { fields: [conversations.repoConnectionId], references: [repoConnections.id] }),
  messages: many(messages),
  suggestedChanges: many(suggestedChanges),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
  suggestedChanges: many(suggestedChanges),
}));

export const indexJobsRelations = relations(indexJobs, ({ one }) => ({
  repoConnection: one(repoConnections, { fields: [indexJobs.repoConnectionId], references: [repoConnections.id] }),
}));

export const suggestedChangesRelations = relations(suggestedChanges, ({ one }) => ({
  conversation: one(conversations, { fields: [suggestedChanges.conversationId], references: [conversations.id] }),
  message: one(messages, { fields: [suggestedChanges.messageId], references: [messages.id] }),
}));

export const branchActionsRelations = relations(branchActions, ({ one }) => ({
  repoConnection: one(repoConnections, { fields: [branchActions.repoConnectionId], references: [repoConnections.id] }),
}));
