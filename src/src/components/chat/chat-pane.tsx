"use client";

/**
 * ChatPane — the right-panel chat interface for the workspace.
 *
 * Manages:
 *   - Conversation lifecycle (create on first question, persist across turns)
 *   - Optimistic UI (user messages appear immediately)
 *   - SSE streaming (tokens appear as they arrive)
 *   - Citation event handling (emits onCitationNavigate to parent)
 *   - Conversation history dropdown
 *
 * Props:
 *   workspaceId         — to create/list conversations
 *   repoConnectionId    — attached to the conversation
 *   disabled            — true while repo is not ready
 *   prefillQuestion     — populated by "Ask about this file" button
 *   onPrefillUsed       — called once prefill has been applied
 *   onCitationNavigate  — called when user clicks a citation badge
 *   activeFilePath      — currently open file in the code viewer
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Message } from "./message";
import { InputBar } from "./input-bar";
import { StreamingIndicator } from "./streaming-indicator";
import type { Citation } from "@/src/types/domain";
import type { ChatStreamEvent } from "@/src/types/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LocalMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  /** True while the assistant message is still streaming */
  streaming?: boolean;
}

interface ChatPaneProps {
  workspaceId: string;
  repoConnectionId: string | null;
  /** True while repo is not ready — disables the input */
  disabled?: boolean;
  /** Pre-fill the input (from "Ask about this file") */
  prefillQuestion?: string;
  onPrefillUsed?: () => void;
  /** Called when the user clicks a citation — parent navigates code viewer */
  onCitationNavigate?: (filePath: string, startLine: number, endLine: number) => void;
  /** Currently active file path (used to scope "ask about this file" queries) */
  activeFilePath?: string | null;
}

// ---------------------------------------------------------------------------
// ChatPane
// ---------------------------------------------------------------------------

export function ChatPane({
  workspaceId,
  repoConnectionId,
  disabled,
  prefillQuestion,
  onPrefillUsed,
  onCitationNavigate,
}: ChatPaneProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ---------------------------------------------------------------------------
  // Conversation management
  // ---------------------------------------------------------------------------

  /** Ensure a conversation exists and return its ID. */
  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (conversationId) return conversationId;
    if (!repoConnectionId) return null;

    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, repoConnectionId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create conversation");
      }

      const conv = await res.json();
      setConversationId(conv.id);
      return conv.id as string;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create conversation");
      return null;
    }
  }, [conversationId, repoConnectionId, workspaceId]);

  // ---------------------------------------------------------------------------
  // Send a question
  // ---------------------------------------------------------------------------

  const sendQuestion = useCallback(
    async (question: string) => {
      if (!question.trim() || isStreaming) return;
      setError(null);

      const convId = await ensureConversation();
      if (!convId) return;

      // Optimistic user message
      const userMsgId = `local-user-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: "user", content: question, citations: [] },
      ]);

      // Placeholder streaming assistant message
      const assistantMsgId = `local-assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: "assistant", content: "", citations: [], streaming: true },
      ]);

      setIsStreaming(true);

      // Cancel any previous in-flight request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const res = await fetch(`/api/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: question }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to send message");
        }

        // Process the SSE stream
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            let event: ChatStreamEvent;
            try {
              event = JSON.parse(jsonStr);
            } catch {
              continue;
            }

            if (event.type === "token") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + event.content }
                    : m,
                ),
              );
            } else if (event.type === "citation") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, citations: [...m.citations, event.citation] }
                    : m,
                ),
              );
            } else if (event.type === "done") {
              // Replace the local placeholder ID with the real DB ID
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, id: event.messageId, streaming: false }
                    : m,
                ),
              );
            } else if (event.type === "error") {
              throw new Error(event.error);
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const errorMessage = err instanceof Error ? err.message : "Something went wrong";
        setError(errorMessage);
        // Remove the streaming placeholder on error
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId));
      } finally {
        setIsStreaming(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, streaming: false } : m,
          ),
        );
      }
    },
    [isStreaming, ensureConversation],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isEmpty = messages.length === 0;
  const isDisabled = disabled || !repoConnectionId;

  return (
    <div className="flex h-full flex-col">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {isEmpty && !isDisabled && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium">Ask about your codebase</p>
            <p className="text-xs text-[var(--muted-foreground)] max-w-[220px]">
              Questions are answered with citations to the exact files and lines.
            </p>
            <div className="mt-3 grid gap-1.5 text-left w-full max-w-[260px]">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendQuestion(q)}
                  className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-left text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {isEmpty && isDisabled && (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-xs text-[var(--muted-foreground)]">
              {!repoConnectionId
                ? "Connect a repository to start chatting"
                : "Chat will be available once indexing completes"}
            </p>
          </div>
        )}

        {!isEmpty && (
          <div className="flex flex-col gap-3">
            {messages.map((msg) => (
              <div key={msg.id}>
                {msg.streaming && msg.content === "" ? (
                  <div className="flex justify-start">
                    <div className="rounded-lg bg-[var(--muted)] px-3 py-2">
                      <StreamingIndicator />
                    </div>
                  </div>
                ) : (
                  <Message
                    role={msg.role}
                    content={msg.content}
                    citations={msg.citations}
                    onCitationNavigate={onCitationNavigate}
                  />
                )}
              </div>
            ))}

            {/* Error display */}
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
                <span className="font-medium">Error:</span> {error}
              </div>
            )}
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={scrollAnchorRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t p-3">
        <InputBar
          onSend={sendQuestion}
          disabled={isDisabled}
          isStreaming={isStreaming}
          prefillValue={prefillQuestion}
          onPrefillUsed={onPrefillUsed}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Example questions shown in empty state
// ---------------------------------------------------------------------------

const EXAMPLE_QUESTIONS = [
  "How does authentication work?",
  "What are the main components?",
  "Where is the database layer defined?",
];
