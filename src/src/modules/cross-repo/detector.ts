/**
 * Cross-repo relationship detector.
 *
 * Detects relationships between repos in a workspace:
 *   1. API Consumer — HTTP calls in repo A matching API routes in repo B
 *   2. Shared Type  — identical type/interface/class names across repos
 *   3. NPM Dependency — repo A depends on repo B via package.json
 *   4. Shared Module — files with identical paths across repos
 *   5. Import Pattern — imports referencing the other repo's package name
 */

import { sql, eq, inArray } from "drizzle-orm";
import { db } from "@/src/lib/db";
import { repoConnections } from "@/src/lib/db/schema";
import { crossRepoRelations } from "@/src/lib/db/schema-cross-repo";

export interface CrossRepoRelation {
  fromRepo: string; // repo name (owner/name)
  toRepo: string;
  fromRepoId: string;
  toRepoId: string;
  relationType: "api-consumer" | "shared-type" | "npm-dependency" | "shared-module" | "import-pattern";
  fromFile: string;
  toFile: string;
  fromSymbol: string | null;
  toSymbol: string | null;
  evidence: string;
  confidence: "high" | "medium" | "low";
}

interface RepoInfo {
  id: string;
  owner: string;
  name: string;
  fullName: string;
}

/**
 * Detect cross-repo relationships and persist them to the DB.
 * Returns all detected relations.
 */
export async function detectCrossRepoRelations(
  workspaceId: string,
  repoConnectionIds: string[],
): Promise<CrossRepoRelation[]> {
  if (repoConnectionIds.length < 2) return [];

  // Load repo info
  const repos = await db
    .select({
      id: repoConnections.id,
      owner: repoConnections.owner,
      name: repoConnections.name,
    })
    .from(repoConnections)
    .where(inArray(repoConnections.id, repoConnectionIds));

  const repoMap = new Map<string, RepoInfo>(
    repos.map((r) => [r.id, { id: r.id, owner: r.owner, name: r.name, fullName: `${r.owner}/${r.name}` }]),
  );

  const detected: CrossRepoRelation[] = [];

  // Run all detection strategies in parallel for each repo pair
  const pairs: Array<[RepoInfo, RepoInfo]> = [];
  for (let i = 0; i < repos.length; i++) {
    for (let j = i + 1; j < repos.length; j++) {
      const a = repoMap.get(repos[i].id);
      const b = repoMap.get(repos[j].id);
      if (a && b) pairs.push([a, b]);
    }
  }

  const pairResults = await Promise.all(
    pairs.map(([a, b]) => detectPairRelations(a, b)),
  );

  for (const result of pairResults) {
    detected.push(...result);
  }

  // Persist to DB (upsert by clearing old and inserting new for this workspace)
  if (detected.length > 0) {
    // Delete old relations for these repos
    for (const repo of repos) {
      await db
        .delete(crossRepoRelations)
        .where(eq(crossRepoRelations.fromRepoId, repo.id));
    }

    // Insert new relations
    await db.insert(crossRepoRelations).values(
      detected.map((r) => ({
        fromRepoId: r.fromRepoId,
        toRepoId: r.toRepoId,
        relationType: r.relationType,
        fromFilePath: r.fromFile,
        toFilePath: r.toFile,
        fromSymbolName: r.fromSymbol ?? undefined,
        toSymbolName: r.toSymbol ?? undefined,
        evidence: r.evidence,
        confidence: r.confidence,
      })),
    );
  }

  return detected;
}

async function detectPairRelations(
  repoA: RepoInfo,
  repoB: RepoInfo,
): Promise<CrossRepoRelation[]> {
  const [
    apiRelations,
    sharedTypeRelations,
    npmRelations,
    sharedModuleRelations,
    importPatternRelations,
  ] = await Promise.all([
    detectApiConsumers(repoA, repoB),
    detectSharedTypes(repoA, repoB),
    detectNpmDependencies(repoA, repoB),
    detectSharedModules(repoA, repoB),
    detectImportPatterns(repoA, repoB),
  ]);

  return [
    ...apiRelations,
    ...sharedTypeRelations,
    ...npmRelations,
    ...sharedModuleRelations,
    ...importPatternRelations,
  ];
}

// ---------------------------------------------------------------------------
// Strategy 1: API Consumer Detection
// ---------------------------------------------------------------------------

