"use client";

import { useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { RiskBanner } from "./risk-banner";
import { BreakCard } from "./break-card";
import type { WhatIfResult, AffectedItem } from "@/src/modules/what-if/simulator";

interface WhatIfViewProps {
  workspaceId: string;
  repoId: string;
  repoName: string;
}

type LoadingPhase = "idle" | "parsing" | "analyzing" | "consulting" | "done" | "error";

const EXAMPLE_PROMPTS = [
  "What if I remove the authentication middleware?",
  "What if I split the database module into separate read and write services?",
  "What if I replace the current ORM with raw SQL queries?",
  "What if I merge the user and profile modules?",
  "What if I rename the main service class?",
];

const SEVERITY_COLORS: Record<string, string> = {
  break: "bg-red-900 text-red-200",
  warning: "bg-yellow-900 text-yellow-200",
  info: "bg-blue-900 text-blue-200",
};

const CHANGE_TYPE_LABELS: Record<string, string> = {
  remove: "Remove",
  modify: "Modify",
  add: "Add",
  split: "Split",
  merge: "Merge",
  move: "Move",
  replace: "Replace",
};

function AffectedRow({ item }: { item: AffectedItem }) {
  const filename = item.filePath.split("/").pop() ?? item.filePath;
  return (
    <tr className="border-t border-slate-700 hover:bg-slate-800/50">
      <td className="px-3 py-2 font-mono text-xs text-slate-400" title={item.filePath}>
        {filename}
      </td>
      <td className="px-3 py-2 text-xs text-slate-300">
        {item.symbolName ?? <span className="italic text-slate-500">file-level</span>}
      </td>
      <td className="px-3 py-2 text-xs text-slate-400">{item.impact}</td>
      <td className="px-3 py-2">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SEVERITY_COLORS[item.severity] ?? "bg-slate-700 text-slate-300"}`}
        >
          {item.severity}
        </span>
      </td>
    </tr>
  );
}

export function WhatIfView({ workspaceId, repoId, repoName }: WhatIfViewProps) {
  const searchParams = useSearchParams();
  const [description, setDescription] = useState(searchParams.get("prefill") ?? "");
  const [phase, setPhase] = useState<LoadingPhase>("idle");
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [showAllDirect, setShowAllDirect] = useState(false);
  const [showAllIndirect, setShowAllIndirect] = useState(false);
  const [showBreaks, setShowBreaks] = useState(true);
  const [showDirect, setShowDirect] = useState(true);

  const handleAnalyze = useCallback(async () => {
    if (!description.trim()) return;
    setResult(null);
    setErrorMessage("");
    setShowAllDirect(false);
    setShowAllIndirect(false);

    // Three-phase loading animation
    setPhase("parsing");
    await new Promise((r) => setTimeout(r, 600));
    setPhase("analyzing");
    await new Promise((r) => setTimeout(r, 800));
    setPhase("consulting");

    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/repos/${repoId}/what-if`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: description.trim() }),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }

      const data: WhatIfResult = await res.json();
      setResult(data);
      setPhase("done");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Analysis failed");
      setPhase("error");
    }
  }, [description, workspaceId, repoId]);

  const handleReset = useCallback(() => {
    setDescription("");
    setResult(null);
    setPhase("idle");
    setErrorMessage("");
  }, []);

  const isLoading = phase === "parsing" || phase === "analyzing" || phase === "consulting";

  const phaseLabel =
    phase === "parsing"
      ? "Parsing intent..."
      : phase === "analyzing"
      ? "Analyzing dependencies..."
      : phase === "consulting"
      ? "Consulting AI..."
      : "";

  return (
    <div className="flex h-full flex-col overflow-auto bg-slate-900 text-slate-100">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-slate-700 px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">What If Sandbox</h1>
          <p className="text-xs text-slate-400 mt-0.5">{repoName}</p>
        </div>
        <a
          href={`/workspace/${workspaceId}`}
          className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-400 transition-colors"
        >
          ← Back to workspace
        </a>
      </header>

      <div className="flex-1 overflow-auto px-6 py-6 space-y-6">
        {/* Input section */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">
            Describe a change you&apos;re considering
          </h2>

          <textarea
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 resize-none focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
            placeholder="e.g. What if I remove the rate limiter from the auth module? What if I split the retrieval module into two services?"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleAnalyze();
              }
            }}
          />

          {/* Example prompts */}
          <div className="mt-3">
            <p className="mb-2 text-xs text-slate-500">Try an example:</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => setDescription(prompt)}
                  disabled={isLoading}
                  className="rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-400 hover:border-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40"
                >
                  {prompt.replace("What if I ", "").replace("?", "")}
                </button>
              ))}
            </div>
          </div>

          {/* Analyze button */}
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleAnalyze}
              disabled={isLoading || !description.trim()}
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  {phaseLabel}
                </span>
              ) : (
                "Analyze Impact"
              )}
            </button>
            <span className="text-xs text-slate-500">Cmd+Enter to run</span>
          </div>
        </div>

        {/* Error state */}
        {phase === "error" && (
          <div className="rounded-lg border border-red-800 bg-red-950/30 p-4">
            <p className="text-sm text-red-300">{errorMessage}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-5">
            {/* Risk banner */}
            <RiskBanner
              riskAssessment={result.riskAssessment}
              riskExplanation={result.riskExplanation}
              estimatedEffort={result.estimatedEffort}
            />

            {/* Parsed intent badge */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500">Detected change:</span>
              <span className="rounded bg-slate-700 px-2 py-0.5 text-slate-200 font-medium">
                {CHANGE_TYPE_LABELS[result.parsedIntent.changeType] ?? result.parsedIntent.changeType}
              </span>
              {result.parsedIntent.targetSymbols.slice(0, 5).map((s) => (
                <span key={s} className="rounded bg-blue-900/50 border border-blue-700 px-2 py-0.5 text-blue-300">
                  {s}
                </span>
              ))}
              {result.parsedIntent.targetModules.slice(0, 3).map((m) => (
                <span key={m} className="rounded bg-purple-900/50 border border-purple-700 px-2 py-0.5 text-purple-300">
                  {m} (module)
                </span>
              ))}
            </div>

            {/* Executive summary */}
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-5">
              <h3 className="mb-2 text-sm font-semibold text-slate-200">Executive Summary</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{result.summary}</p>
            </div>

            {/* Three-column metrics */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 text-center">
                <div className="text-3xl font-bold text-slate-100">
                  {result.directlyAffected.length}
                </div>
                <div className="mt-1 text-xs text-slate-400">Direct Impacts</div>
              </div>
              <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-center">
                <div className="text-3xl font-bold text-red-300">
                  {result.potentialBreaks.length}
                </div>
                <div className="mt-1 text-xs text-slate-400">Potential Breaks</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 text-center">
                <div className="text-3xl font-bold text-slate-100">
                  {result.sideEffects.length}
                </div>
                <div className="mt-1 text-xs text-slate-400">Side Effects</div>
              </div>
            </div>

            {/* Section 1: Potential Breaks */}
            {result.potentialBreaks.length > 0 && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden">
                <button
                  onClick={() => setShowBreaks((v) => !v)}
                  className="flex w-full items-center justify-between px-5 py-4 hover:bg-slate-700/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-200">Potential Breaks</span>
                    <span className="rounded bg-red-900 px-2 py-0.5 text-xs font-medium text-red-200">
                      {result.potentialBreaks.length}
                    </span>
                  </div>
                  <span className="text-slate-500 text-sm">{showBreaks ? "▲" : "▼"}</span>
                </button>

                {showBreaks && (
                  <div className="border-t border-slate-700 p-4 space-y-3">
                    {result.potentialBreaks.map((b, i) => (
                      <BreakCard
                        key={`${b.filePath}-${b.symbolName}-${i}`}
                        breakItem={b}
                        workspaceId={workspaceId}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Section 2: Directly Affected */}
            {result.directlyAffected.length > 0 && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden">
                <button
                  onClick={() => setShowDirect((v) => !v)}
                  className="flex w-full items-center justify-between px-5 py-4 hover:bg-slate-700/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-200">Directly Affected</span>
                    <span className="rounded bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-200">
                      {result.directlyAffected.length}
                    </span>
                  </div>
                  <span className="text-slate-500 text-sm">{showDirect ? "▲" : "▼"}</span>
                </button>

                {showDirect && (
                  <div className="border-t border-slate-700 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700 bg-slate-800/70">
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">File</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Symbol</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Impact</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Severity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(showAllDirect
                          ? result.directlyAffected
                          : result.directlyAffected.slice(0, 10)
                        ).map((item, i) => (
                          <AffectedRow key={`${item.filePath}-${item.symbolName}-${i}`} item={item} />
                        ))}
                      </tbody>
                    </table>
                    {result.directlyAffected.length > 10 && (
                      <div className="border-t border-slate-700 px-3 py-2 text-center">
                        <button
                          onClick={() => setShowAllDirect((v) => !v)}
                          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          {showAllDirect
                            ? "Show fewer"
                            : `Show ${result.directlyAffected.length - 10} more`}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Section 3: Indirectly Affected */}
            {result.indirectlyAffected.length > 0 && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-200">Indirectly Affected</span>
                    <span className="rounded bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-400">
                      {result.indirectlyAffected.length}
                    </span>
                  </div>
                </div>
                <div className="border-t border-slate-700 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 bg-slate-800/70">
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">File</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Symbol</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Impact</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Severity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(showAllIndirect
                        ? result.indirectlyAffected
                        : result.indirectlyAffected.slice(0, 8)
                      ).map((item, i) => (
                        <AffectedRow key={`${item.filePath}-${item.symbolName}-${i}`} item={item} />
                      ))}
                    </tbody>
                  </table>
                  {result.indirectlyAffected.length > 8 && (
                    <div className="border-t border-slate-700 px-3 py-2 text-center">
                      <button
                        onClick={() => setShowAllIndirect((v) => !v)}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        {showAllIndirect
                          ? "Show fewer"
                          : `Show ${result.indirectlyAffected.length - 8} more`}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Section 4: AI Recommendations */}
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-5 space-y-4">
              <h3 className="font-semibold text-sm text-slate-200">Recommendations</h3>

              {result.recommendations.length > 0 && (
                <ol className="space-y-2">
                  {result.recommendations.map((rec, i) => (
                    <li key={i} className="flex gap-3 text-sm text-slate-300">
                      <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-blue-900 text-xs font-bold text-blue-200">
                        {i + 1}
                      </span>
                      {rec}
                    </li>
                  ))}
                </ol>
              )}

              {result.prerequisiteChanges.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold text-amber-400 uppercase tracking-wide">
                    Prerequisite Changes
                  </h4>
                  <ul className="space-y-1">
                    {result.prerequisiteChanges.map((p, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className="shrink-0 mt-0.5 text-amber-400">→</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.sideEffects.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold text-orange-400 uppercase tracking-wide">
                    Potential Side Effects
                  </h4>
                  <ul className="space-y-1">
                    {result.sideEffects.map((se, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className="shrink-0 mt-0.5 text-orange-400">•</span>
                        {se}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 pb-4">
              {result.directlyAffected.length > 0 && (
                <a
                  href={`/workspace/${workspaceId}`}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:text-slate-100 hover:border-slate-400 transition-colors"
                >
                  Open code viewer
                </a>
              )}
              <button
                onClick={handleReset}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:text-slate-100 hover:border-slate-400 transition-colors"
              >
                Re-analyze with different description
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {phase === "idle" && !result && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">💡</div>
            <h2 className="text-lg font-semibold text-slate-300">
              Explore the impact before you code
            </h2>
            <p className="mt-2 max-w-md text-sm text-slate-500">
              Describe any change you&apos;re considering — removing a function, splitting a module,
              replacing a library — and AI + graph analysis will predict what breaks.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
