# Job 08: Pattern Detective

## Summary
Automatically detect design patterns, anti-patterns, and consistency issues across the codebase. "You use the repository pattern in 3 modules but not in 2 others." "This file has a God class with 15 methods." Shows findings as an actionable report with links to code.

## Size: M (~3h)

## Dependencies: None

## What to Build

### 1. Pattern Detection Module
Create `src/modules/patterns/`

#### detector.ts — Pattern detection engine

```typescript
interface PatternMatch {
  id: string;
  patternName: string;
  patternType: "design-pattern" | "anti-pattern" | "inconsistency";
  severity: "info" | "warning" | "critical";
  description: string;
  locations: PatternLocation[];
  suggestion?: string;
}

interface PatternLocation {
  filePath: string;
  fileId: string;
  startLine: number;
  endLine: number;
  symbolName: string | null;
  evidence: string; // why this matches the pattern
}

async function detectPatterns(repoConnectionId: string): Promise<PatternMatch[]>
```

**Patterns to detect (all from DB data, no LLM needed):**

**Design Patterns (info):**
1. **Singleton**: Files exporting a single instance created once (e.g., `export const db = ...`, `let instance = null`)
   - Detection: file has 1 exported variable, no class exports, variable assigned from function call
2. **Factory**: Functions that return different object types based on input
   - Detection: function symbols whose chunks contain `switch`/`if` + `return new` or `return {`
3. **Repository/Service Layer**: Files ending in `service.ts`, `queries.ts`, `repository.ts`
   - Detection: filename pattern + exports functions that query DB
4. **Observer/Event**: Files using EventEmitter, `.on(`, `.emit(`
   - Detection: chunk content grep
5. **Module Pattern**: Files with clear exports grouping (barrel files `index.ts`)

**Anti-Patterns (warning/critical):**
1. **God Class**: Class/file with > 15 methods or > 500 lines
   - Detection: count symbols of kind method/function per file; flag files > 15
2. **Circular Dependencies**: A imports B, B imports A
   - Detection: in symbol_relations, find cycles in import relations
3. **Deep Nesting**: Files with > 3 levels of parentSymbolId nesting
   - Detection: recursive query on symbols.parentSymbolId
4. **Long Parameter List**: Functions with > 5 parameters
   - Detection: parse signature field of symbols
5. **Dead Code**: Symbols that are never referenced by any symbol_relation
   - Detection: symbols with zero incoming relations (excluding entry points like route handlers)

**Inconsistencies (warning):**
1. **Naming Convention Mix**: Some files use camelCase, others snake_case
   - Detection: analyze symbol names per language
2. **Missing Pattern**: If 3+ modules follow a pattern (e.g., service+queries) but 1 doesn't
   - Detection: directory structure analysis
3. **Inconsistent Error Handling**: Some route handlers use try/catch, others don't
   - Detection: chunks in route.ts files, grep for try/catch presence

#### queries.ts — DB queries for pattern detection
```typescript
async function getSymbolsPerFile(repoConnectionId: string): Promise<Map<string, Symbol[]>>
async function getCircularDependencies(repoConnectionId: string): Promise<[string, string][]>
async function getUnreferencedSymbols(repoConnectionId: string): Promise<Symbol[]>
async function getNestingDepths(repoConnectionId: string): Promise<Map<string, number>>
```

Use raw SQL with Drizzle for the circular dependency detection (recursive CTE):
```sql
WITH RECURSIVE dep_chain AS (
  SELECT sr.from_symbol_id, sr.to_symbol_id, ARRAY[sr.from_symbol_id] AS path
  FROM symbol_relations sr WHERE sr.relation_type = 'imports'
  UNION ALL
  SELECT dc.from_symbol_id, sr.to_symbol_id, dc.path || sr.from_symbol_id
  FROM dep_chain dc
  JOIN symbol_relations sr ON sr.from_symbol_id = dc.to_symbol_id
  WHERE sr.relation_type = 'imports'
    AND NOT sr.from_symbol_id = ANY(dc.path)
    AND array_length(dc.path, 1) < 5
)
SELECT * FROM dep_chain WHERE to_symbol_id = from_symbol_id;
```

### 2. API Route

#### GET /api/workspaces/[workspaceId]/repos/[repoId]/patterns
Response:
```json
{
  "patterns": [...],
  "summary": {
    "designPatterns": 5,
    "antiPatterns": 3,
    "inconsistencies": 2,
    "criticalCount": 1
  },
  "cached": true
}
```

Cache in Redis for 10 min.

Create: `src/app/api/workspaces/[workspaceId]/repos/[repoId]/patterns/route.ts`

### 3. UI — Patterns Page
Create `src/app/workspace/[workspaceId]/patterns/page.tsx`

#### PatternReport (`src/components/patterns/pattern-report.tsx`)
Main report view.

**Top section — Summary cards:**
- Design Patterns found (count, blue)
- Anti-Patterns found (count, orange)
- Inconsistencies found (count, yellow)
- Critical Issues (count, red)

**Filter bar:**
- Type filter: Design Pattern / Anti-Pattern / Inconsistency
- Severity filter: Info / Warning / Critical

**Main section — Pattern list:**
Each pattern is an expandable card:
- Header: pattern name + type badge + severity badge + location count
- Expanded: description + suggestion + locations table
- Each location: file path (clickable → code viewer), line range, symbol name, evidence text

#### PatternCard (`src/components/patterns/pattern-card.tsx`)
Individual pattern finding.

Props:
```typescript
interface PatternCardProps {
  pattern: PatternMatch;
  onLocationClick: (filePath: string, line: number) => void;
  defaultExpanded?: boolean;
}
```

### 4. Integration
- Add "Patterns" to sidebar nav
- Critical anti-patterns could show as a badge count on the nav item

## Files to Create
- `src/modules/patterns/detector.ts`
- `src/modules/patterns/queries.ts`
- `src/app/api/workspaces/[workspaceId]/repos/[repoId]/patterns/route.ts`
- `src/app/workspace/[workspaceId]/patterns/page.tsx`
- `src/components/patterns/pattern-report.tsx`
- `src/components/patterns/pattern-card.tsx`

## Files to Modify
- `src/components/layout/sidebar-nav.tsx` — Add "Patterns" nav item (if exists)

## No DB Schema Changes
## No New NPM Packages

## Acceptance Criteria
1. Patterns page loads at `/workspace/{wId}/patterns`
2. At least 3 different design patterns detected (if they exist in the repo)
3. God class detection correctly flags files with 15+ methods
4. Circular dependency detection works
5. Each finding links to the exact code location
6. Clicking a location opens code viewer at that line
7. Severity filtering works
8. Results cached in Redis
9. No false positives on small utility files
10. `npm run build` passes

## What NOT to Do
- Do not use LLM for pattern detection (all heuristic/DB-based)
- Do not install any static analysis tools
- Do not suggest automatic fixes
- Do not modify any existing code files
- Do not create DB tables (read-only analysis)
