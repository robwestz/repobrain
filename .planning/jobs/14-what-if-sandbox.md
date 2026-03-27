# Job 14: "What If" Sandbox

## Summary
Describe a change in natural language — "What if I remove the rate limiter from the auth module?" or "What if I split the retrieval module into two services?" — and AI + graph analysis predicts the impact. Shows affected files, functions, potential breaks, estimated effort, and risk assessment. A planning tool that answers "should I do this?" before you write a line of code.

## Size: L (~6h)

## Dependencies: Job 12 (Blast Radius) — reuses `analyzeBlastRadius` function. If Job 12 isn't done yet, implement a simplified version of blast radius inline.

## What to Build

### 1. What-If Module
Create `src/modules/what-if/`

#### intent-parser.ts — Parse natural language change descriptions
```typescript
type ChangeType =
  | "remove"       // "remove X", "delete X"
  | "modify"       // "change X", "update X", "refactor X"
  | "add"          // "add X to Y", "create X"
  | "split"        // "split X into Y and Z"
  | "merge"        // "merge X and Y"
  | "move"         // "move X to Y"
  | "replace"      // "replace X with Y"

interface ParsedIntent {
  changeType: ChangeType;
  targetSymbols: string[];  // identified symbol names
  targetFiles: string[];    // identified file paths
  targetModules: string[];  // identified module/directory names
  description: string;      // cleaned description
}

function parseChangeIntent(description: string): ParsedIntent
```

Implementation (heuristic, no LLM):
- Detect verbs: remove/delete → "remove", change/update/refactor → "modify", etc.
- Extract identifiers: camelCase, PascalCase, snake_case, file paths, module names
- Match extracted names against existing symbols/files in DB

#### simulator.ts — Impact simulation
```typescript
interface WhatIfResult {
  changeDescription: string;
  parsedIntent: ParsedIntent;

  // Graph-based analysis
  directlyAffected: AffectedItem[];
  indirectlyAffected: AffectedItem[];
  potentialBreaks: PotentialBreak[];

  // AI analysis
  riskAssessment: "low" | "medium" | "high" | "critical";
  riskExplanation: string;
  estimatedEffort: "trivial" | "small" | "medium" | "large" | "epic";
  recommendations: string[];
  sideEffects: string[];
  prerequisiteChanges: string[]; // "First you'd need to..."

  summary: string; // 2-3 sentence executive summary
}

interface AffectedItem {
  filePath: string;
  symbolName: string | null;
  startLine: number;
  endLine: number;
  impact: string; // "Would break — calls removed function"
  severity: "break" | "warning" | "info";
}

interface PotentialBreak {
  filePath: string;
  symbolName: string;
  reason: string; // "This function calls askQuestion() which would be removed"
  breakType: "compile-error" | "runtime-error" | "behavior-change" | "performance";
}

async function simulateChange(
  repoConnectionId: string,
  description: string
): Promise<WhatIfResult>
```

**Implementation:**

1. **Parse intent** (no LLM)
2. **Resolve targets**: Match symbol/file names against DB
3. **Graph analysis**:
   - For "remove": Use blast radius analysis to find all dependents → all are "potentialBreaks"
   - For "modify": Blast radius but classify as "warning" instead of "break"
   - For "move": Find all importers (symbol_relations with type "imports") → they need updating
   - For "split": Find all callers/importers of the target → each needs to be updated
   - For "add": Find the target location → check for naming conflicts
   - For "merge": Blast radius on both targets → union of impacts
   - For "replace": Blast radius on old target → all need updating
4. **AI enrichment**: Send the graph analysis results + code context to LLM:
```
You are analyzing the impact of a proposed code change.

Proposed change: "{description}"

Targets found:
{symbolName} in {filePath} (lines {start}-{end})
Code: ```{code}```

Directly affected ({count} items):
{list of affected items with their code}

Based on this analysis:
1. What is the overall risk? (low/medium/high/critical) and why?
2. Estimated effort? (trivial/small/medium/large/epic)
3. What side effects might occur that graph analysis wouldn't catch?
4. Any prerequisite changes needed first?
5. Top 3 recommendations for safely making this change.
6. 2-3 sentence executive summary.

Return as JSON.
```
5. **Merge graph + AI results** into final WhatIfResult

