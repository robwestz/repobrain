/**
 * Raw database queries for code threads and comments.
 */

import { db } from "@/src/lib/db";
import { codeThreads, codeComments, files, symbols, users } from "@/src/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Thread = typeof codeThreads.$inferSelect & {
  commentCount: number;
  lastCommentAt: Date | null;
  createdBy: { login: string; avatarUrl: string | null };
};

export type Comment = typeof codeComments.$inferSelect & {
  user: { login: string; avatarUrl: string | null };
};

export type ThreadWithComments = Thread & {
  comments: Comment[];
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function queryThreadsForRepo(
  repoConnectionId: string,
  status?: "open" | "resolved",
): Promise<Thread[]> {
  // Build where conditions
  const conditions = [eq(codeThreads.repoConnectionId, repoConnectionId)];
  if (status) {
    conditions.push(eq(codeThreads.status, status));
  }

  const rows = await db
    .select({
      id: codeThreads.id,
      repoConnectionId: codeThreads.repoConnectionId,
      fileId: codeThreads.fileId,
      filePath: codeThreads.filePath,
      startLine: codeThreads.startLine,
      endLine: codeThreads.endLine,
      symbolId: codeThreads.symbolId,
      title: codeThreads.title,
      status: codeThreads.status,
      createdById: codeThreads.createdById,
      createdAt: codeThreads.createdAt,
      updatedAt: codeThreads.updatedAt,
      resolvedAt: codeThreads.resolvedAt,
      commentCount: sql<number>`cast(count(${codeComments.id}) as int)`,
      lastCommentAt: sql<Date | null>`max(${codeComments.createdAt})`,
      creatorLogin: users.githubLogin,
      creatorAvatarUrl: users.avatarUrl,
    })
    .from(codeThreads)
    .leftJoin(codeComments, eq(codeComments.threadId, codeThreads.id))
    .leftJoin(users, eq(users.id, codeThreads.createdById))
    .where(and(...conditions))
    .groupBy(
      codeThreads.id,
      users.githubLogin,
      users.avatarUrl,
    )
    .orderBy(desc(codeThreads.updatedAt));

  return rows.map((r) => ({
    id: r.id,
    repoConnectionId: r.repoConnectionId,
    fileId: r.fileId,
    filePath: r.filePath,
    startLine: r.startLine,
    endLine: r.endLine,
    symbolId: r.symbolId,
    title: r.title,
    status: r.status,
    createdById: r.createdById,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    resolvedAt: r.resolvedAt,
    commentCount: r.commentCount,
    lastCommentAt: r.lastCommentAt,
    createdBy: { login: r.creatorLogin ?? "", avatarUrl: r.creatorAvatarUrl ?? null },
  }));
}

export async function queryThreadsForFile(
  repoConnectionId: string,
  filePath: string,
): Promise<Thread[]> {
  const rows = await db
    .select({
      id: codeThreads.id,
      repoConnectionId: codeThreads.repoConnectionId,
      fileId: codeThreads.fileId,
      filePath: codeThreads.filePath,
      startLine: codeThreads.startLine,
      endLine: codeThreads.endLine,
      symbolId: codeThreads.symbolId,
      title: codeThreads.title,
      status: codeThreads.status,
      createdById: codeThreads.createdById,
      createdAt: codeThreads.createdAt,
      updatedAt: codeThreads.updatedAt,
      resolvedAt: codeThreads.resolvedAt,
      commentCount: sql<number>`cast(count(${codeComments.id}) as int)`,
      lastCommentAt: sql<Date | null>`max(${codeComments.createdAt})`,
      creatorLogin: users.githubLogin,
      creatorAvatarUrl: users.avatarUrl,
    })
    .from(codeThreads)
    .leftJoin(codeComments, eq(codeComments.threadId, codeThreads.id))
    .leftJoin(users, eq(users.id, codeThreads.createdById))
    .where(
      and(
        eq(codeThreads.repoConnectionId, repoConnectionId),
        eq(codeThreads.filePath, filePath),
      ),
    )
    .groupBy(
      codeThreads.id,
      users.githubLogin,
      users.avatarUrl,
    )
    .orderBy(codeThreads.startLine);

  return rows.map((r) => ({
    id: r.id,
    repoConnectionId: r.repoConnectionId,
    fileId: r.fileId,
    filePath: r.filePath,
    startLine: r.startLine,
    endLine: r.endLine,
    symbolId: r.symbolId,
    title: r.title,
    status: r.status,
    createdById: r.createdById,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    resolvedAt: r.resolvedAt,
    commentCount: r.commentCount,
    lastCommentAt: r.lastCommentAt,
    createdBy: { login: r.creatorLogin ?? "", avatarUrl: r.creatorAvatarUrl ?? null },
  }));
}

export async function queryThreadById(threadId: string): Promise<ThreadWithComments | null> {
  // Fetch thread
  const threadRows = await db
    .select({
      id: codeThreads.id,
      repoConnectionId: codeThreads.repoConnectionId,
      fileId: codeThreads.fileId,
      filePath: codeThreads.filePath,
      startLine: codeThreads.startLine,
      endLine: codeThreads.endLine,
      symbolId: codeThreads.symbolId,
      title: codeThreads.title,
      status: codeThreads.status,
      createdById: codeThreads.createdById,
      createdAt: codeThreads.createdAt,
      updatedAt: codeThreads.updatedAt,
      resolvedAt: codeThreads.resolvedAt,
      creatorLogin: users.githubLogin,
      creatorAvatarUrl: users.avatarUrl,
    })
    .from(codeThreads)
    .leftJoin(users, eq(users.id, codeThreads.createdById))
    .where(eq(codeThreads.id, threadId))
    .limit(1);

  if (threadRows.length === 0) return null;

  const t = threadRows[0];

  // Fetch comments
  const commentRows = await db
    .select({
      id: codeComments.id,
      threadId: codeComments.threadId,
      userId: codeComments.userId,
      content: codeComments.content,
      createdAt: codeComments.createdAt,
      updatedAt: codeComments.updatedAt,
      userLogin: users.githubLogin,
      userAvatarUrl: users.avatarUrl,
    })
    .from(codeComments)
    .leftJoin(users, eq(users.id, codeComments.userId))
    .where(eq(codeComments.threadId, threadId))
    .orderBy(codeComments.createdAt);

  const comments: Comment[] = commentRows.map((c) => ({
    id: c.id,
    threadId: c.threadId,
    userId: c.userId,
    content: c.content,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    user: { login: c.userLogin ?? "", avatarUrl: c.userAvatarUrl ?? null },
  }));

  return {
    id: t.id,
    repoConnectionId: t.repoConnectionId,
    fileId: t.fileId,
    filePath: t.filePath,
    startLine: t.startLine,
    endLine: t.endLine,
    symbolId: t.symbolId,
    title: t.title,
    status: t.status,
    createdById: t.createdById,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    resolvedAt: t.resolvedAt,
    commentCount: comments.length,
    lastCommentAt: comments.length > 0 ? comments[comments.length - 1].createdAt : null,
    createdBy: { login: t.creatorLogin ?? "", avatarUrl: t.creatorAvatarUrl ?? null },
    comments,
  };
}

export async function insertThread(data: {
  repoConnectionId: string;
  fileId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  symbolId: string | null;
  title: string;
  createdById: string;
}) {
  const [thread] = await db
    .insert(codeThreads)
    .values({
      repoConnectionId: data.repoConnectionId,
      fileId: data.fileId,
      filePath: data.filePath,
      startLine: data.startLine,
      endLine: data.endLine,
      symbolId: data.symbolId,
      title: data.title,
      status: "open",
      createdById: data.createdById,
    })
    .returning();
  return thread;
}

export async function insertComment(data: {
  threadId: string;
  userId: string;
  content: string;
}) {
  const [comment] = await db
    .insert(codeComments)
    .values({
      threadId: data.threadId,
      userId: data.userId,
      content: data.content,
    })
    .returning();
  return comment;
}

export async function updateThreadStatus(
  threadId: string,
  status: "open" | "resolved",
) {
  const now = new Date();
  const [updated] = await db
    .update(codeThreads)
    .set({
      status,
      updatedAt: now,
      resolvedAt: status === "resolved" ? now : null,
    })
    .where(eq(codeThreads.id, threadId))
    .returning();
  return updated;
}

export async function deleteThreadById(threadId: string) {
  await db.delete(codeThreads).where(eq(codeThreads.id, threadId));
}

export async function findFileByRepoAndPath(
  repoConnectionId: string,
  filePath: string,
) {
  return db.query.files.findFirst({
    where: and(
      eq(files.repoConnectionId, repoConnectionId),
      eq(files.path, filePath),
    ),
  });
}

export async function findSymbolAtLines(
  fileId: string,
  startLine: number,
  endLine: number,
) {
  // Find a symbol whose range overlaps with the given line range
  const rows = await db
    .select()
    .from(symbols)
    .where(
      and(
        eq(symbols.fileId, fileId),
        sql`${symbols.startLine} <= ${endLine}`,
        sql`${symbols.endLine} >= ${startLine}`,
      ),
    )
    .orderBy(
      // Prefer tighter symbol ranges (closest match)
      sql`(${symbols.endLine} - ${symbols.startLine}) ASC`,
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function countOpenThreadsForRepo(repoConnectionId: string): Promise<number> {
  const rows = await db
    .select({ id: codeThreads.id })
    .from(codeThreads)
    .where(
      and(
        eq(codeThreads.repoConnectionId, repoConnectionId),
        eq(codeThreads.status, "open"),
      ),
    );
  return rows.length;
}
