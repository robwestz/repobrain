import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users, repoConnections, files, symbols } from "./schema";

// ---------------------------------------------------------------------------
// code_threads
// ---------------------------------------------------------------------------

export const codeThreads = pgTable(
  "code_threads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repoConnectionId: uuid("repo_connection_id")
      .notNull()
      .references(() => repoConnections.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    startLine: integer("start_line").notNull(),
    endLine: integer("end_line").notNull(),
    symbolId: uuid("symbol_id").references(() => symbols.id, { onDelete: "set null" }),
    title: varchar("title", { length: 300 }).notNull(),
    status: varchar("status", { length: 20 }).default("open").notNull(),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => ({
    repoConnectionIdIdx: index("code_threads_repo_connection_id_idx").on(table.repoConnectionId),
    fileIdIdx: index("code_threads_file_id_idx").on(table.fileId),
    filePathIdx: index("code_threads_file_path_idx").on(table.filePath),
    statusIdx: index("code_threads_status_idx").on(table.status),
    createdByIdIdx: index("code_threads_created_by_id_idx").on(table.createdById),
  }),
);

// ---------------------------------------------------------------------------
// code_comments
// ---------------------------------------------------------------------------

export const codeComments = pgTable(
  "code_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => codeThreads.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    threadIdIdx: index("code_comments_thread_id_idx").on(table.threadId),
    userIdIdx: index("code_comments_user_id_idx").on(table.userId),
  }),
);

// ---------------------------------------------------------------------------
// Drizzle relations
// ---------------------------------------------------------------------------

export const codeThreadsRelations = relations(codeThreads, ({ one, many }) => ({
  repoConnection: one(repoConnections, {
    fields: [codeThreads.repoConnectionId],
    references: [repoConnections.id],
  }),
  file: one(files, {
    fields: [codeThreads.fileId],
    references: [files.id],
  }),
  symbol: one(symbols, {
    fields: [codeThreads.symbolId],
    references: [symbols.id],
  }),
  createdBy: one(users, {
    fields: [codeThreads.createdById],
    references: [users.id],
  }),
  comments: many(codeComments),
}));

export const codeCommentsRelations = relations(codeComments, ({ one }) => ({
  thread: one(codeThreads, {
    fields: [codeComments.threadId],
    references: [codeThreads.id],
  }),
  user: one(users, {
    fields: [codeComments.userId],
    references: [users.id],
  }),
}));
