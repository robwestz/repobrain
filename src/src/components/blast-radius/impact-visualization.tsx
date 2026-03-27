"use client";

import { useState, useMemo } from "react";
import type { ImpactNode, BlastRadiusResult } from "@/src/modules/blast-radius/analyzer";

interface ImpactVisualizationProps {
  result: BlastRadiusResult;
  workspaceId: string;
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function ringColor(level: ImpactNode["impactLevel"]): string {
  switch (level) {
    case "direct":
      return "#ef4444"; // red-500
    case "indirect":
      return "#f97316"; // orange-500
    case "transitive":
      return "#eab308"; // yellow-500
    default:
      return "#6b7280"; // gray-500
  }
}

function ringFill(level: ImpactNode["impactLevel"]): string {
  switch (level) {
    case "direct":
      return "#fef2f2"; // red-50
    case "indirect":
      return "#fff7ed"; // orange-50
    case "transitive":
      return "#fefce8"; // yellow-50
    default:
      return "#f9fafb"; // gray-50
  }
}

// ---------------------------------------------------------------------------
// SVG Sunburst (concentric arcs)
// ---------------------------------------------------------------------------

interface ArcSegment {
  node: ImpactNode;
  startAngle: number;
  endAngle: number;
  depth: number;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
  innerR: number,
): string {
  // Clamp to avoid degenerate arcs
  const sweep = Math.min(endAngle - startAngle, 359.99);
  const outerStart = polarToCartesian(cx, cy, r, startAngle);
  const outerEnd = polarToCartesian(cx, cy, r, startAngle + sweep);
  const innerStart = polarToCartesian(cx, cy, innerR, startAngle + sweep);
  const innerEnd = polarToCartesian(cx, cy, innerR, startAngle);
  const largeArc = sweep > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y}`,
    "Z",
  ].join(" ");
}

export function ImpactVisualization({
  result,
  workspaceId,
}: ImpactVisualizationProps) {
  const [hoveredNode, setHoveredNode] = useState<ImpactNode | null>(null);

  const { impactedNodes, source } = result;

  const SIZE = 480;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const CENTER_R = 52;
  const RING_WIDTH = 58;
  const GAP = 4;

  // Group nodes by depth
  const byDepth = useMemo(() => {
    const map = new Map<number, ImpactNode[]>();
    for (const node of impactedNodes) {
      const arr = map.get(node.depth) ?? [];
      arr.push(node);
      map.set(node.depth, arr);
    }
    return map;
  }, [impactedNodes]);

  const maxDepth = useMemo(() => {
    if (byDepth.size === 0) return 0;
    return Math.max(...byDepth.keys());
  }, [byDepth]);

  // Build arc segments for each ring
  const segments = useMemo<ArcSegment[]>(() => {
    const result: ArcSegment[] = [];
    for (let depth = 1; depth <= maxDepth; depth++) {
      const nodes = byDepth.get(depth) ?? [];
      if (nodes.length === 0) continue;
      // Sort by risk score descending for visual consistency
      const sorted = [...nodes].sort((a, b) => b.riskScore - a.riskScore);
      const totalRisk = sorted.reduce((s, n) => s + n.riskScore, 0);
      let angle = 0;
      for (const node of sorted) {
        const sweep = totalRisk > 0 ? (node.riskScore / totalRisk) * 360 : 360 / sorted.length;
        result.push({
          node,
          startAngle: angle,
          endAngle: angle + sweep,
          depth,
        });
        angle += sweep;
      }
    }
    return result;
  }, [byDepth, maxDepth]);

  function handleNavigate(node: ImpactNode) {
    const encoded = node.filePath
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    window.location.href = `/workspace/${workspaceId}?file=${encoded}&line=${node.startLine}`;
  }

  if (impactedNodes.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--muted-foreground)]">
        No downstream dependents found. This symbol is not used by other symbols in the indexed
        codebase.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-[var(--muted-foreground)]">
        {(["direct", "indirect", "transitive"] as const).map((level) => (
          <div key={level} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: ringColor(level) }}
            />
            <span className="capitalize">{level}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px]">Segment size = risk score</span>
        </div>
      </div>

      {/* SVG sunburst */}
      <div className="relative">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="overflow-visible"
        >
          {/* Rings */}
          {segments.map((seg, i) => {
            const outerR = CENTER_R + seg.depth * RING_WIDTH - GAP / 2;
            const innerR = CENTER_R + (seg.depth - 1) * RING_WIDTH + GAP / 2;
            const d = describeArc(CX, CY, outerR, seg.startAngle, seg.endAngle, innerR);
            const color = ringColor(seg.node.impactLevel);
            const isHovered = hoveredNode?.symbolId === seg.node.symbolId;

            return (
              <path
                key={`${seg.node.symbolId}-${i}`}
                d={d}
                fill={isHovered ? color : ringFill(seg.node.impactLevel)}
                stroke={color}
                strokeWidth={isHovered ? 2 : 1}
                className="cursor-pointer transition-all"
                style={{ opacity: isHovered ? 1 : 0.75 }}
                onMouseEnter={() => setHoveredNode(seg.node)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => handleNavigate(seg.node)}
              />
            );
          })}

          {/* Center circle */}
          <circle cx={CX} cy={CY} r={CENTER_R - 2} fill="#dc2626" />
          <text
            x={CX}
            y={CY - 8}
            textAnchor="middle"
            fill="white"
            fontSize={10}
            fontWeight="600"
            fontFamily="monospace"
          >
            {source.symbolName.length > 10
              ? source.symbolName.slice(0, 9) + "…"
              : source.symbolName}
          </text>
          <text
            x={CX}
            y={CY + 6}
            textAnchor="middle"
            fill="rgba(255,255,255,0.75)"
            fontSize={8}
            fontFamily="monospace"
          >
            {source.symbolKind}
          </text>

          {/* Ring depth labels */}
          {Array.from({ length: maxDepth }, (_, i) => i + 1).map((depth) => {
            const level = depth === 1 ? "direct" : depth === 2 ? "indirect" : "transitive";
            const labelR = CENTER_R + depth * RING_WIDTH - RING_WIDTH / 2;
            const pos = polarToCartesian(CX, CY, labelR, -90);
            return (
              <text
                key={depth}
                x={pos.x}
                y={pos.y + 3}
                textAnchor="middle"
                fill={ringColor(level as ImpactNode["impactLevel"])}
                fontSize={8}
                fontWeight="500"
                opacity={0.8}
              >
                {level}
              </text>
            );
          })}
        </svg>

        {/* Hover tooltip */}
        {hoveredNode && (
          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-2 z-10 max-w-xs rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 shadow-xl text-xs">
            <div className="font-semibold text-sm font-mono">{hoveredNode.symbolName}</div>
            <div className="mt-0.5 text-[var(--muted-foreground)] capitalize">
              {hoveredNode.symbolKind} &bull; {hoveredNode.impactLevel}
            </div>
            <div
              className="mt-1 truncate text-[var(--muted-foreground)]"
              title={hoveredNode.filePath}
            >
              {hoveredNode.filePath.split("/").slice(-2).join("/")}:{hoveredNode.startLine}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="font-medium">Risk:</span>
              <span
                className="font-bold"
                style={{ color: hoveredNode.riskScore >= 70 ? "#ef4444" : hoveredNode.riskScore >= 50 ? "#f97316" : "#eab308" }}
              >
                {hoveredNode.riskScore}/100
              </span>
            </div>
            <div className="mt-1 text-[var(--muted-foreground)]">
              via: {hoveredNode.relationPath.join(" → ")}
            </div>
            <div className="mt-1.5 text-[10px] text-[var(--muted-foreground)]">Click to view in code</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flat treemap fallback (file-level view)
// ---------------------------------------------------------------------------

interface FileHeatmapProps {
  result: BlastRadiusResult;
  workspaceId: string;
}

export function FileHeatmap({ result, workspaceId }: FileHeatmapProps) {
  const { impactedFiles, impactedNodes } = result;

  function riskBg(maxRisk: number): string {
    if (maxRisk >= 70) return "bg-red-100 dark:bg-red-950/40 border-red-300 dark:border-red-800";
    if (maxRisk >= 50)
      return "bg-orange-100 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800";
    return "bg-yellow-100 dark:bg-yellow-950/40 border-yellow-300 dark:border-yellow-800";
  }

  function riskLabel(maxRisk: number): string {
    if (maxRisk >= 70) return "High";
    if (maxRisk >= 50) return "Medium";
    return "Low";
  }

  function riskLabelColor(maxRisk: number): string {
    if (maxRisk >= 70) return "text-red-600 dark:text-red-400";
    if (maxRisk >= 50) return "text-orange-600 dark:text-orange-400";
    return "text-yellow-600 dark:text-yellow-400";
  }

  const sorted = [...impactedFiles].sort((a, b) => b.maxRisk - a.maxRisk);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((file) => {
        const fileNodes = impactedNodes.filter((n) => n.filePath === file.filePath);
        const shortPath =
          file.filePath.split("/").length > 3
            ? "…/" + file.filePath.split("/").slice(-2).join("/")
            : file.filePath;

        return (
          <a
            key={file.filePath}
            href={`/workspace/${workspaceId}?file=${file.filePath.split("/").map(encodeURIComponent).join("/")}`}
            className={`group block rounded-lg border p-3 transition-all hover:shadow-md ${riskBg(file.maxRisk)}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div
                className="truncate font-mono text-xs font-medium"
                title={file.filePath}
              >
                {shortPath}
              </div>
              <span
                className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide ${riskLabelColor(file.maxRisk)}`}
              >
                {riskLabel(file.maxRisk)}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--muted-foreground)]">
              <span>{file.nodeCount} symbol{file.nodeCount !== 1 ? "s" : ""}</span>
              <span>max risk {file.maxRisk}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {fileNodes.slice(0, 4).map((node) => (
                <span
                  key={node.symbolId}
                  className="rounded bg-white/50 dark:bg-black/20 px-1.5 py-0.5 font-mono text-[10px]"
                >
                  {node.symbolName}
                </span>
              ))}
              {fileNodes.length > 4 && (
                <span className="rounded px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                  +{fileNodes.length - 4} more
                </span>
              )}
            </div>
          </a>
        );
      })}
    </div>
  );
}
