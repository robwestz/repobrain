# Job 04: Code Health Dashboard

## Summary
Automated code health scoring per file and module. Shows complexity, coupling, file size, symbol density, and documentation coverage. A dashboard with treemap visualization and sortable table. No external tools — all metrics derived from existing DB data (symbols, relations, chunks, files).

## Size: M (~3h)

## Dependencies: None

## What to Build

### 1. Health Metrics Module
Create `src/modules/health/`

#### metrics.ts — Core metric calculations
All metrics derived from existing tables. No new indexing needed.

```typescript
interface FileHealth {
  fileId: string;
  filePath: string;
  language: string | null;
  metrics: {
    sizeBytes: number;
    lineCount: number;
    symbolCount: number;
    complexity: number; // estimated cyclomatic complexity
    coupling: {
      afferent: number;  // incoming dependencies (who depends on me)
      efferent: number;  // outgoing dependencies (what I depend on)
      instability: number; // efferent / (afferent + efferent), 0=stable, 1=unstable
    };
    chunkDensity: number; // chunks per 100 lines (high = complex structure)
    avgChunkTokens: number; // average token count per chunk
    documentationRatio: number; // estimated: comment lines / total lines
  };
  healthScore: number; // 0-100 composite score
  issues: string[]; // human-readable issues found
}

interface RepoHealth {
  repoConnectionId: string;
  overallScore: number; // 0-100 weighted average
  fileCount: number;
  totalSymbols: number;
  totalRelations: number;
  languageBreakdown: { language: string; fileCount: number; lineCount: number }[];
  hotspots: FileHealth[]; // top 10 worst-scoring files
  bestFiles: FileHealth[]; // top 5 best-scoring files
  metrics: {
    avgComplexity: number;
    avgCoupling: number;
    maxFileSize: number;
    avgFileSize: number;
  };
}
```

**Complexity estimation** (without running actual cyclomatic analysis):
- Count symbols of kind "function" and "method" in the file
- For each, estimate complexity as: `(endLine - startLine) / 10` (rough heuristic)
- Sum all function complexities
- Bonus: count nesting depth via parentSymbolId chains

**Coupling calculation**:
- Afferent: `SELECT COUNT(DISTINCT sr.from_symbol_id) FROM symbol_relations sr JOIN symbols s ON s.id = sr.to_symbol_id JOIN files f ON f.id = s.file_id WHERE f.id = {fileId}`
- Efferent: same but reversed (from_symbol_id is in this file)

**Documentation ratio estimation**:
- From chunks: count chunks whose content starts with `//`, `/*`, `#`, `"""`, or similar comment patterns
- Ratio = comment chunks / total chunks (rough but useful)

**Health score formula**:
```
score = 100
- (complexity > 50 ? 20 : complexity > 20 ? 10 : 0)
- (coupling.instability > 0.8 ? 15 : coupling.instability > 0.5 ? 5 : 0)
- (lineCount > 500 ? 15 : lineCount > 300 ? 5 : 0)
- (documentationRatio < 0.05 ? 10 : 0)
- (symbolCount > 30 ? 10 : 0)
clamp(score, 0, 100)
```

#### queries.ts — DB queries
```typescript
async function getFileMetrics(repoConnectionId: string): Promise<FileMetricsRow[]>
async function getSymbolCounts(repoConnectionId: string): Promise<Map<string, number>>
async function getCouplingData(repoConnectionId: string): Promise<CouplingRow[]>
async function getChunkStats(repoConnectionId: string): Promise<ChunkStatsRow[]>
```

Use raw SQL with Drizzle's `db.execute()` for aggregation queries. Cache results in Redis for 5 min.

### 2. API Route

#### GET /api/workspaces/[workspaceId]/repos/[repoId]/health
Query params: `sortBy=healthScore|complexity|coupling|size`, `order=asc|desc`, `limit=100`

Response: `RepoHealth` JSON

Create: `src/app/api/workspaces/[workspaceId]/repos/[repoId]/health/route.ts`

### 3. UI — Dashboard Page
Create `src/app/workspace/[workspaceId]/health/page.tsx`

#### HealthDashboard (`src/components/health/health-dashboard.tsx`)
Main dashboard layout.

**Top section — Overview cards (4 cards in a row):**
- Overall Health Score (large number with color: green >70, yellow >40, red <=40)
- Total Files / Symbols
- Average Complexity
- Coupling Distribution (small bar chart)

**Middle section — Treemap visualization:**
- Each rectangle = one file
- Size = line count
- Color = health score (green→yellow→red gradient)
- Hover shows file name + score
- Click navigates to file in code viewer
- Use a simple CSS grid-based treemap (no D3 dependency needed):
  - Sort files by lineCount DESC
  - Render as flex-wrap grid with proportional widths
  - Each cell has background-color based on health score

**Bottom section — File table:**
- Sortable columns: File Path, Language, Lines, Symbols, Complexity, Coupling, Health Score
- Color-coded health score badges
- Click row → open file in code viewer
- Search/filter input above table
- Paginated (50 per page)

#### HealthScoreBadge (`src/components/health/health-score-badge.tsx`)
Small reusable badge showing a score with color coding.

```typescript
interface HealthScoreBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
}
```

#### LanguageBreakdown (`src/components/health/language-breakdown.tsx`)
Horizontal stacked bar showing language distribution.

### 4. Integration
- Add "Health" to sidebar nav (if Job 01 done) or add a link on the workspace page
- Add small health score indicator next to file names in file tree (optional, only if simple)

## Files to Create
- `src/modules/health/metrics.ts`
- `src/modules/health/queries.ts`
- `src/app/api/workspaces/[workspaceId]/repos/[repoId]/health/route.ts`
- `src/app/workspace/[workspaceId]/health/page.tsx`
- `src/components/health/health-dashboard.tsx`
- `src/components/health/health-score-badge.tsx`
- `src/components/health/language-breakdown.tsx`

## Files to Modify
- `src/components/layout/sidebar-nav.tsx` — Add "Health" nav item (if exists)

## No DB Schema Changes (reads existing tables)
## No New NPM Packages

## Acceptance Criteria
1. Health dashboard page loads at `/workspace/{wId}/health`
2. Overall health score displayed prominently
3. Treemap visualization shows files colored by health
4. Clicking a file in treemap or table navigates to code viewer
5. Table is sortable by all columns
6. Table search/filter works
7. Language breakdown chart renders correctly
8. Metrics are cached (second load is fast)
9. Scores are reasonable (small utility files score high, large complex files score lower)
10. `npm run build` passes

## What NOT to Do
- Do not install D3.js or any charting library — use pure CSS/SVG
- Do not run actual linting or cyclomatic complexity tools (estimate from DB data)
- Do not modify the ingestion pipeline
- Do not add new database tables
- Do not add historical tracking (that's a future enhancement)
