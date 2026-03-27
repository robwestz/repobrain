# Job 15: Cross-Repo Intelligence

## Summary
Connect multiple repositories in a single workspace and understand how they interact. "Which service calls this API endpoint?" "What shared types exist across repos?" Essential for microservice architectures, monorepo-adjacent setups, and projects with shared libraries. The only feature that modifies existing schema constraints.

## Size: XL (~8h)

## Dependencies: None (but should run last since it modifies existing patterns)

## What to Build

### 1. Schema Changes

#### Remove single-repo constraint
Modify `src/modules/workspace/service.ts`:
- Remove the check that limits workspaces to 1 repo
- Allow `connectRepo` to add multiple repos to a workspace

#### Add cross-repo relations table
Create `src/lib/db/schema-cross-repo.ts`:

```typescript
import { pgTable, uuid, text, varchar, timestamp, jsonb } from "drizzle-orm/pg-core";
import { repoConnections, symbols, files } from "./schema";

export const crossRepoRelations = pgTable("cross_repo_relations", {
  id: uuid("id").defaultRandom().primaryKey(),
  fromRepoId: uuid("from_repo_id").notNull().references(() => repoConnections.id, { onDelete: "cascade" }),
  toRepoId: uuid("to_repo_id").notNull().references(() => repoConnections.id, { onDelete: "cascade" }),
  relationType: varchar("relation_type", { length: 50 }).notNull(),
  // Types: "api-consumer", "shared-type", "npm-dependency", "shared-module"
  fromFilePath: text("from_file_path").notNull(),
  toFilePath: text("to_file_path").notNull(),
  fromSymbolName: varchar("from_symbol_name", { length: 200 }),
  toSymbolName: varchar("to_symbol_name", { length: 200 }),
  evidence: text("evidence"), // the code/config that proves this relation
  confidence: varchar("confidence", { length: 20 }).default("medium"), // high, medium, low
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const crossRepoSearchCache = pgTable("cross_repo_search_cache", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull(),
  query: text("query").notNull(),
  results: jsonb("results").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

Add to `src/lib/db/schema.ts`:
```typescript
export * from "./schema-cross-repo";
```

### 2. Cross-Repo Analysis Module
Create `src/modules/cross-repo/`

#### detector.ts — Cross-repo relationship detection
```typescript
interface CrossRepoRelation {
  fromRepo: string; // repo name
  toRepo: string;
  relationType: string;
  fromFile: string;
  toFile: string;
  fromSymbol: string | null;
  toSymbol: string | null;
  evidence: string;
  confidence: "high" | "medium" | "low";
}

