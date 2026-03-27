"use client";

import type { OnboardingStep } from "@/src/modules/onboarding/path-generator";

interface ProgressTrackerProps {
  steps: OnboardingStep[];
  currentStep: number;
  completedSteps: number[];
  totalEstimatedMinutes: number;
  onSelectStep: (stepOrder: number) => void;
}

export function ProgressTracker({
  steps,
  currentStep,
  completedSteps,
  totalEstimatedMinutes,
  onSelectStep,
}: ProgressTrackerProps) {
  const completedCount = completedSteps.length;
  const progressPct = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b px-4 py-3">
        <p className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
          Progress
        </p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          {completedCount}/{steps.length} steps &middot; ~{totalEstimatedMinutes} min total
        </p>
        {/* Progress bar */}
        <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--muted)]">
          <div
            className="h-1.5 rounded-full bg-green-500 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="mt-1 text-right text-xs text-[var(--muted-foreground)]">{progressPct}%</p>
      </div>

      {/* Step list */}
      <nav className="flex-1 overflow-y-auto py-2">
        {steps.map((step) => {
          const isCompleted = completedSteps.includes(step.order);
          const isCurrent = step.order === currentStep && !isCompleted;
          const isActive = step.order === currentStep;

          return (
            <button
              key={step.order}
              onClick={() => onSelectStep(step.order)}
              className={[
                "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--accent)]",
                isActive ? "bg-[var(--accent)]" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {/* Step indicator */}
              <div className="mt-0.5 shrink-0">
                {isCompleted ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white text-xs">
                    &#10003;
                  </span>
                ) : isCurrent ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium">
                    {step.order}
                  </span>
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                    {step.order}
                  </span>
                )}
              </div>

              {/* Step info */}
              <div className="min-w-0 flex-1">
                <p
                  className={[
                    "truncate text-sm font-medium",
                    isCompleted ? "text-[var(--muted-foreground)] line-through" : "",
                    isActive && !isCompleted ? "text-[var(--foreground)]" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {step.title}
                </p>
                <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                  ~{step.estimatedMinutes} min
                </p>
              </div>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
