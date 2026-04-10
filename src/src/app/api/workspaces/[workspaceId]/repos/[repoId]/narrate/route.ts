/**
 * POST /api/workspaces/[workspaceId]/repos/[repoId]/narrate
 *
 * Traces a code flow starting from an optional entry symbol, then generates
 * a narrative walkthrough using the LLM.
 *
 * Request body:
 *   { "prompt": string, "entrySymbol"?: string }
 *
 * Response: NarratedFlow JSON
 *
 * If no entrySymbol is provided the API attempts to infer one from the prompt
 * by checking for known high-degree symbols in the repo.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { findWorkspaceByIdAndUser, findRepoConnectionById } from "@/src/modules/workspace/queries";
import { traceFlow } from "@/src/modules/narrator/flow-tracer";
import { narrateFlow } from "@/src/modules/narrator/narrator";
import { suggestFlows } from "@/src/modules/narrator/suggestions";
import { db } from "@/src/lib/db";
import { symbols, files } from "@/src/lib/db/schema";
import { and, eq, ilike } from "drizzle-orm";

type RouteContext = {
  params: Promise<{ workspaceId: string; repoId: string }>;
};

/**
 * Attempt to infer an entry symbol from the user's free-form prompt.
 * Falls back to the first suggestion for the repo.
 */
async function inferEntrySymbol(
  repoConnectionId: string,
  prompt: string,
): Promise<string | null> {
  // Extract a likely function/class name from the prompt (simple heuristic)
  // Looks for camelCase or PascalCase identifiers of 4+ chars
  const identifierRegex = /\b([a-zA-Z][a-zA-Z0-9]{3,})\b/g;
  const candidates: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = identifierRegex.exec(prompt)) !== null) {
    candidates.push(match[1]);
  }

  // Check if any candidate matches an actual symbol in the repo
  for (const candidate of candidates) {
    const found = await db
      .select({ name: symbols.name })
      .from(symbols)
      .innerJoin(files, eq(symbols.fileId, files.id))
      .where(
        and(
          eq(files.repoConnectionId, repoConnectionId),
          ilike(symbols.name, `%${candidate}%`),
        ),
      )
      .limit(1);

    if (found.length > 0) {
      return found[0].name;
    }
  }

  // Fall back to first suggestion
  const suggestions = await suggestFlows(repoConnectionId);
  return suggestions.length > 0 ? suggestions[0].entrySymbol : null;
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, repoId } = await params;

  // Verify ownership
  const workspace = await findWorkspaceByIdAndUser(workspaceId, session.userId);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const repo = await findRepoConnectionById(repoId);
  if (!repo || repo.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  // Parse body
  let body: { prompt?: unknown; entrySymbol?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.prompt || typeof body.prompt !== "string" || !body.prompt.trim()) {
    return NextResponse.json(
      { error: "prompt is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  const prompt = body.prompt.trim();
  let entrySymbol =
    typeof body.entrySymbol === "string" && body.entrySymbol.trim()
      ? body.entrySymbol.trim()
      : null;

  try {
    // If no entry symbol, infer one
    if (!entrySymbol) {
      entrySymbol = await inferEntrySymbol(repo.id, prompt);
      if (!entrySymbol) {
        return NextResponse.json(
          {
            error:
              "Could not determine an entry symbol. Please specify one using the 'entrySymbol' field.",
          },
          { status: 422 },
        );
      }
    }

    // Trace the flow
    const tracedFlow = await traceFlow(repo.id, entrySymbol);

    // Generate narrative
    const narratedFlow = await narrateFlow(tracedFlow, prompt);

    return NextResponse.json(narratedFlow);
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