### 2. API Route

#### POST /api/workspaces/[workspaceId]/repos/[repoId]/what-if
Request:
```json
{
  "description": "What if I remove the semanticSearch function from the retrieval module?"
}
```

Response: `WhatIfResult` JSON

Create: `src/app/api/workspaces/[workspaceId]/repos/[repoId]/what-if/route.ts`

### 3. UI — What-If Page
Create `src/app/workspace/[workspaceId]/what-if/page.tsx`

#### WhatIfView (`src/components/what-if/what-if-view.tsx`)
Main view component.

**Input section:**
- Large textarea with placeholder: "Describe a change you're considering..."
- Example prompts below (clickable to fill):
  - "What if I remove the {topSymbol} function?"
  - "What if I split the {biggestModule} module?"
  - "What if I replace {techX} with {techY}?"
- "Analyze Impact" button (large, prominent)
- Loading state: "Parsing intent... Analyzing dependencies... Consulting AI..." (3 phases)

**Results section (after analysis):**

**Risk Banner (full width):**
- Color: green (low), yellow (medium), orange (high), red (critical)
- Risk level + explanation
- Effort estimate badge

**Executive Summary card:**
- 2-3 sentences
- Key number: "This change affects X files and Y functions"

**Three-column metrics:**
- Direct impacts (number + list preview)
- Potential breaks (number + list preview)
- Side effects (number + list)

**Impact Details (expandable sections):**

**Section 1 — Potential Breaks:**
- Each break as a card:
  - File path + symbol name (clickable → code viewer)
  - Reason: "This function calls X which would be removed"
  - Break type badge (compile error, runtime error, behavior change)
  - Code snippet showing the dependency

**Section 2 — Directly Affected:**
- Table: File, Symbol, Impact Description, Severity
- Color-coded severity badges

**Section 3 — Recommendations:**
- Numbered list from AI
- "Prerequisite changes" section if any

**Bottom — Action buttons:**
- "Open affected files in Code Viewer" (opens all as tabs)
- "Start a discussion about this" (links to chat or threads)
- "Re-analyze with different description"

#### RiskBanner (`src/components/what-if/risk-banner.tsx`)
Full-width colored banner showing risk assessment.

#### BreakCard (`src/components/what-if/break-card.tsx`)
Individual potential break display.

### 4. Integration
- Add "What If" to sidebar nav with a crystal ball / lightbulb icon
- In code viewer, add "What if I change this?" button that pre-fills the file/symbol
- In blast radius page (Job 12), add "Run What-If analysis" link

## Files to Create
- `src/modules/what-if/intent-parser.ts`
- `src/modules/what-if/simulator.ts`
- `src/app/api/workspaces/[workspaceId]/repos/[repoId]/what-if/route.ts`
- `src/app/workspace/[workspaceId]/what-if/page.tsx`
- `src/components/what-if/what-if-view.tsx`
- `src/components/what-if/risk-banner.tsx`
- `src/components/what-if/break-card.tsx`

## Files to Modify
- `src/components/layout/sidebar-nav.tsx` — Add "What If" nav item (if exists)
- `src/components/code-viewer/code-viewer.tsx` — Add "What if I change this?" button

## No DB Schema Changes
## No New NPM Packages

## Acceptance Criteria
1. What-If page loads at `/workspace/{wId}/what-if`
2. User can type a natural language change description
3. System correctly identifies target symbols/files
4. Blast radius analysis runs and shows impacted items
5. AI provides risk assessment and recommendations
6. Potential breaks are clearly listed with reasons
7. Risk level is reasonable (removing a widely-used function = high risk)
8. Clicking affected items navigates to code viewer
9. Example prompts work and pre-fill the input
10. Analysis completes within 15 seconds
11. `npm run build` passes

## What NOT to Do
- Do not actually modify any files (this is simulation only)
- Do not generate code diffs or patches
- Do not add a "apply this change" feature
- Do not build a complex AST-based change simulation
- Do not modify the ingestion pipeline
