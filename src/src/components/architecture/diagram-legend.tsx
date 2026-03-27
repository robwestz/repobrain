"use client";

import type { DiagramType } from "@/src/modules/architecture/diagram-generator";

interface LegendItem {
  color: string;
  label: string;
  shape: "rect" | "circle" | "diamond" | "cylinder";
}

const LEGENDS: Record<DiagramType, LegendItem[]> = {
  "module-dependency": [
    { color: "bg-blue-500/20 border-blue-500/50", label: "Module", shape: "rect" },
    { color: "bg-cyan-500/20 border-cyan-500/50", label: "Database", shape: "cylinder" },
    { color: "bg-slate-400/30 border-slate-400/50", label: "Thick arrow = many deps", shape: "rect" },
  ],
  component: [
    { color: "bg-violet-500/20 border-violet-500/50", label: "Class", shape: "rect" },
    { color: "bg-indigo-500/20 border-indigo-500/50", label: "Interface", shape: "rect" },
    { color: "bg-purple-500/20 border-purple-500/50", label: "Type", shape: "rect" },
  ],
  "data-flow": [
    { color: "bg-green-500/20 border-green-500/50", label: "API Route", shape: "rect" },
    { color: "bg-blue-500/20 border-blue-500/50", label: "Service/Module", shape: "rect" },
    { color: "bg-cyan-500/20 border-cyan-500/50", label: "Database", shape: "cylinder" },
  ],
  "class-hierarchy": [
    { color: "bg-amber-500/20 border-amber-500/50", label: "Class", shape: "rect" },
    { color: "bg-teal-500/20 border-teal-500/50", label: "Interface", shape: "rect" },
    { color: "bg-slate-400/20 border-slate-400/50", label: "──|> extends", shape: "rect" },
    { color: "bg-slate-400/20 border-slate-400/50", label: "- -|> implements", shape: "rect" },
  ],
};

interface DiagramLegendProps {
  diagramType: DiagramType;
}

export function DiagramLegend({ diagramType }: DiagramLegendProps) {
  const items = LEGENDS[diagramType] ?? [];

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)]">
      <span className="font-medium text-[var(--foreground)]">Legend:</span>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span
            className={`inline-block h-3 w-5 rounded border ${item.color} ${
              item.shape === "cylinder" ? "rounded-full w-3" : ""
            }`}
          />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
