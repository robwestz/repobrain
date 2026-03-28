"use client";

/**
 * InputBar — question input for the chat pane.
 *
 * Features:
 *   - Auto-expanding textarea (single line by default, grows on Enter+Shift)
 *   - Submit on Enter (Shift+Enter inserts newline)
 *   - Respects external prefill via the `prefillValue` prop
 *   - Disables when `disabled` is true (repo not ready or streaming)
 *   - Deep Research toggle: microscope icon opens the deep research page in a new tab
 */

import { useEffect, useRef, useState, useCallback } from "react";

interface InputBarProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  /** Pre-fill the input (e.g. from "Ask about this file" button) */
  prefillValue?: string;
  /** Called once the prefill has been applied, so the parent can clear it */
  onPrefillUsed?: () => void;
  /** When true, shows the Deep Research toggle button */
  deepResearchAvailable?: boolean;
  /** Workspace ID — needed to build the deep-research URL */
  workspaceId?: string;
}

export function InputBar({
  onSend,
  disabled,
  isStreaming,
  placeholder = "Ask about your codebase…",
  prefillValue,
  onPrefillUsed,
  deepResearchAvailable,
  workspaceId,
}: InputBarProps) {
  const [value, setValue] = useState("");
  const [deepResearchMode, setDeepResearchMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Apply external prefill exactly once
  useEffect(() => {
    if (prefillValue) {
      setValue(prefillValue);
      onPrefillUsed?.();
      // Focus after a tick so the value is committed first
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [prefillValue, onPrefillUsed]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming) return;
    if (deepResearchMode && deepResearchAvailable && workspaceId) {
      const url = `/workspace/${workspaceId}/deep-research?q=${encodeURIComponent(trimmed)}`;
      window.open(url, "_blank");
      setValue("");
      return;
    }
    onSend(trimmed);
    setValue("");
  }, [value, disabled, isStreaming, onSend, deepResearchMode, deepResearchAvailable, workspaceId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const isDisabled = disabled || isStreaming;

  return (
    <div
      className={`flex items-end gap-2 rounded-lg border bg-[var(--background)] px-3 py-2 focus-within:ring-1 focus-within:ring-[var(--ring)] transition-colors ${
        deepResearchMode && deepResearchAvailable
          ? "border-violet-400 dark:border-violet-600"
          : "border-[var(--border)]"
      }`}
    >
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          isDisabled && !isStreaming
            ? "Connect a repository to start…"
            : deepResearchMode && deepResearchAvailable
              ? "Ask a complex question for deep research…"
              : placeholder
        }
        disabled={isDisabled}
        className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-[var(--muted-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
        style={{ minHeight: "1.5rem" }}
      />

      {/* Deep Research toggle — only shown when a repo is connected */}
      {deepResearchAvailable && (
        <button
          type="button"
          onClick={() => setDeepResearchMode((m) => !m)}
          disabled={isDisabled}
          aria-label={deepResearchMode ? "Disable deep research mode" : "Enable deep research mode"}
          title={deepResearchMode ? "Deep Research ON — click to disable" : "Enable Deep Research mode"}
          className={`shrink-0 rounded-md p-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
            deepResearchMode
              ? "text-violet-600 dark:text-violet-400"
              : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 18h8" />
            <path d="M3 22h18" />
            <path d="M14 22a7 7 0 1 0 0-14h-1" />
            <path d="M9 14h2" />
            <path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
            <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
          </svg>
        </button>
      )}

      {/* Send / launch button */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isDisabled || !value.trim()}
        aria-label={deepResearchMode && deepResearchAvailable ? "Start deep research" : "Send"}
        className={`shrink-0 rounded-md p-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
          deepResearchMode && deepResearchAvailable
            ? "text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
            : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        }`}
      >
        {deepResearchMode && deepResearchAvailable ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M16.72 7.72a.75.75 0 0 1 1.06 0l3.75 3.75a.75.75 0 0 1 0 1.06l-3.75 3.75a.75.75 0 1 1-1.06-1.06l2.47-2.47H3a.75.75 0 0 1 0-1.5h16.19l-2.47-2.47a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z" />
          </svg>
        )}
      </button>
    </div>
  );
}
