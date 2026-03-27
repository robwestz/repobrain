import { pgTable, uuid, text, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users, repoConnections, files } from "./schema";

// ---------------------------------------------------------------------------
// bookmarks
// ---------------------------------------------------------------------------

export const bookmarks = pgTable(
  "bookmarks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    repoConnectionId: uuid("repo_connection_id")
      .notNull()
      .references(() => repoConnections.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    startLine: integer("start_line").notNull(),
    endLine: integer("end_line").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    note: text("note"),
    aiContext: text("ai_context"),
    color: varchar("color", { length: 20 }).default("blue"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("bookmarks_user_id_idx").on(table.userId),
    repoConnectionIdIdx: index("bookmarks_repo_connection_id_idx").on(table.repoConnectionId),
    fileIdIdx: index("bookmarks_file_id_idx").on(table.fileId),
    userRepoIdx: index("bookmarks_user_repo_idx").on(table.userId, table.repoConnectionId),
  }),
);

// ---------------------------------------------------------------------------
// Drizzle relations
// ---------------------------------------------------------------------------

export const bookmarksRelations = relations(bookmarks, ({ one }) => ({
  user: one(users, { fields: [bookmarks.userId], references: [users.id] }),
  repoConnection: one(repoConnections, {
    fields: [bookmarks.repoConnectionId],
    references: [repoConnections.id],
  }),
  file: one(files, { fields: [bookmarks.fileId], references: [files.id] }),
}));
