/**
 * Thread service — orchestrates DB queries, enforces business rules.
 */

import { db } from "@/src/lib/db";
import { eq } from "drizzle-orm";
import {
  insertComment,
  updateThreadStatus,
  deleteThreadById,
  queryThreadsForFile,
  queryThreadsForRepo,
  queryThreadById,
  findFileByRepoAndPath,
  findSymbolAtLines,
  type Thread,
  type ThreadWithComments,
  type Comment,
} from "./queries";
import { codeThreads, codeComments } from "@/src/lib/db/schema";

export type { Thread, ThreadWithComments, Comment };

// ---------------------------------------------------------------------------
// Create thread (with first comment) in a DB transaction
// ---------------------------------------------------------------------------

interface CreateThreadInput {
  repoConnectionId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  title: string;
  firstComment: string;
  userId: string;
}

export async function createThread(input: CreateThreadInput): Promise<ThreadWithComments> {
  // 1. Look up the file in DB
  const file = await findFileByRepoAndPath(input.repoConnectionId, input.filePath);
  if (!file) {
    throw new Error(`File not found in index: ${input.filePath}`);
  }

  // 2. Check if the line range overlaps with a symbol
  const symbol = await findSymbolAtLines(file.id, input.startLine, input.endLine);

  // 3. Create thread + first comment in a transaction
  let threadId: string;
  await db.transaction(async (tx) => {
    const [thread] = await tx
      .insert(codeThreads)
      .values({
        repoConnectionId: input.repoConnectionId,
        fileId: file.id,
        filePath: input.filePath,
        startLine: input.startLine,
        endLine: input.endLine,
        symbolId: symbol?.id ?? null,
        title: input.title,
        status: "open",
        createdById: input.userId,
      })
      .returning();

    await tx
      .insert(codeComments)
      .values({
        threadId: thread.id,
        userId: input.userId,
        content: input.firstComment,
      });

    threadId = thread.id;
  });

  // 4. Return full thread with comments
  const result = await queryThreadById(threadId!);
  if (!result) throw new Error("Failed to load created thread");
  return result;
}

// ---------------------------------------------------------------------------
// Add comment
// ---------------------------------------------------------------------------

export async function addComment(
  threadId: string,
  userId: string,
  content: string,
): Promise<Comment> {
  const thread = await queryThreadById(threadId);
  if (!thread) throw new Error("Thread not found");

  const comment = await insertComment({ threadId, userId, content });

  // Bump thread updatedAt
  await db
    .update(codeThreads)
    .set({ updatedAt: new Date() })
    .where(eq(codeThreads.id, threadId));

  return {
    ...comment,
    user: { login: userId, avatarUrl: null }, // will be enriched by caller if needed
  };
}

// ---------------------------------------------------------------------------
// Resolve / Reopen
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function resolveThread(threadId: string, _userId: string): Promise<Thread> {
  const thread = await queryThreadById(threadId);
  if (!thread) throw new Error("Thread not found");

  const updated = await updateThreadStatus(threadId, "resolved");

  return {
    ...updated,
    commentCount: thread.commentCount,
    lastCommentAt: thread.lastCommentAt,
    createdBy: thread.createdBy,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function reopenThread(threadId: string, _userId: string): Promise<Thread> {
  const thread = await queryThreadById(threadId);
  if (!thread) throw new Error("Thread not found");

  const updated = await updateThreadStatus(threadId, "open");

  return {
    ...updated,
    commentCount: thread.commentCount,
    lastCommentAt: thread.lastCommentAt,
    createdBy: thread.createdBy,
  };
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export async function getThreadsForFile(
  repoConnectionId: string,
  filePath: string,
): Promise<Thread[]> {
  return queryThreadsForFile(repoConnectionId, filePath);
}

export async function getThreadsForRepo(
  repoConnectionId: string,
  status?: "open" | "resolved",
): Promise<Thread[]> {
  return queryThreadsForRepo(repoConnectionId, status);
}

export async function getThread(threadId: string): Promise<ThreadWithComments | null> {
  return queryThreadById(threadId);
}

// ---------------------------------------------------------------------------
// Delete (creator only)
// ---------------------------------------------------------------------------

export async function deleteThread(threadId: string, userId: string): Promise<void> {
  const thread = await queryThreadById(threadId);
  if (!thread) throw new Error("Thread not found");
  if (thread.createdById !== userId) {
    throw new Error("Only the thread creator can delete a thread");
  }
  await deleteThreadById(threadId);
}