async function detectCrossRepoRelations(
  workspaceId: string,
  repoConnectionIds: string[]
): Promise<CrossRepoRelation[]>
```

**Detection strategies:**

1. **API Consumer Detection** (high value):
   - Scan for HTTP client calls (`fetch(`, `axios.`, `http.get(`) in repo A
   - Extract URL patterns from the code
   - Match against API routes in repo B
   - Confidence: high if URL matches exactly, medium if partial match

2. **Shared Type Detection**:
   - Find symbols with identical names across repos
   - Compare by: name + kind (e.g., `interface User` in repo A and repo B)
   - Confidence: high if signatures match, medium if names match

3. **NPM Dependency Detection**:
   - Read package.json from each repo's files table
   - Check if repo A lists repo B as a dependency (or vice versa)
   - Confidence: high

4. **Shared Module Detection**:
   - Files with identical paths or very similar content hashes across repos
   - Confidence: medium

5. **Import Pattern Detection**:
   - Scan for imports referencing the other repo's package name
   - `import { X } from "@company/shared-lib"` → links to the shared-lib repo
   - Confidence: high

#### search.ts — Cross-repo search
```typescript
interface CrossRepoSearchResult {
  repoName: string;
  repoConnectionId: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  symbolName: string | null;
  relevanceScore: number;
}

async function searchAcrossRepos(
  workspaceId: string,
  query: string,
  repoConnectionIds: string[],
  options?: { limit?: number; fileFilter?: string }
): Promise<CrossRepoSearchResult[]>
```

Implementation:
1. Run semantic search on each repo in parallel
2. Merge results by relevance score
3. Deduplicate similar content across repos
4. Return with repo attribution

### 3. API Routes

#### GET /api/workspaces/[workspaceId]/cross-repo/relations
Detect and return cross-repo relationships.

Response:
```json
{
  "relations": [...],
  "repos": [
    { "id": "uuid", "name": "frontend", "owner": "robin" },
    { "id": "uuid", "name": "backend-api", "owner": "robin" }
  ],
  "summary": {
    "apiConsumer": 5,
    "sharedType": 12,
    "npmDependency": 2,
    "totalRelations": 19
  }
}
```

#### POST /api/workspaces/[workspaceId]/cross-repo/search
Request:
```json
{
  "query": "Where is the User type used across all repos?",
  "repos": ["uuid1", "uuid2"] // optional, defaults to all
}
```

Response:
```json
{
  "results": [
    {
      "repoName": "frontend",
      "filePath": "src/types/user.ts",
      "content": "export interface User {...}",
      "relevanceScore": 0.95
    },
    {
      "repoName": "backend-api",
      "filePath": "src/models/user.ts",
      "content": "export class User {...}",
      "relevanceScore": 0.92
    }
  ]
}
```

Create routes under: `src/app/api/workspaces/[workspaceId]/cross-repo/`

### 4. UI Changes

#### Multi-Repo Workspace Support

**Modify workspace page** (`src/app/workspace/[workspaceId]/page.tsx`):
- If workspace has multiple repos, show a repo selector/switcher
- Top bar: repo tabs or dropdown to switch active repo
- Each repo has its own file tree, but chat can query all

**Modify WorkspaceShell** (`src/components/layout/workspace-shell.tsx`):
- Accept multiple repos
- Active repo state for file tree and code viewer
- Chat queries all repos by default

**Repo Switcher** (`src/components/workspace/repo-switcher.tsx`):
New component — tabs or dropdown showing connected repos.

```typescript
interface RepoSwitcherProps {
  repos: RepoConnection[];
  activeRepoId: string;
  onSwitch: (repoId: string) => void;
}
```

#### Cross-Repo Page
Create `src/app/workspace/[workspaceId]/cross-repo/page.tsx`

**CrossRepoView** (`src/components/cross-repo/cross-repo-view.tsx`):

**Top section — Connected repos:**
- List of repos in this workspace with status badges
- "Connect another repo" button → existing repo picker

**Relations visualization:**
- Simple diagram: repo boxes on left and right, lines connecting them
- Each line labeled with relation type
- Click a line → shows evidence (the code that proves the relation)
- Group by relation type: API Consumers, Shared Types, Dependencies

**Cross-repo search:**
- Search bar: "Search across all repos..."
- Results grouped by repo, showing repo name badge on each result
- Same result card format as Job 05 (search) but with repo attribution

**Relation details table:**
- Columns: From (repo/file), To (repo/file), Type, Confidence, Evidence
- Click → open file in code viewer (switch to that repo first)

### 5. Modify Existing Modules

#### Chat: Cross-repo context
Modify `src/modules/chat/service.ts`:
- When workspace has multiple repos, retrieve context from ALL repos
- Merge retrieval results across repos, keeping repo attribution
- In prompt, label context chunks with repo name

Modify `src/modules/retrieval/index.ts`:
- Add optional `repoConnectionIds: string[]` parameter
- When multiple IDs provided, run search on each and merge

#### Dashboard: Multi-repo display
Modify `src/app/dashboard/page.tsx`:
- Show repo count per workspace
- No other changes needed

### 6. Modify Workspace Service
Modify `src/modules/workspace/service.ts`:
- Remove the single-repo constraint (currently: `if (existing.length > 0) throw`)
- Keep the constraint check but change to a reasonable limit (e.g., max 10 repos)

## Files to Create
- `src/lib/db/schema-cross-repo.ts`
- `src/modules/cross-repo/detector.ts`
- `src/modules/cross-repo/search.ts`
- `src/app/api/workspaces/[workspaceId]/cross-repo/relations/route.ts`
- `src/app/api/workspaces/[workspaceId]/cross-repo/search/route.ts`
- `src/app/workspace/[workspaceId]/cross-repo/page.tsx`
- `src/components/cross-repo/cross-repo-view.tsx`
- `src/components/workspace/repo-switcher.tsx`

## Files to Modify
- `src/lib/db/schema.ts` — Add `export * from "./schema-cross-repo"`
- `src/modules/workspace/service.ts` — Remove single-repo constraint, raise limit to 10
- `src/modules/chat/service.ts` — Support multi-repo context
- `src/modules/retrieval/index.ts` — Support multi-repo search
- `src/components/layout/workspace-shell.tsx` — Add repo switcher, active repo state
- `src/app/workspace/[workspaceId]/page.tsx` — Support multi-repo display
- `src/components/layout/sidebar-nav.tsx` — Add "Cross-Repo" nav item (if exists)

## NPM Packages: None

## Acceptance Criteria
1. User can connect multiple repos to a single workspace
2. Repo switcher shows all connected repos
3. Switching repos changes file tree and code viewer to that repo
4. Chat queries retrieve context from all repos with attribution
5. Cross-repo page shows detected relationships between repos
6. Cross-repo search returns results from all repos, grouped by repo
7. API consumer detection works (finds HTTP calls matching API routes)
8. Shared type detection works (finds identical type names)
9. Single-repo workspaces still work exactly as before
10. Existing features (chat, file tree, code viewer) work with any selected repo
11. `npm run build` passes

## What NOT to Do
- Do not remove any existing functionality
- Do not require all repos to be indexed before workspace is usable
- Do not add real-time sync between repos
- Do not modify the ingestion pipeline (each repo indexed independently)
- Do not add cross-repo symbol_relations (keep those within-repo only)
- Do not break single-repo workspaces — they must work exactly as before

## Risk Mitigation
This job modifies existing files more than any other. To prevent regressions:
1. Test single-repo workspace flow after changes
2. Test chat still works with one repo
3. Test file tree still loads correctly
4. The key change in workspace/service.ts is minimal — just removing the count check
5. The key change in retrieval/index.ts is additive — add optional multi-repo parameter with single-repo as default
