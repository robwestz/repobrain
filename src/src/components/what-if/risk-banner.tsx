"use client";

import type { RiskLevel, EffortLevel } from "@/src/modules/what-if/simulator";

interface RiskBannerProps {
  riskAssessment: RiskLevel;
  riskExplanation: string;
  estimatedEffort: EffortLevel;
}

const RISK_CONFIG: Record<
  RiskLevel,
  { bg: string; border: string; text: string; label: string; icon: string }
> = {
  low: {
    bg: "bg-green-950/40",
    border: "border-green-700",
    text: "text-green-300",
    label: "LOW RISK",
    icon: "✓",
  },
  medium: {
    bg: "bg-yellow-950/40",
    border: "border-yellow-600",
    text: "text-yellow-300",
    label: "MEDIUM RISK",
    icon: "⚠",
  },
  high: {
    bg: "bg-orange-950/40",
    border: "border-orange-600",
    text: "text-orange-300",
    label: "HIGH RISK",
    icon: "⚠",
  },
  critical: {
    bg: "bg-red-950/40",
    border: "border-red-600",
    text: "text-red-300",
    label: "CRITICAL RISK",
    icon: "✕",
  },
};

const EFFORT_LABELS: Record<EffortLevel, string> = {
  trivial: "Trivial",
  small: "Small",
  medium: "Medium",
  large: "Large",
  epic: "Epic",
};

const EFFORT_COLORS: Record<EffortLevel, string> = {
  trivial: "bg-slate-700 text-slate-200",
  small: "bg-blue-900 text-blue-200",
  medium: "bg-yellow-900 text-yellow-200",
  large: "bg-orange-900 text-orange-200",
  epic: "bg-red-900 text-red-200",
};

export function RiskBanner({
  riskAssessment,
  riskExplanation,
  estimatedEffort,
}: RiskBannerProps) {
  const config = RISK_CONFIG[riskAssessment];

  return (
    <div
      className={`flex items-start gap-4 rounded-lg border px-5 py-4 ${config.bg} ${config.border}`}
    >
      {/* Icon */}
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-lg font-bold ${config.border} ${config.text}`}
      >
        {config.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`text-sm font-bold tracking-wider ${config.text}`}>
            {config.label}
          </span>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${EFFORT_COLORS[estimatedEffort]}`}
          >
            Effort: {EFFORT_LABELS[estimatedEffort]}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-300">{riskExplanation}</p>
      </div>
    </div>
  );
}
