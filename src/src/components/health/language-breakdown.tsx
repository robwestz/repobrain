"use client";

interface LanguageEntry {
  language: string;
  fileCount: number;
  lineCount: number;
}

interface LanguageBreakdownProps {
  languages: LanguageEntry[];
}

// Colour palette for languages — deterministic per language name
const LANGUAGE_COLORS: Record<string, string> = {
  typescript: "#3178c6",
  javascript: "#f7df1e",
  python: "#3572a5",
  go: "#00add8",
  rust: "#dea584",
  java: "#b07219",
  cpp: "#f34b7d",
  c: "#555555",
  csharp: "#178600",
  ruby: "#701516",
  php: "#4f5d95",
  swift: "#f05138",
  kotlin: "#a97bff",
  scala: "#c22d40",
  html: "#e34c26",
  css: "#563d7c",
  shell: "#89e051",
  markdown: "#083fa1",
  json: "#292929",
  yaml: "#cb171e",
  toml: "#9c4221",
  unknown: "#8b8b8b",
};

function langColor(language: string): string {
  const key = language.toLowerCase();
  if (LANGUAGE_COLORS[key]) return LANGUAGE_COLORS[key];
  // Generate a deterministic colour from the language name
  let hash = 0;
  for (let i = 0; i < language.length; i++) {
    hash = language.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h},60%,45%)`;
}

export function LanguageBreakdown({ languages }: LanguageBreakdownProps) {
  if (languages.length === 0) {
    return (
      <p className="text-xs text-[var(--muted-foreground)]">No language data available.</p>
    );
  }

  const totalFiles = languages.reduce((sum, l) => sum + l.fileCount, 0);

  // Sort descending by file count
  const sorted = [...languages].sort((a, b) => b.fileCount - a.fileCount);

  return (
    <div className="space-y-2">
      {/* Stacked bar */}
      <div className="flex h-5 w-full overflow-hidden rounded-full">
        {sorted.map((lang) => {
          const pct = (lang.fileCount / totalFiles) * 100;
          const color = langColor(lang.language);
          return (
            <div
              key={lang.language}
              style={{ width: `${pct}%`, backgroundColor: color, minWidth: pct > 0 ? 2 : 0 }}
              title={`${lang.language}: ${lang.fileCount} files (${pct.toFixed(1)}%)`}
              className="transition-all"
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {sorted.map((lang) => {
          const pct = ((lang.fileCount / totalFiles) * 100).toFixed(1);
          const color = langColor(lang.language);
          return (
            <div key={lang.language} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs text-[var(--foreground)]">{lang.language}</span>
              <span className="text-xs text-[var(--muted-foreground)]">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LanguageTable({ languages }: LanguageBreakdownProps) {
  const sorted = [...languages].sort((a, b) => b.fileCount - a.fileCount);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-[var(--muted-foreground)]">
          <th className="pb-1 pr-4 font-medium">Language</th>
          <th className="pb-1 pr-4 font-medium text-right">Files</th>
          <th className="pb-1 font-medium text-right">Lines</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((lang) => {
          const color = langColor(lang.language);
          return (
            <tr key={lang.language} className="border-b border-[var(--border)] last:border-0">
              <td className="py-1 pr-4">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span className="capitalize">{lang.language}</span>
                </div>
              </td>
              <td className="py-1 pr-4 text-right tabular-nums">{lang.fileCount.toLocaleString()}</td>
              <td className="py-1 text-right tabular-nums">{lang.lineCount.toLocaleString()}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
