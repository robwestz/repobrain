"use client";

import { MessageSquare } from "lucide-react";

interface AskAboutFileProps {
  filePath: string;
  onAsk: (filePath: string) => void;
}

export function AskAboutFile({ filePath, onAsk }: AskAboutFileProps) {
  const filename = filePath.split("/").pop() ?? filePath;

  return (
    <button
      onClick={() => onAsk(filePath)}
      className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--muted-foreground)] transition-colors hover:border-[var(--ring)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]"
      title={`Ask about ${filePath}`}
    >
      <MessageSquare className="h-3.5 w-3.5" />
      Ask about {filename}
    </button>
  );
}
