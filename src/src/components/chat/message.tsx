"use client";

/**
 * Message — renders a single conversation turn (user or assistant).
 *
 * For assistant messages:
 *   - Inline citation references like [file:src/auth.ts:L10-L25] are replaced
 *     with clickable CitationBadge components.
 *   - The surrounding text is rendered as whitespace-preserving prose.
 *
 * For user messages:
 *   - Plain text, right-aligned bubble.
 */

import React from "react";
import { CitationBadge } from "./citation-badge";
import type { Citation } from "@/src/types/domain";

interface MessageProps {
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  onCitationNavigate?: (filePath: string, startLine: number, endLine: number) => void;
}

export function Message({ role, content, citations, onCitationNavigate }: MessageProps) {
  const isAssistant = role === "assistant";

  return (
    <div className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
      <div
        className={[
          "max-w-[88%] rounded-lg px-3 py-2 text-sm leading-relaxed",
          isAssistant
            ? "bg-[var(--muted)] text-[var(--foreground)]"
            : "bg-[var(--primary)] text-[var(--primary-foreground)]",
        ].join(" ")}
      >
        {isAssistant ? (
          <AssistantContent
            content={content}
            citations={citations}
            onCitationNavigate={onCitationNavigate}
          />
        ) : (
          <span className="whitespace-pre-wrap">{content}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal: render assistant content with inline citation badges
// ---------------------------------------------------------------------------

const CITATION_SPLIT_RE = /(\[file:[^\]]+?:L\d+-L\d+\])/g;

function AssistantContent({
  content,
  citations,
  onCitationNavigate,
}: {
  content: string;
  citations: Citation[];
  onCitationNavigate?: (filePath: string, startLine: number, endLine: number) => void;
}) {
  // Build a lookup from raw citation string to Citation domain object
  const citationMap = new Map<string, Citation>();
  for (const c of citations) {
    citationMap.set(`[file:${c.filePath}:L${c.startLine}-L${c.endLine}]`, c);
  }

  // Split the content on citation references and render each part
  const parts = content.split(CITATION_SPLIT_RE);

  return (
    <p className="whitespace-pre-wrap">
      {parts.map((part, i) => {
        const citation = citationMap.get(part);
        if (citation) {
          return (
            <React.Fragment key={i}>
              {" "}
              <CitationBadge
                filePath={citation.filePath}
                startLine={citation.startLine}
                endLine={citation.endLine}
                onNavigate={onCitationNavigate}
              />
              {" "}
            </React.Fragment>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </p>
  );
}
