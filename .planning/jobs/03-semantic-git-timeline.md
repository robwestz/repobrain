# Job 03: Semantic Git Timeline

## Summary
Instead of raw git log, show an AI-summarized timeline of what actually changed semantically. "Added rate limiting to login" instead of "modified 15 lines in auth.ts". Groups related commits, highlights breaking changes, and links to affected symbols.

## Size: S (~2h)

## Dependencies: None

## What to Build

### 1. Git Timeline Module
Create `src/modules/git-timeline/`

#### service.ts
Main orchestrator:
```typescript
interface TimelineEntry {
  id: string; // SHA
  sha: string;
  shortSha: string;
  date: string; // ISO
  author: string;
  originalMessage: string;
  semanticSummary: string; // AI-generated
  impactLevel: "minor" | "moderate" | "major"; // AI-classified
  affectedFiles: { path: string; additions: number; deletions: number }[];
  affectedSymbols: string[]; // symbol names detected from diff
  tags: string[]; // AI-generated: ["auth", "refactor", "bugfix", "feature", "deps"]
}

interface TimelineOptions {
  limit?: number; // default 50
  since?: string; // ISO date
  filePath?: string; // filter to specific file
}

async function getTimeline(repoConnectionId: string, options?: TimelineOptions): Promise<TimelineEntry[]>
```

Implementation:
1. Get `clonePath` from repo_connections table
2. Run `git log --format=...` with `simple-git` (already installed)
3. For each commit, get `git diff --stat` and `git diff --name-only`
4. Batch commits in groups of 10
5. Send each batch to LLM: "Summarize these commits semantically. For each, provide a one-line summary, impact level, and tags."
6. Parse LLM response and merge with git data
7. Cache results in Redis (key: `timeline:{repoConnectionId}`, TTL: 10 min)

#### symbol-matcher.ts
Match diff hunks to known symbols:
```typescript
async function matchDiffToSymbols(
  repoConnectionId: string,
  filePath: string,
  changedLines: number[]
): Promise<string[]> // Returns symbol names that overlap with changed lines
```

Uses the existing `symbols` table — finds symbols where startLine/endLine overlap with changed line ranges.

### 2. API Route

#### GET /api/workspaces/[workspaceId]/repos/[repoId]/timeline
Query params: `limit=50`, `since=2024-01-01`, `file=src/lib/auth.ts`

Response:
```json
{
  "entries": [
    {
      "sha": "abc123",
      "shortSha": "abc123",
      "date": "2024-03-15T10:30:00Z",
      "author": "robin",
      "originalMessage": "fix: handle edge case in session validation",
      "semanticSummary": "Fixed a bug where expired sessions were not properly rejected, causing silent auth failures",
      "impactLevel": "major",
      "affectedFiles": [
        { "path": "src/lib/auth.ts", "additions": 12, "deletions": 3 }
      ],
      "affectedSymbols": ["requireSession", "validateToken"],
      "tags": ["bugfix", "auth", "security"]
    }
  ],
  "total": 142,
  "cached": true
}
```

Create: `src/app/api/workspaces/[workspaceId]/repos/[repoId]/timeline/route.ts`

### 3. UI Components

#### TimelinePage
Create `src/app/workspace/[workspaceId]/timeline/page.tsx`

Server component that fetches initial data, passes to client component.

#### TimelineView (`src/components/timeline/timeline-view.tsx`)
Main timeline component.

Layout:
- Vertical timeline with entries on alternating left/right
- Each entry is a card showing:
  - Date + author on the timeline line
  - Semantic summary (bold)
  - Original commit message (smaller, gray)
  - Impact indicator: green dot (minor), yellow (moderate), red (major)
  - Tag pills: colored badges for each tag
  - Affected files list (collapsible)
  - Affected symbols (clickable — navigate to code viewer)
- Filter bar at top:
  - Impact level filter (checkboxes)
  - Tag filter (clickable pills)
  - Date range picker (simple from/to inputs)
  - File filter (text input with autocomplete from file list)
- "Load more" button at bottom
- Loading skeleton while AI summarizes

#### TimelineEntry (`src/components/timeline/timeline-entry.tsx`)
Individual entry card.

Props:
```typescript
interface TimelineEntryProps {
  entry: TimelineEntry;
  onFileClick: (path: string) => void;
  onSymbolClick: (symbolName: string) => void;
}
```

### 4. File-Scoped Timeline
When viewing a file in code viewer, show a "History" button that links to the timeline filtered for that file:
```
/workspace/{wId}/timeline?file=src/lib/auth.ts
```

Modify `src/components/code-viewer/code-viewer.tsx`:
- Add a small "History" link/button in the file header
- Links to timeline page filtered by current file

## Files to Create
- `src/modules/git-timeline/service.ts`
- `src/modules/git-timeline/symbol-matcher.ts`
- `src/app/api/workspaces/[workspaceId]/repos/[repoId]/timeline/route.ts`
- `src/app/workspace/[workspaceId]/timeline/page.tsx`
- `src/components/timeline/timeline-view.tsx`
- `src/components/timeline/timeline-entry.tsx`

## Files to Modify
- `src/components/code-viewer/code-viewer.tsx` — Add "History" button
- `src/components/layout/sidebar-nav.tsx` — Add "Timeline" nav item (if exists from Job 01)

## NPM Packages: None (simple-git already installed)

## Acceptance Criteria
1. Timeline page loads at `/workspace/{wId}/timeline`
2. Shows AI-summarized commit entries (not raw git messages)
3. Each entry shows impact level, tags, affected files, affected symbols
4. Filtering by impact level works
5. Filtering by file path works
6. Clicking a file name navigates to code viewer
7. Clicking a symbol name navigates to the symbol in code viewer
8. "History" button on code viewer links to file-filtered timeline
9. Results are cached in Redis (subsequent loads are fast)
10. `npm run build` passes

## What NOT to Do
- Do not build a full git blame view (that's different)
- Do not modify the ingestion pipeline
- Do not store timeline data in PostgreSQL (Redis cache is sufficient)
- Do not process more than 200 commits per request (paginate)
- Do not make LLM calls synchronously — return raw entries first, enrich asynchronously if needed
