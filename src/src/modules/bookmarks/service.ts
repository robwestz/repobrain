/**
 * Bookmarks service — CRUD operations + AI context generation.
 *
 * AI context is generated asynchronously after bookmark creation so that
 * the API can return immediately without blocking on the LLM call.
 */

import { getProvider, getOpenAIClient, getAnthropicClient, LLM_MODEL } from "@/src/modules/llm/provider";
import {
  findBookmarksByRepo,
  findBookmarkById,
  insertBookmark,
  updateBookmarkAiContext,
  updateBookmark,
  deleteBookmark,
  type BookmarkRow,
} from "./queries";

// ---------------------------------------------------------------------------
// Re-export for API routes
// ---------------------------------------------------------------------------

export type { BookmarkRow };

// ---------------------------------------------------------------------------
// List bookmarks for a repo
// ---------------------------------------------------------------------------

export async function listBookmarks(
  userId: string,
  repoConnectionId: string,
): Promise<BookmarkRow[]> {
  return findBookmarksByRepo(userId, repoConnectionId);
}

// ---------------------------------------------------------------------------
// Create a bookmark (immediately) + trigger AI context in background
// ---------------------------------------------------------------------------

export async function createBookmark(data: {
  userId: string;
  repoConnectionId: string;
  fileId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  title?: string | null;
  note?: string | null;
  color?: string | null;
  codeContent?: string | null; // code lines for AI context generation
}): Promise<BookmarkRow> {
  const title =
    data.title?.trim() ||
    `${data.filePath}:${data.startLine}–${data.endLine}`;

  const bookmark = await insertBookmark({
    userId: data.userId,
    repoConnectionId: data.repoConnectionId,
    fileId: data.fileId,
    filePath: data.filePath,
    startLine: data.startLine,
    endLine: data.endLine,
    title,
    note: data.note ?? null,
    color: data.color ?? "blue",
  });

  // Trigger AI context generation in background (no await)
  if (data.codeContent) {
    generateAiContextAsync(bookmark.id, data.codeContent, data.filePath).catch(
      () => {
        // Silently ignore AI errors — context is optional
      },
    );
  }

  return bookmark;
}

// ---------------------------------------------------------------------------
// Update a bookmark
// ---------------------------------------------------------------------------

export async function editBookmark(
  id: string,
  userId: string,
  data: {
    title?: string;
    note?: string | null;
    color?: string | null;
  },
): Promise<BookmarkRow | null> {
  const row = await updateBookmark(id, userId, data);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Delete a bookmark
// ---------------------------------------------------------------------------

export async function removeBookmark(
  id: string,
  userId: string,
): Promise<boolean> {
  return deleteBookmark(id, userId);
}

// ---------------------------------------------------------------------------
// Get a single bookmark (with ownership check)
// ---------------------------------------------------------------------------

export async function getBookmark(
  id: string,
  userId: string,
): Promise<BookmarkRow | null> {
  const row = await findBookmarkById(id, userId);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// AI context generation (background)
// ---------------------------------------------------------------------------

async function generateAiContextAsync(
  bookmarkId: string,
  codeContent: string,
  filePath: string,
): Promise<void> {
  const prompt = `You are a code documentation assistant. Summarize what the following code does in 1-2 concise sentences. Focus on the purpose and key behavior, not implementation details.\n\nFile: ${filePath}\n\n\`\`\`\n${codeContent}\n\`\`\``;

  const provider = getProvider();

  let aiContext: string;

  if (provider === "anthropic") {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    const block = response.content[0];
    aiContext = block.type === "text" ? block.text.trim() : "";
  } else {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: LLM_MODEL,
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    aiContext = response.choices[0]?.message?.content?.trim() ?? "";
  }

  if (aiContext) {
    await updateBookmarkAiContext(bookmarkId, aiContext);
  }
}
