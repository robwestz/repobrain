"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { OnboardingPath } from "@/src/modules/onboarding/path-generator";
import { ProgressTracker } from "./progress-tracker";
import { StepCard } from "./step-card";

const ROLES = [
  { value: "full-stack developer", label: "Full-stack Developer" },
  { value: "frontend developer", label: "Frontend Developer" },
  { value: "backend developer", label: "Backend Developer" },
  { value: "devops / infrastructure", label: "DevOps / Infrastructure" },
  { value: "new team member (general)", label: "New Team Member (General)" },
] as const;

interface OnboardingViewProps {
  workspaceId: string;
  repoId: string;
  repoName: string;
}

export function OnboardingView({ workspaceId, repoId, repoName }: OnboardingViewProps) {
  const router = useRouter();

  // Generation state
  const [selectedRole, setSelectedRole] = useState<string>(ROLES[0].value);
  const [path, setPath] = useState<OnboardingPath | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Progress state
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [isSavingProgress, setIsSavingProgress] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  // ---------------------------------------------------------------------------
  // Load saved progress on mount (if we have a path)
  // ---------------------------------------------------------------------------

  const loadProgress = useCallback(
    async (role: string) => {
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/repos/${repoId}/onboarding/progress?role=${encodeURIComponent(role)}`,
        );
        if (!res.ok) return;
        const rows: {
          currentStep: number;
          completedSteps: number[];
        }[] = await res.json();
        if (rows.length > 0) {
          setCurrentStep(rows[0].currentStep);
          setCompletedSteps(rows[0].completedSteps ?? []);
        }
      } catch {
        // Non-fatal — start fresh
      }
    },
    [workspaceId, repoId],
  );

  // ---------------------------------------------------------------------------
  // Save progress to API
  // ---------------------------------------------------------------------------

  const saveProgress = useCallback(
    async (role: string, step: number, completed: number[]) => {
      setIsSavingProgress(true);
      try {
        await fetch(
          `/api/workspaces/${workspaceId}/repos/${repoId}/onboarding/progress`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role,
              currentStep: step,
              completedSteps: completed,
            }),
          },
        );
      } catch {
        // Non-fatal
      } finally {
        setIsSavingProgress(false);
      }
    },
    [workspaceId, repoId],
  );

  // ---------------------------------------------------------------------------
  // Generate path
  // ---------------------------------------------------------------------------

  async function handleGenerate() {
    setGenerateError(null);
    setIsGenerating(true);
    setPath(null);
    setCompletedSteps([]);
    setCurrentStep(1);
    setIsFinished(false);

    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/repos/${repoId}/onboarding/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: selectedRole }),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to generate onboarding path");
      }

      const generatedPath: OnboardingPath = await res.json();
      setPath(generatedPath);

      // Load saved progress for this role
      await loadProgress(selectedRole);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setIsGenerating(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Step navigation
  // ---------------------------------------------------------------------------

  function handleSelectStep(stepOrder: number) {
    setCurrentStep(stepOrder);
  }

  function handlePreviousStep() {
    if (!path) return;
    const prevOrder = currentStep - 1;
    if (prevOrder >= 1) {
      setCurrentStep(prevOrder);
      saveProgress(selectedRole, prevOrder, completedSteps);
    }
  }

  function handleCompleteStep() {
    if (!path) return;

    const newCompleted = completedSteps.includes(currentStep)
      ? completedSteps
      : [...completedSteps, currentStep];

    const isLast = currentStep >= path.totalSteps;

    if (isLast) {
      setCompletedSteps(newCompleted);
      setIsFinished(true);
      saveProgress(selectedRole, currentStep, newCompleted);
    } else {
      const nextStep = currentStep + 1;
      setCompletedSteps(newCompleted);
      setCurrentStep(nextStep);
      saveProgress(selectedRole, nextStep, newCompleted);
    }
  }

  // When path changes, set active step to current saved step
  useEffect(() => {
    if (!path) return;
    // currentStep is already set from loadProgress
  }, [path]);

  // ---------------------------------------------------------------------------
  // Active step data
  // ---------------------------------------------------------------------------

  const activeStep = path?.steps.find((s) => s.order === currentStep) ?? path?.steps[0];

  // ---------------------------------------------------------------------------
  // Render: Completion state
  // ---------------------------------------------------------------------------

  if (isFinished && path) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
        <div className="max-w-lg">
          <div className="text-5xl mb-4">&#127891;</div>
          <h2 className="text-2xl font-semibold mb-2">Onboarding Complete!</h2>
          <p className="text-[var(--muted-foreground)] mb-6">
            You&apos;ve completed the <strong>{path.title}</strong> learning path as a{" "}
            <strong>{path.role}</strong>.
          </p>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] px-6 py-4 text-left mb-6">
            <h3 className="font-semibold mb-3">What you covered:</h3>
            <ul className="list-disc list-inside space-y-1">
              {path.steps.map((step) => (
                <li key={step.order} className="text-sm text-[var(--muted-foreground)]">
                  {step.title}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-3 justify-center">
            <button
              onClick={() => router.push(`/workspace/${workspaceId}`)}
              className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-[var(--primary-foreground)] transition-colors hover:opacity-90"
            >
              Start exploring on your own &rarr;
            </button>
            <button
              onClick={() => {
                setPath(null);
                setIsFinished(false);
                setCompletedSteps([]);
                setCurrentStep(1);
              }}
              className="rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm transition-colors hover:bg-[var(--accent)]"
            >
              Start a new path
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Path generated state
  // ---------------------------------------------------------------------------

  if (path && !isGenerating) {
    return (
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar: step list */}
        <div className="w-64 shrink-0 border-r overflow-hidden flex flex-col">
          <ProgressTracker
            steps={path.steps}
            currentStep={currentStep}
            completedSteps={completedSteps}
            totalEstimatedMinutes={path.estimatedTotalMinutes}
            onSelectStep={handleSelectStep}
          />
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-8">
            {/* Path title + overview (shown above step 1 only) */}
            {currentStep === 1 && (
              <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--muted)] px-5 py-4">
                <h1 className="text-lg font-semibold mb-1">{path.title}</h1>
                <p className="text-sm text-[var(--muted-foreground)]">{path.overview}</p>
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                  Role: <strong>{path.role}</strong> &middot; {path.totalSteps} steps &middot; ~
                  {path.estimatedTotalMinutes} min
                </p>
              </div>
            )}

            {/* Active step card */}
            {activeStep ? (
              <StepCard
                step={activeStep}
                workspaceId={workspaceId}
                isCompleted={completedSteps.includes(activeStep.order)}
                isFirst={activeStep.order === 1}
                isLast={activeStep.order === path.totalSteps}
                onPrevious={handlePreviousStep}
                onComplete={handleCompleteStep}
              />
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">No steps found.</p>
            )}

            {isSavingProgress && (
              <p className="mt-4 text-xs text-[var(--muted-foreground)] text-right">
                Saving progress...
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Initial / role-selection state
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8">
      <div className="w-full max-w-lg">
        {/* Welcome header */}
        <div className="mb-8 text-center">
          <div className="text-4xl mb-3">&#127891;</div>
          <h1 className="text-2xl font-semibold mb-2">
            Let&apos;s get you familiar with{" "}
            <span className="text-blue-600 dark:text-blue-400">{repoName}</span>
          </h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Our AI will generate a personalized learning path tailored to your role, so you can
            understand this codebase quickly and confidently.
          </p>
        </div>

        {/* Role selector */}
        <div className="mb-6">
          <p className="mb-3 text-sm font-medium">I am a...</p>
          <div className="flex flex-col gap-2">
            {ROLES.map((role) => (
              <button
                key={role.value}
                onClick={() => setSelectedRole(role.value)}
                className={[
                  "flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                  selectedRole === role.value
                    ? "border-[var(--primary)] bg-[var(--accent)]"
                    : "border-[var(--border)] hover:bg-[var(--accent)]",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span
                  className={[
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                    selectedRole === role.value
                      ? "border-[var(--primary)] bg-[var(--primary)]"
                      : "border-[var(--muted-foreground)]",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {selectedRole === role.value && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary-foreground)]" />
                  )}
                </span>
                {role.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error message */}
        {generateError && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {generateError}
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full rounded-lg bg-[var(--primary)] px-5 py-3 text-sm font-medium text-[var(--primary-foreground)] transition-colors hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--primary-foreground)] border-t-transparent" />
              Generating your learning path...
            </span>
          ) : (
            "Generate my learning path"
          )}
        </button>

        {isGenerating && (
          <p className="mt-3 text-center text-xs text-[var(--muted-foreground)]">
            Our AI is analyzing the codebase structure. This usually takes 10–30 seconds.
          </p>
        )}
      </div>
    </div>
  );
}