async function detectApiConsumers(
  repoA: RepoInfo,
  repoB: RepoInfo,
): Promise<CrossRepoRelation[]> {
  const relations: CrossRepoRelation[] = [];

  // Find HTTP client calls in repo A's chunks
  const httpCallsInA = await db.execute<{
    file_path: string;
    content: string;
  }>(sql`
    SELECT DISTINCT f.path AS file_path, c.content
    FROM files f
    JOIN chunks c ON c.file_id = f.id
    WHERE f.repo_connection_id = ${repoA.id}
      AND (
        c.content ILIKE '%fetch(%' OR
        c.content ILIKE '%axios.%' OR
        c.content ILIKE '%http.get(%' OR
        c.content ILIKE '%.get("/%' OR
        c.content ILIKE '%.post("/%' OR
        c.content ILIKE '%.put("/%' OR
        c.content ILIKE '%.delete("/%'
      )
    LIMIT 50
  `);

  // Find API route files in repo B
  const apiRoutesInB = await db.execute<{
    file_path: string;
  }>(sql`
    SELECT f.path AS file_path
    FROM files f
    WHERE f.repo_connection_id = ${repoB.id}
      AND (
        f.path ILIKE '%/api/%' OR
        f.path ILIKE '%/routes/%' OR
        f.path ILIKE '%route.ts' OR
        f.path ILIKE '%route.js' OR
        f.path ILIKE '%.controller.ts' OR
        f.path ILIKE '%.controller.js'
      )
    LIMIT 50
  `);

  // Match URL patterns
  for (const httpCall of httpCallsInA.rows) {
    for (const route of apiRoutesInB.rows) {
      // Extract route segment from path (e.g., /api/users from src/app/api/users/route.ts)
      const routeSegment = extractRouteSegment(route.file_path);
      if (routeSegment && httpCall.content.toLowerCase().includes(routeSegment.toLowerCase())) {
        relations.push({
          fromRepo: repoA.fullName,
          toRepo: repoB.fullName,
          fromRepoId: repoA.id,
          toRepoId: repoB.id,
          relationType: "api-consumer",
          fromFile: httpCall.file_path,
          toFile: route.file_path,
          fromSymbol: null,
          toSymbol: null,
          evidence: `HTTP call referencing ${routeSegment}`,
          confidence: "high",
        });
      }
    }
  }

  return relations.slice(0, 20);
}

function extractRouteSegment(filePath: string): string | null {
  // Convert file path to route segment
  // e.g., "src/app/api/users/route.ts" → "/api/users"
  const match = filePath.match(/\/(api\/[^/]+(?:\/[^/]+)*?)\/route\.[jt]sx?$/);
  if (match) return `/${match[1]}`;

  // e.g., "src/routes/users.ts" → "/users"
  const routeMatch = filePath.match(/\/routes\/([^/]+)\.[jt]sx?$/);
  if (routeMatch) return `/${routeMatch[1]}`;

  return null;
}

// ---------------------------------------------------------------------------
// Strategy 2: Shared Type Detection
// ---------------------------------------------------------------------------

async function detectSharedTypes(
  repoA: RepoInfo,
  repoB: RepoInfo,
): Promise<CrossRepoRelation[]> {
  const relations: CrossRepoRelation[] = [];

  // Find interface/type/class symbols in both repos
  const symbolsInA = await db.execute<{
    symbol_name: string;
    symbol_kind: string;
    file_path: string;
  }>(sql`
    SELECT s.name AS symbol_name, s.kind AS symbol_kind, f.path AS file_path
    FROM symbols s
    JOIN files f ON f.id = s.file_id
    WHERE f.repo_connection_id = ${repoA.id}
      AND s.kind IN ('interface', 'type', 'class', 'enum')
    LIMIT 100
  `);

  const symbolsInB = await db.execute<{
    symbol_name: string;
    symbol_kind: string;
    file_path: string;
  }>(sql`
    SELECT s.name AS symbol_name, s.kind AS symbol_kind, f.path AS file_path
    FROM symbols s
    JOIN files f ON f.id = s.file_id
    WHERE f.repo_connection_id = ${repoB.id}
      AND s.kind IN ('interface', 'type', 'class', 'enum')
    LIMIT 100
  `);

  const symbolMapB = new Map<string, { kind: string; filePath: string }>();
  for (const sym of symbolsInB.rows) {
    symbolMapB.set(`${sym.symbol_name}:${sym.symbol_kind}`, {
      kind: sym.symbol_kind,
      filePath: sym.file_path,
    });
  }

  for (const symA of symbolsInA.rows) {
    const key = `${symA.symbol_name}:${symA.symbol_kind}`;
    const matchB = symbolMapB.get(key);
    if (matchB) {
      relations.push({
        fromRepo: repoA.fullName,
        toRepo: repoB.fullName,
        fromRepoId: repoA.id,
        toRepoId: repoB.id,
        relationType: "shared-type",
        fromFile: symA.file_path,
        toFile: matchB.filePath,
        fromSymbol: symA.symbol_name,
        toSymbol: symA.symbol_name,
        evidence: `${symA.symbol_kind} "${symA.symbol_name}" appears in both repos`,
        confidence: "medium",
      });
    }
  }

  return relations.slice(0, 30);
}

