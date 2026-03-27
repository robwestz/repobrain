# Shared File Modification Contract

## Purpose
Multiple jobs modify the same files. This contract defines HOW to modify shared files to avoid merge conflicts.

---

## 1. `src/lib/db/schema.ts` — Schema Exports

**Rule**: Each job appends ONE line at the end of the file. Do not reorder existing exports.

Format:
```typescript
// At the end of the file, after all existing exports:
export * from "./schema-bookmarks";    // Job 02
export * from "./schema-threads";      // Job 06
export * from "./schema-onboarding";   // Job 09
export * from "./schema-cross-repo";   // Job 15
```

**Each job creates its own schema file**: `src/lib/db/schema-{feature}.ts`

---

## 2. `src/components/layout/sidebar-nav.tsx` — Navigation Items

**Rule**: Job 01 creates this file with a `NAV_ITEMS` array. Subsequent jobs append items to the array.

If Job 01 hasn't run yet, the job should create its feature page as a standalone page with a simple back-link to the workspace.

NAV_ITEMS order (add items in this order):
```typescript
const NAV_ITEMS: NavItem[] = [
  { id: "explorer", label: "Explorer", icon: "files", href: "" },                    // Job 01
  { id: "search", label: "Search", icon: "search", href: "/search" },                // Job 05
  { id: "galaxy", label: "Galaxy", icon: "network", href: "/galaxy" },               // Job 13
  { id: "architecture", label: "Architecture", icon: "diagram", href: "/architecture" }, // Job 10
  { id: "blast-radius", label: "Blast Radius", icon: "target", href: "/blast-radius" }, // Job 12
  { id: "what-if", label: "What If", icon: "lightbulb", href: "/what-if" },          // Job 14
  { id: "narrator", label: "Narrator", icon: "book", href: "/narrator" },            // Job 11
  { id: "timeline", label: "Timeline", icon: "clock", href: "/timeline" },           // Job 03
  { id: "health", label: "Health", icon: "heart", href: "/health" },                 // Job 04
  { id: "api-map", label: "API Map", icon: "api", href: "/api-map" },               // Job 07
  { id: "patterns", label: "Patterns", icon: "puzzle", href: "/patterns" },          // Job 08
  { id: "discussions", label: "Discussions", icon: "chat", href: "/discussions" },    // Job 06
  { id: "bookmarks", label: "Bookmarks", icon: "bookmark", href: "/bookmarks" },     // Job 02
  { id: "onboarding", label: "Onboarding", icon: "graduation", href: "/onboarding" }, // Job 09
  { id: "cross-repo", label: "Cross-Repo", icon: "link", href: "/cross-repo" },     // Job 15
];
```

---

## 3. `src/components/code-viewer/code-viewer.tsx` — Toolbar Buttons

**Rule**: Jobs add buttons to the code viewer toolbar. Each adds one small button.

Jobs that modify this file:
- Job 02: "Bookmark" button
- Job 03: "History" link
- Job 06: "Start discussion" on line hover
- Job 12: "Impact" button
- Job 13: "Show in Galaxy" button
- Job 14: "What if I change this?" button

Each button should be a small icon button (24x24) in the toolbar area. Use consistent styling.

---

## 4. `src/components/layout/workspace-shell.tsx` — Layout Changes

Jobs that modify this file:
- Job 01: Add breadcrumbs + sidebar
- Job 02: Add bookmarks panel toggle
- Job 06: Add thread panel slide-over
- Job 15: Add repo switcher

**Rule**: Each modification is additive. Do not restructure the existing three-panel layout.

---

## 5. `src/modules/retrieval/index.ts` — Search Function

Only Job 15 modifies this file. It adds an optional `repoConnectionIds` parameter to the `retrieve` function, defaulting to single-repo behavior.

---

## 6. Migration Workflow

Each job that adds DB tables must:
1. Create schema file: `src/lib/db/schema-{feature}.ts`
2. Add export to `src/lib/db/schema.ts`
3. Run: `cd src && npx drizzle-kit generate`
4. Run: `npm run db:migrate`
5. Verify the migration succeeded by checking the table exists

---

## 7. New Page Route Convention

All new feature pages follow this pattern:
```
src/app/workspace/[workspaceId]/{feature}/page.tsx
```

Where `{feature}` matches the sidebar nav href:
- `/search` → `src/app/workspace/[workspaceId]/search/page.tsx`
- `/galaxy` → `src/app/workspace/[workspaceId]/galaxy/page.tsx`
- etc.

Each page is a Next.js server component that:
1. Calls `requireSession()` for auth
2. Fetches workspace + repo data
3. Passes props to a client component

---

## 8. API Route Convention

All new API routes follow existing pattern:
```
src/app/api/workspaces/[workspaceId]/repos/[repoId]/{feature}/route.ts
```

Each route handler:
1. Calls `requireSession()` first
2. Validates workspaceId and repoId
3. Returns JSON with proper status codes
4. Uses try/catch with 500 error responses
