# Job 05: Natural Language Code Queries

## Summary
A dedicated search page where users type natural language questions like "find all places where we make HTTP calls without error handling" and get structured, filterable code results. Different from chat — this returns search results, not a conversation. Uses the existing retrieval pipeline (semantic + lexical + structural) with enhanced intent classification and result presentation.

## Size: M (~3h)

## Dependencies: None

## What to Build

### 1. Query Classifier Module
Create `src/modules/search/`

#### classifier.ts — Intent classification
```typescript
type QueryIntent =
  | "find_code"       // "find all error handlers"
  | "find_pattern"    // "show me singleton patterns"
  | "find_usage"      // "where is getUserById called?"
  | "find_definition" // "where is the User type defined?"
  | "find_similar"    // "find code similar to this function"
  | "find_missing"    // "which files don't have error handling?"
  | "general"         // fallback

interface ClassifiedQuery {
  intent: QueryIntent;
  normalizedQuery: string; // cleaned for retrieval
  symbolCandidates: string[]; // extracted identifiers
  fileFilter?: string; // extracted file pattern like "*.ts"
  languageFilter?: string; // extracted language
}

function classifyQuery(rawQuery: string): ClassifiedQuery
```

Implementation: **No LLM call needed** — use heuristics:
- "where is X defined/declared" → `find_definition`
- "where/how is X used/called" → `find_usage`
- "find/show/list all X" → `find_code`
- "similar to" → `find_similar`
- "without/missing/lacking" → `find_missing`
- Extract identifiers: camelCase, snake_case, PascalCase, quoted strings
- Extract file patterns: "in *.tsx files", "in the api folder"

#### search-service.ts — Enhanced search orchestrator
```typescript
interface SearchResult {
  fileId: string;
  filePath: string;
  language: string | null;
  startLine: number;
  endLine: number;
  content: string; // the matching code
  symbolName: string | null;
  symbolKind: string | null;
  relevanceScore: number;
  matchReason: string; // "semantic match", "symbol definition", "keyword match"
}

interface SearchResponse {
  query: string;
  intent: QueryIntent;
  results: SearchResult[];
  totalResults: number;
  durationMs: number;
  suggestions?: string[]; // "Did you mean...", "Try also..."
}

async function search(
  query: string,
  repoConnectionId: string,
  options?: { limit?: number; fileFilter?: string; languageFilter?: string; offset?: number }
): Promise<SearchResponse>
```

Implementation:
1. Classify query
2. Based on intent:
   - `find_definition`: Use structural search with symbol name, filter to definition symbols
   - `find_usage`: Use structural search traversing `calls`/`uses`/`imports` relations
   - `find_code`: Use full retrieval pipeline (semantic + lexical + structural)
   - `find_missing`: Use retrieval, then INVERT — find files NOT in results
   - `general`: Use full retrieval pipeline
3. Apply file/language filters
4. Return deduplicated, sorted results

### 2. API Route

#### POST /api/workspaces/[workspaceId]/repos/[repoId]/search
Request:
```json
{
  "query": "find all API route handlers that don't validate input",
  "limit": 30,
  "offset": 0,
  "fileFilter": "*.ts",
  "languageFilter": "typescript"
}
```

Response:
```json
{
  "query": "find all API route handlers...",
  "intent": "find_missing",
  "results": [...],
  "totalResults": 12,
  "durationMs": 450,
  "suggestions": ["Try: 'find input validation functions'"]
}
```

Create: `src/app/api/workspaces/[workspaceId]/repos/[repoId]/search/route.ts`

### 3. UI — Search Page
Create `src/app/workspace/[workspaceId]/search/page.tsx`

#### SearchView (`src/components/search/search-view.tsx`)
Full-page search interface.

**Top section — Search bar:**
- Large text input with placeholder "Ask about your code in natural language..."
- Search button (or Enter to search)
- Below input: detected intent pill ("Finding definitions", "Searching code", etc.)
- Filter chips: Language dropdown, file path pattern input

**Results section:**
- Count header: "12 results in 450ms"
- Each result is a card:
  - File path + line range (clickable → code viewer)
  - Language badge
  - Symbol name and kind (if applicable)
  - Code snippet with syntax highlighting (use existing shiki setup)
  - Relevance score bar (subtle)
  - Match reason tag: "semantic", "structural", "keyword"
- Pagination: "Load more" button

**Empty state:**
- "No results found. Try rephrasing your query or broadening your search."
- Suggested queries based on repo symbols

**Loading state:**
- Skeleton cards while searching

#### SearchResultCard (`src/components/search/search-result-card.tsx`)
Individual result card.

Props:
```typescript
interface SearchResultCardProps {
  result: SearchResult;
  onFileClick: (filePath: string, line: number) => void;
}
```

The code snippet should use `shiki` for syntax highlighting (already used in code-viewer). Use a simplified version — just highlight the matching code block.

### 4. Integration
- If sidebar exists (Job 01), add "Search" nav item
- Add keyboard shortcut: Cmd+K or Ctrl+K opens search page (optional)
- Link from workspace page if no sidebar yet

## Files to Create
- `src/modules/search/classifier.ts`
- `src/modules/search/search-service.ts`
- `src/app/api/workspaces/[workspaceId]/repos/[repoId]/search/route.ts`
- `src/app/workspace/[workspaceId]/search/page.tsx`
- `src/components/search/search-view.tsx`
- `src/components/search/search-result-card.tsx`

## Files to Modify
- `src/components/layout/sidebar-nav.tsx` — Add "Search" nav item (if exists)

## No DB Changes
## No New NPM Packages

## Acceptance Criteria
1. Search page loads at `/workspace/{wId}/search`
2. Natural language query returns relevant code results
3. Intent is correctly classified and displayed
4. "find definition of X" returns the actual definition
5. "where is X used" returns call sites
6. Results show syntax-highlighted code snippets
7. Clicking a result navigates to file in code viewer at correct line
8. File and language filters work
9. Search completes in < 5 seconds
10. `npm run build` passes

## What NOT to Do
- Do not build this as a chat interface (it's structured search)
- Do not call LLM for query classification (heuristics only)
- Do not modify the existing retrieval module — import and use it
- Do not add new DB tables
- Do not build autocomplete/typeahead (future enhancement)
