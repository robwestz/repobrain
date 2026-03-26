/**
 * Database queries for conversation and message entities.
 * All raw DB access for the chat module lives here.
 */

import { db } from "@/src/lib/db";
import { conversations, messages } from "@/src/lib/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import type { Citation, RetrievalTrace } from "@/src/types/domain";

// ---------------------------------------------------------------------------
// Conversation queries
// ---------------------------------------------------------------------------

export async function findConversationById(conversationId: string) {
  return db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
}

export async function findConversationsByWorkspace(workspaceId: string) {
  return db.query.conversations.findMany({
    where: eq(conversations.workspaceId, workspaceId),
    orderBy: [desc(conversations.updatedAt)],
  });
}

export async function insertConversation(data: {
  workspaceId: string;
  repoConnectionId: string;
  title?: string | null;
}) {
  const [conv] = await db
    .insert(conversations)
    .values({
      workspaceId: data.workspaceId,
      repoConnectionId: data.repoConnectionId,
      title: data.title ?? null,
    })
    .returning();
  return conv;
}

export async function updateConversationTitle(
  conversationId: string,
  title: string,
) {
  await db
    .update(conversations)
    .set({ title, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

/** Bump updatedAt so the conversation floats to the top of recent lists. */
export async function touchConversation(conversationId: string) {
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

// ---------------------------------------------------------------------------
// Message queries
// ---------------------------------------------------------------------------

export async function findMessagesByConversation(conversationId: string) {
  return db.query.messages.findMany({
    where: eq(messages.conversationId, conversationId),
    orderBy: [asc(messages.createdAt)],
  });
}

export async function insertMessage(data: {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  retrievalTrace?: RetrievalTrace | null;
}) {
  const [msg] = await db
    .insert(messages)
    .values({
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      citations: (data.citations ?? []) as unknown[],
      retrievalTrace: (data.retrievalTrace ?? null) as unknown,
    })
    .returning();
  return msg;
}
