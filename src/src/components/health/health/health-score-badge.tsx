"use client";

interface HealthScoreBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
}

function getScoreColor(score: number): {
  bg: string;
  text: string;
  border: string;
} {
  if (score > 70) {
    return {
      bg: "bg-green-100 dark:bg-green-900/30",
      text: "text-green-800 dark:text-green-300",
      border: "border-green-200 dark:border-green-700",
    };
  }
  if (score > 40) {
    return {
      bg: "bg-yellow-100 dark:bg-yellow-900/30",
      text: "text-yellow-800 dark:text-yellow-300",
      border: "border-yellow-200 dark:border-yellow-700",
    };
  }
  return {
    bg: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-800 dark:text-red-300",
    border: "border-red-200 dark:border-red-700",
  };
}

const sizeClasses = {
  sm: "text-xs px-1.5 py-0.5 min-w-[2rem]",
  md: "text-sm px-2 py-1 min-w-[2.5rem]",
  lg: "text-base px-3 py-1.5 min-w-[3rem]",
};

export function HealthScoreBadge({ score, size = "md" }: HealthScoreBadgeProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const { bg, text, border } = getScoreColor(clamped);

  return (
    <span
      className={[
        "inline-flex items-center justify-center rounded border font-mono font-semibold tabular-nums",
        bg,
        text,
        border,
        sizeClasses[size],
      ].join(" ")}
      title={`Health score: ${clamped}/100`}
    >
      {clamped}
    </span>
  );
}

export function getScoreColorHex(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  if (clamped > 70) return "#22c55e"; // green-500
  if (clamped > 40) return "#eab308"; // yellow-500
  return "#ef4444"; // red-500
}

export function getScoreColorRgb(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  // Interpolate green→yellow→red
  if (clamped >= 70) {
    // 70-100: green to yellow-green
    const t = (clamped - 70) / 30;
    const r = Math.round(34 + (34 - 34) * t);
    const g = Math.round(197 + (197 - 197) * t);
    const b = Math.round(94 * (1 - (1 - t) * 0.5));
    return `rgb(${r},${g},${b})`;
  }
  if (clamped >= 40) {
    // 40-70: yellow to green
    const t = (clamped - 40) / 30;
    const r = Math.round(239 + (34 - 239) * t);
    const g = Math.round(68 + (197 - 68) * t);
    const b = Math.round(68 + (94 - 68) * t);
    return `rgb(${r},${g},${b})`;
  }
  // 0-40: dark red to red
  const t = clamped / 40;
  const r = Math.round(180 + (239 - 180) * t);
  const g = Math.round(30 + (68 - 30) * t);
  const b = Math.round(30 + (68 - 30) * t);
  return `rgb(${r},${g},${b})`;
}
