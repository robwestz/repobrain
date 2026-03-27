"use client";

import type { EnrichedEndpoint } from "@/src/modules/api-map/analyzer";

interface EndpointDetailProps {
  endpoint: EnrichedEndpoint;
  workspaceId: string;
  allEndpoints: EnrichedEndpoint[];
  onSelectEndpoint: (endpoint: EnrichedEndpoint) => void;
}

const METHOD_STYLES: Record<string, string> = {
  GET: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  POST: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  PUT: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-800",
  PATCH: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800",
  DELETE: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800",
  ALL: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800",
};

const FRAMEWORK_LABELS: Record<string, string> = {
  "nextjs-app-router": "Next.js App Router",
  "nextjs-pages": "Next.js Pages API",
  express: "Express",
  koa: "Koa",
  fastapi: "FastAPI",
  flask: "Flask",
  unknown: "Unknown",
};

const LOCATION_COLORS: Record<string, string> = {
  path: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  query: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  body: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  header: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

export function EndpointDetail({
  endpoint,
  workspaceId,
  allEndpoints,
  onSelectEndpoint,
}: EndpointDetailProps) {
  const methodStyle = METHOD_STYLES[endpoint.method] ?? METHOD_STYLES.ALL;
  const frameworkLabel = FRAMEWORK_LABELS[endpoint.framework] ?? endpoint.framework;
  const relatedEndpoints = allEndpoints.filter((e) =>
    endpoint.relatedEndpointIds.includes(e.id),
  );

  // Build code viewer URL
  const encodedPath = endpoint.filePath
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const codeViewerUrl = `/workspace/${workspaceId}?file=${encodedPath}&line=${endpoint.startLine}`;

  return (
    <div className="flex flex-col gap-6 p-6 overflow-y-auto h-full">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          {/* Method badge */}
          <span
            className={[
              "inline-flex items-center rounded-md border px-3 py-1 text-sm font-bold uppercase tracking-wide",
              methodStyle,
            ].join(" ")}
          >
            {endpoint.method}
          </span>

          {/* Auth badge */}
          {endpoint.authRequired ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
              Auth required
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-400">
              Public
            </span>
          )}

          {/* Framework badge */}
          <span className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--muted)] px-2.5 py-1 text-xs font-medium text-[var(--muted-foreground)]">
            {frameworkLabel}
          </span>
        </div>

        {/* Path */}
        <h2 className="font-mono text-lg font-semibold text-[var(--foreground)] break-all">
          {endpoint.path}
        </h2>

        {/* Description */}
        {endpoint.description && (
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            {endpoint.description}
          </p>
        )}
      </div>

      {/* Parameters table */}
      {endpoint.parameters.length > 0 && (
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Parameters
          </h3>
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--muted-foreground)]">
                    Name
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--muted-foreground)]">
                    Location
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--muted-foreground)]">
                    Type
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--muted-foreground)]">
                    Required
                  </th>
                </tr>
              </thead>
              <tbody>
                {endpoint.parameters.map((param, i) => (
                  <tr
                    key={`${param.name}-${param.location}-${i}`}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-3 py-2 font-mono text-xs font-medium text-[var(--foreground)]">
                      {param.name}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={[
                          "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                          LOCATION_COLORS[param.location] ?? "bg-gray-100 text-gray-600",
                        ].join(" ")}
                      >
                        {param.location}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-[var(--muted-foreground)]">
                      {param.type}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--muted-foreground)]">
                      {param.required ? (
                        <span className="font-medium text-[var(--foreground)]">Yes</span>
                      ) : (
                        "No"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Response type */}
      {endpoint.responseType && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Response Type
          </h3>
          <span className="inline-block rounded-md border border-[var(--border)] bg-[var(--muted)] px-2.5 py-1 font-mono text-xs text-[var(--foreground)]">
            {endpoint.responseType}
          </span>
        </div>
      )}

      {/* DB tables */}
      {endpoint.dbTablesAccessed.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Database Tables
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {endpoint.dbTablesAccessed.map((table) => (
              <span
                key={table}
                className="inline-block rounded bg-[var(--muted)] px-2 py-1 font-mono text-xs text-[var(--muted-foreground)]"
              >
                {table}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* External API calls */}
      {endpoint.externalApiCalls.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            External Calls
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {endpoint.externalApiCalls.map((call) => (
              <span
                key={call}
                className="inline-block rounded bg-[var(--muted)] px-2 py-1 font-mono text-xs text-[var(--muted-foreground)]"
              >
                {call}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Handler code */}
      {endpoint.handlerCode && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              Handler Code
            </h3>
            <a
              href={codeViewerUrl}
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
              title="Open in code viewer"
            >
              Open in Code Viewer →
            </a>
          </div>
          <div className="relative rounded-lg border border-[var(--border)] bg-[var(--muted)] overflow-hidden">
            {/* File path header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-1.5">
              <span className="font-mono text-[10px] text-[var(--muted-foreground)] truncate">
                {endpoint.filePath}
                {endpoint.startLine > 1 && ` :${endpoint.startLine}`}
              </span>
            </div>
            {/* Code block */}
            <pre className="overflow-x-auto p-4 text-[11px] leading-relaxed text-[var(--foreground)] max-h-96">
              <code>{endpoint.handlerCode}</code>
            </pre>
          </div>
        </div>
      )}

      {/* File info (when no handler code) */}
      {!endpoint.handlerCode && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Source File
          </h3>
          <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--muted)] px-3 py-2">
            <span className="font-mono text-xs text-[var(--foreground)] flex-1 min-w-0 truncate">
              {endpoint.filePath}
              {endpoint.startLine > 1 && `:${endpoint.startLine}`}
            </span>
            <a
              href={codeViewerUrl}
              className="shrink-0 text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              Open →
            </a>
          </div>
        </div>
      )}

      {/* Related endpoints */}
      {relatedEndpoints.length > 0 && (
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Related Endpoints
          </h3>
          <div className="flex flex-col gap-1">
            {relatedEndpoints.map((rel) => {
              const relMethodStyle = METHOD_STYLES[rel.method] ?? METHOD_STYLES.ALL;
              return (
                <button
                  key={rel.id}
                  type="button"
                  onClick={() => onSelectEndpoint(rel)}
                  className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-left transition-colors hover:bg-[var(--muted)]"
                >
                  <span
                    className={[
                      "shrink-0 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      relMethodStyle,
                    ].join(" ")}
                  >
                    {rel.method}
                  </span>
                  <span className="font-mono text-xs text-[var(--foreground)] truncate">
                    {rel.path}
                  </span>
                  {rel.description && (
                    <span className="ml-auto shrink-0 text-[11px] text-[var(--muted-foreground)] max-w-[200px] truncate">
                      {rel.description}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