// ---------------------------------------------------------------------------
// Strategy 3: NPM Dependency Detection
// ---------------------------------------------------------------------------

async function detectNpmDependencies(
  repoA: RepoInfo,
  repoB: RepoInfo,
): Promise<CrossRepoRelation[]> {
  const relations: CrossRepoRelation[] = [];

  // Read package.json from both repos
  const pkgA = await getPackageJson(repoA.id);
  const pkgB = await getPackageJson(repoB.id);

  if (!pkgA || !pkgB) return relations;

  const repoAName = pkgA.name as string | undefined;
  const repoBName = pkgB.name as string | undefined;

  // Check if repo A's package.json lists repo B as a dependency
  const allDepsA = {
    ...(pkgA.dependencies as Record<string, string> | undefined ?? {}),
    ...(pkgA.devDependencies as Record<string, string> | undefined ?? {}),
  };

  const allDepsB = {
    ...(pkgB.dependencies as Record<string, string> | undefined ?? {}),
    ...(pkgB.devDependencies as Record<string, string> | undefined ?? {}),
  };

  if (repoBName && allDepsA[repoBName]) {
    relations.push({
      fromRepo: repoA.fullName,
      toRepo: repoB.fullName,
      fromRepoId: repoA.id,
      toRepoId: repoB.id,
      relationType: "npm-dependency",
      fromFile: "package.json",
      toFile: "package.json",
      fromSymbol: null,
      toSymbol: null,
      evidence: `${repoA.name} depends on ${repoBName}@${allDepsA[repoBName]}`,
      confidence: "high",
    });
  }

  if (repoAName && allDepsB[repoAName]) {
    relations.push({
      fromRepo: repoB.fullName,
      toRepo: repoA.fullName,
      fromRepoId: repoB.id,
      toRepoId: repoA.id,
      relationType: "npm-dependency",
      fromFile: "package.json",
      toFile: "package.json",
      fromSymbol: null,
      toSymbol: null,
      evidence: `${repoB.name} depends on ${repoAName}@${allDepsB[repoAName]}`,
      confidence: "high",
    });
  }

  return relations;
}

