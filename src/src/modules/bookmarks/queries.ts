/**
 * Database queries for the bookmarks module.
 * All raw DB access for bookmarks lives here.
 */

import { db } from "@/src/lib/db";
import { bookmarks } from "@/src/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BookmarkRow {
  id: string;
  userId: string;
  repoConnectionId: string;
  fileId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  title: string;
  note: string | null;
  aiContext: string | null;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function findBookmarksByRepo(
  userId: string,
  repoConnectionId: string,
): Promise<BookmarkRow[]> {
  return db.query.bookmarks.findMany({
    where: and(
      eq(bookmarks.userId, userId),
      eq(bookmarks.repoConnectionId, repoConnectionId),
    ),
    orderBy: [desc(bookmarks.createdAt)],
  });
}

export async function findBookmarkById(
  id: string,
  userId: string,
): Promise<BookmarkRow | undefined> {
  return db.query.bookmarks.findFirst({
    where: and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)),
  });
}

export async function insertBookmark(data: {
  userId: string;
  repoConnectionId: string;
  fileId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  title: string;
  note?: string | null;
  color?: string | null;
}): Promise<BookmarkRow> {
  const [row] = await db
    .insert(bookmarks)
    .values({
      userId: data.userId,
      repoConnectionId: data.repoConnectionId,
      fileId: data.fileId,
      filePath: data.filePath,
      startLine: data.startLine,
      endLine: data.endLine,
      title: data.title,
      note: data.note ?? null,
      color: data.color ?? "blue",
    })
    .returning();
  return row;
}

export async function updateBookmarkAiContext(
  id: string,
  aiContext: string,
): Promise<void> {
  await db
    .update(bookmarks)
    .set({ aiContext, updatedAt: new Date() })
    .where(eq(bookmarks.id, id));
}

export async function updateBookmark(
  id: string,
  userId: string,
  data: {
    title?: string;
    note?: string | null;
    color?: string | null;
  },
): Promise<BookmarkRow | undefined> {
  const updateData: Partial<{
    title: string;
    note: string | null;
    color: string | null;
    updatedAt: Date;
  }> = { updatedAt: new Date() };

  if (data.title !== undefined) updateData.title = data.title;
  if (data.note !== undefined) updateData.note = data.note;
  if (data.color !== undefined) updateData.color = data.color;

  const [row] = await db
    .update(bookmarks)
    .set(updateData)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
    .returning();
  return row;
}

export async function deleteBookmark(
  id: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
    .returning({ id: bookmarks.id });
  return result.length > 0;
}
