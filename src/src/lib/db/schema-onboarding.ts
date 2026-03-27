import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { repoConnections, users } from "./schema";

// ---------------------------------------------------------------------------
// onboarding_progress
// ---------------------------------------------------------------------------

export const onboardingProgress = pgTable(
  "onboarding_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    repoConnectionId: uuid("repo_connection_id")
      .notNull()
      .references(() => repoConnections.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 100 }).notNull(),
    completedSteps: jsonb("completed_steps").$type<number[]>().default([]).notNull(),
    currentStep: integer("current_step").default(1).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userRepoRoleUniq: uniqueIndex("onboarding_progress_user_repo_role_idx").on(
      table.userId,
      table.repoConnectionId,
      table.role,
    ),
    userIdIdx: index("onboarding_progress_user_id_idx").on(table.userId),
    repoConnectionIdIdx: index("onboarding_progress_repo_connection_id_idx").on(
      table.repoConnectionId,
    ),
  }),
);
