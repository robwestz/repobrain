# Job 12: Blast Radius Analysis

## Summary
"If I change this function, what breaks?" Select any symbol or file and see a visual heatmap of all downstream dependencies, categorized by impact level (direct, indirect, transitive). Uses the existing symbol_relations graph with recursive traversal. The killer feature: shows not just what depends on it, but HOW it depends on it.

## Size: L (~5h)

## Dependencies: None

## What to Build

### 1. Blast Radius Module
Create `src/modules/blast-radius/`

#### analyzer.ts — Impact analysis engine
```typescript
interface ImpactNode {
  symbolId: string;
  symbolName: string;
  symbolKind: string;
  filePath: string;
  fileId: string;
  startLine: number;
  endLine: number;
  impactLevel: "direct" | "indirect" | "transitive";
  depth: number; // hops from source
  relationPath: string[]; // e.g. ["calls", "imports"] — how we got here
  dependencyType: string; // the relation that connects this to its parent
  riskScore: number; // 0-100, higher = more critical
}

interface BlastRadiusResult {
  source: {
    symbolName: string;
    symbolKind: string;
    filePath: string;
    startLine: number;
    endLine: number;
  };
  impactedNodes: ImpactNode[];
  impactedFiles: { filePath: string; nodeCount: number; maxRisk: number }[];
  summary: {
    directCount: number;
    indirectCount: number;
    transitiveCount: number;
    totalFiles: number;
    totalSymbols: number;
    highRiskCount: number;
  };
}

async function analyzeBlastRadius(
  repoConnectionId: string,
  targetSymbolId: string,
  maxDepth?: number // default 4
): Promise<BlastRadiusResult>

async function analyzeFileBlastRadius(
  repoConnectionId: string,
  filePath: string,
  maxDepth?: number
): Promise<BlastRadiusResult>
```

**Implementation:**

1. **Graph traversal** — Recursive CTE in PostgreSQL:
```sql
WITH RECURSIVE impact AS (
  -- Direct dependents: who calls/imports/uses the target symbol
  SELECT
    s.id as symbol_id, s.name, s.kind, f.path, f.id as file_id,
    s.start_line, s.end_line,
    sr.relation_type,
    1 as depth,
    ARRAY[sr.relation_type] as relation_path
  FROM symbol_relations sr
  JOIN symbols s ON s.id = sr.from_symbol_id
  JOIN files f ON f.id = s.file_id
  WHERE sr.to_symbol_id = {targetSymbolId}

  UNION ALL

  -- Transitive dependents
  SELECT
    s.id, s.name, s.kind, f.path, f.id,
    s.start_line, s.end_line,
    sr.relation_type,
    i.depth + 1,
    i.relation_path || sr.relation_type
  FROM impact i
  JOIN symbol_relations sr ON sr.to_symbol_id = i.symbol_id
  JOIN symbols s ON s.id = sr.from_symbol_id
  JOIN files f ON f.id = s.file_id
  WHERE i.depth < {maxDepth}
    AND NOT s.id = ANY(SELECT symbol_id FROM impact) -- prevent cycles
)
SELECT DISTINCT ON (symbol_id) * FROM impact ORDER BY symbol_id, depth ASC;
```

2. **Impact classification:**
   - depth 1 = "direct"
   - depth 2 = "indirect"
   - depth 3+ = "transitive"

3. **Risk scoring:**
   - Base risk from depth: direct=80, indirect=50, transitive=30
   - Bonus +10 if relation is "extends" or "implements" (structural coupling)
   - Bonus +10 if the impacted symbol is an API route handler (user-facing)
   - Bonus +5 if the impacted file has high afferent coupling (many dependents itself)
   - Cap at 100

4. **File aggregation:**
   - Group impacted nodes by file
   - Per-file: count of impacted symbols, max risk score

#### queries.ts
Encapsulates the recursive CTE and supporting queries.

```typescript
async function getDownstreamSymbols(symbolId: string, maxDepth: number): Promise<RawImpactRow[]>
async function getFileSymbols(repoConnectionId: string, filePath: string): Promise<string[]> // symbol IDs
async function getSymbolByName(repoConnectionId: string, name: string): Promise<Symbol | null>
```

### 2. API Routes

#### POST /api/workspaces/[workspaceId]/repos/[repoId]/blast-radius
Request:
```json
{
  "symbolId": "uuid",         // either symbolId
  "symbolName": "askQuestion", // or symbolName (resolved server-side)
  "filePath": "src/modules/chat/service.ts", // or filePath (analyzes all symbols in file)
  "maxDepth": 4
}
```

Response: `BlastRadiusResult` JSON

Cache in Redis for 5 min per (repoConnectionId, symbolId).