async function getPackageJson(repoConnectionId: string): Promise<Record<string, unknown> | null> {
  const result = await db.execute<{ content: string }>(sql`
    SELECT c.content
    FROM files f
    JOIN chunks c ON c.file_id = f.id
    WHERE f.repo_connection_id = ${repoConnectionId}
      AND f.path = 'package.json'
    LIMIT 1
  `);

  if (result.rows.length === 0) return null;

  try {
    return JSON.parse(result.rows[0].content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Strategy 4: Shared Module Detection
// ---------------------------------------------------------------------------

async function detectSharedModules(
  repoA: RepoInfo,
  repoB: RepoInfo,
): Promise<CrossRepoRelation[]> {
  const relations: CrossRepoRelation[] = [];

  // Find files with identical relative paths
  const pathsInA = await db.execute<{ file_path: string; content_hash: string }>(sql`
    SELECT path AS file_path, content_hash
    FROM files
    WHERE repo_connection_id = ${repoA.id}
      AND path NOT ILIKE '%node_modules%'
      AND path NOT ILIKE '%package-lock%'
      AND path NOT ILIKE '%.lock'
    LIMIT 200
  `);

  const pathsInB = await db.execute<{ file_path: string; content_hash: string }>(sql`
    SELECT path AS file_path, content_hash
    FROM files
    WHERE repo_connection_id = ${repoB.id}
      AND path NOT ILIKE '%node_modules%'
      AND path NOT ILIKE '%package-lock%'
      AND path NOT ILIKE '%.lock'
    LIMIT 200
  `);

  const pathMapB = new Map<string, string>();
  for (const f of pathsInB.rows) {
    pathMapB.set(f.file_path, f.content_hash);
  }

  for (const fileA of pathsInA.rows) {
    const hashB = pathMapB.get(fileA.file_path);
    if (hashB) {
      const confidence = hashB === fileA.content_hash ? "high" : "medium";
      const evidence =
        hashB === fileA.content_hash
          ? `Identical file at path: ${fileA.file_path}`
          : `Similar file at same path: ${fileA.file_path} (different content)`;

      relations.push({
        fromRepo: repoA.fullName,
        toRepo: repoB.fullName,
        fromRepoId: repoA.id,
        toRepoId: repoB.id,
        relationType: "shared-module",
        fromFile: fileA.file_path,
        toFile: fileA.file_path,
        fromSymbol: null,
        toSymbol: null,
        evidence,
        confidence,
      });
    }
  }

  return relations.slice(0, 20);
}

// ---------------------------------------------------------------------------
// Strategy 5: Import Pattern Detection
// ---------------------------------------------------------------------------

async function detectImportPatterns(
  repoA: RepoInfo,
  repoB: RepoInfo,
): Promise<CrossRepoRelation[]> {
  const relations: CrossRepoRelation[] = [];

  // Get package name from repo B's package.json
  const pkgB = await getPackageJson(repoB.id);
  const pkgA = await getPackageJson(repoA.id);

  // Check repo A for imports of repo B's package name
  if (pkgB?.name) {
    const packageName = pkgB.name as string;
    const importMatches = await db.execute<{ file_path: string; content: string }>(sql`
      SELECT DISTINCT f.path AS file_path, c.content
      FROM files f
      JOIN chunks c ON c.file_id = f.id
      WHERE f.repo_connection_id = ${repoA.id}
        AND c.content ILIKE ${"%" + packageName + "%"}
      LIMIT 20
    `);

    for (const match of importMatches.rows) {
      if (
        match.content.includes(`from "${packageName}`) ||
        match.content.includes(`from '${packageName}`) ||
        match.content.includes(`require("${packageName}`) ||
        match.content.includes(`require('${packageName}`)
      ) {
        relations.push({
          fromRepo: repoA.fullName,
          toRepo: repoB.fullName,
          fromRepoId: repoA.id,
          toRepoId: repoB.id,
          relationType: "import-pattern",
          fromFile: match.file_path,
          toFile: "package.json",
          fromSymbol: null,
          toSymbol: null,
          evidence: `Imports from "${packageName}" (${repoB.name})`,
          confidence: "high",
        });
      }
    }
  }

  // Check repo B for imports of repo A's package name
  if (pkgA?.name) {
    const packageName = pkgA.name as string;
    const importMatches = await db.execute<{ file_path: string; content: string }>(sql`
      SELECT DISTINCT f.path AS file_path, c.content
      FROM files f
      JOIN chunks c ON c.file_id = f.id
      WHERE f.repo_connection_id = ${repoB.id}
        AND c.content ILIKE ${"%" + packageName + "%"}
      LIMIT 20
    `);

    for (const match of importMatches.rows) {
      if (
        match.content.includes(`from "${packageName}`) ||
        match.content.includes(`from '${packageName}`) ||
        match.content.includes(`require("${packageName}`) ||
        match.content.includes(`require('${packageName}`)
      ) {
        relations.push({
          fromRepo: repoB.fullName,
          toRepo: repoA.fullName,
          fromRepoId: repoB.id,
          toRepoId: repoA.id,
          relationType: "import-pattern",
          fromFile: match.file_path,
          toFile: "package.json",
          fromSymbol: null,
          toSymbol: null,
          evidence: `Imports from "${packageName}" (${repoA.name})`,
          confidence: "high",
        });
      }
    }
  }

  return relations;
}
