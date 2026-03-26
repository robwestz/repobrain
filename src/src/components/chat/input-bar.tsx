"use client";

/**
 * InputBar — question input for the chat pane.
 *
 * Features:
 *   - Auto-expanding textarea (single line by default, grows on Enter+Shift)
 *   - Submit on Enter (Shift+Enter inserts newline)
 *   - Respects external prefill via the `prefillValue` prop
 *   - Disables when `disabled` is true (repo not ready or streaming)
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
}

export function InputBar({
  onSend,
  disabled,
  isStreaming,
  placeholder = "Ask about your codebase…",
  prefillValue,
  onPrefillUsed,
}: InputBarProps) {
  const [value, setValue] = useState("");
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
    onSend(trimmed);
    setValue("");
  }, [value, disabled, isStreaming, onSend]);

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
    <div className="flex items-end gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 focus-within:ring-1 focus-within:ring-[var(--ring)]">
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isDisabled && !isStreaming ? "Connect a repository to start…" : placeholder}
        disabled={isDisabled}
        className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-[var(--muted-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
        style={{ minHeight: "1.5rem" }}
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isDisabled || !value.trim()}
        aria-label="Send"
        className="shrink-0 rounded-md p-1 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {/* Paper-plane send icon (inline SVG to avoid extra dependency) */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z" />
        </svg>
      </button>
    </div>
  );
}