Create: `src/app/api/workspaces/[workspaceId]/repos/[repoId]/blast-radius/route.ts`

### 3. UI — Blast Radius Page
Create `src/app/workspace/[workspaceId]/blast-radius/page.tsx`

#### BlastRadiusView (`src/components/blast-radius/blast-radius-view.tsx`)
Main view component.

**Top section — Target selector:**
- Search input: "Search for a function, class, or file..."
- Autocomplete dropdown showing matching symbols (query symbols table)
- Selected target shown as a pill: `askQuestion (function) in chat/service.ts`
- "Analyze" button
- Depth selector: slider 1-6 (default 4)

**Summary section (after analysis):**
- 4 metric cards:
  - Direct impacts (red number)
  - Indirect impacts (orange number)
  - Transitive impacts (yellow number)
  - Total files affected (gray)

**Main visualization — Impact Tree/Sunburst:**
Option A: **Concentric circles (sunburst-like, pure CSS/SVG)**
- Center: target symbol (red)
- Ring 1: direct dependents (orange)
- Ring 2: indirect (yellow)
- Ring 3+: transitive (gray)
- Each segment = one impacted symbol
- Segment size proportional to risk score
- Hover shows: symbol name, file, risk score
- Click navigates to code viewer

Option B: **Flat treemap (simpler, fallback)**
- Grid of file cards, sized by number of impacted symbols
- Color: red (high risk) → yellow (medium) → green (low)
- Each card lists the impacted symbols within

**Choose Option A if feasible with pure SVG, otherwise Option B.**

**Bottom section — Impact table:**
- Sortable table: Symbol, Kind, File, Impact Level, Risk Score, Relation Path
- Color-coded impact level badges
- Click row → code viewer
- Filter by impact level

#### SymbolSearch (`src/components/blast-radius/symbol-search.tsx`)
Autocomplete search for symbols.

```typescript
interface SymbolSearchProps {
  repoConnectionId: string;
  workspaceId: string;
  onSelect: (symbol: { id: string; name: string; kind: string; filePath: string }) => void;
}
```

Queries: `GET /api/workspaces/{wId}/repos/{rId}/symbols?q=askQue&limit=10`

Need a new simple API route for symbol search:
Create: `src/app/api/workspaces/[workspaceId]/repos/[repoId]/symbols/route.ts`
```typescript
// GET ?q=searchTerm&limit=10
// Returns matching symbols by name (ILIKE)
```

#### ImpactVisualization (`src/components/blast-radius/impact-visualization.tsx`)
The sunburst or treemap visualization.

### 4. Integration with Code Viewer
Add a "Blast Radius" button to the code viewer toolbar.
When viewing a file/symbol, click → navigates to blast-radius page with that target pre-selected.

Modify `src/components/code-viewer/code-viewer.tsx`:
- Add small "Impact" button in header toolbar
- Links to `/workspace/{wId}/blast-radius?file={filePath}`

### 5. Integration
- Add "Blast Radius" to sidebar nav
- Export the `analyzeBlastRadius` function for use by Job 14 (What If Sandbox)

## Files to Create
- `src/modules/blast-radius/analyzer.ts`
- `src/modules/blast-radius/queries.ts`
- `src/app/api/workspaces/[workspaceId]/repos/[repoId]/blast-radius/route.ts`
- `src/app/api/workspaces/[workspaceId]/repos/[repoId]/symbols/route.ts` (symbol search)
- `src/app/workspace/[workspaceId]/blast-radius/page.tsx`
- `src/components/blast-radius/blast-radius-view.tsx`
- `src/components/blast-radius/symbol-search.tsx`
- `src/components/blast-radius/impact-visualization.tsx`

## Files to Modify
- `src/components/code-viewer/code-viewer.tsx` — Add "Impact" button
- `src/components/layout/sidebar-nav.tsx` — Add "Blast Radius" nav item (if exists)

## No DB Schema Changes
## No New NPM Packages

## Acceptance Criteria
1. Blast radius page loads at `/workspace/{wId}/blast-radius`
2. Symbol search autocomplete works
3. Selecting a symbol and clicking "Analyze" shows impact analysis
4. Direct/indirect/transitive impacts are correctly classified
5. Risk scores are reasonable (API route handlers score higher)
6. Visualization renders with proper color coding
7. Clicking any impacted node navigates to code viewer
8. Impact table is sortable and filterable
9. "Impact" button in code viewer links to this page
10. `npm run build` passes

## What NOT to Do
- Do not install D3.js (use pure SVG/CSS for visualization)
- Do not run actual code analysis / AST parsing (use existing symbol data)
- Do not modify the ingestion pipeline
- Do not add "fix suggestion" features
- Do not add change simulation (that's Job 14)
