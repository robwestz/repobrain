# Job 02: Semantic Bookmarks & Annotations

## Summary
Users can bookmark code regions with AI-generated context summaries. Bookmarks persist across sessions and are searchable. Think of it as "smart favorites" — each bookmark captures not just the location but the semantic meaning of why it matters.

## Size: S (~1.5h)

## Dependencies: None

## What to Build

### 1. Database Schema
Create `src/lib/db/schema-bookmarks.ts`:

```typescript
import { pgTable, uuid, text, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { users, repoConnections, files } from "./schema";

export const bookmarks = pgTable("bookmarks", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  repoConnectionId: uuid("repo_connection_id").notNull().references(() => repoConnections.id, { onDelete: "cascade" }),
  fileId: uuid("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  startLine: integer("start_line").notNull(),
  endLine: integer("end_line").notNull(),
  title: varchar("title", { length: 200 }).notNull(), // User-editable or AI-generated
  note: text("note"), // User's own annotation
  aiContext: text("ai_context"), // AI-generated explanation of what this code does
  color: varchar("color", { length: 20 }).default("blue"), // blue, green, yellow, red, purple
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

Add to `src/lib/db/schema.ts`:
```typescript
export * from "./schema-bookmarks";
```

Create migration: `npm run db:generate` then `npm run db:migrate`.

### 2. API Routes

#### GET /api/workspaces/[workspaceId]/repos/[repoId]/bookmarks
List all bookmarks for a repo. Returns bookmarks ordered by createdAt DESC.

Response:
```json
{
  "bookmarks": [
    {
      "id": "uuid",
      "filePath": "src/lib/auth.ts",
      "startLine": 15,
      "endLine": 30,
      "title": "Session validation logic",
      "note": "Key auth flow — check this when debugging login issues",
      "aiContext": "This function validates the iron-session cookie and extracts the user ID...",
      "color": "blue",
      "createdAt": "2024-..."
    }
  ]
}
```

#### POST /api/workspaces/[workspaceId]/repos/[repoId]/bookmarks
Create a bookmark. If no `title` provided, auto-generate one via LLM.

Request body:
```json
{
  "fileId": "uuid",
  "filePath": "src/lib/auth.ts",
  "startLine": 15,
  "endLine": 30,
  "title": "optional — AI generates if empty",
  "note": "optional user note",
  "color": "blue"
}
```

On creation:
1. Save bookmark immediately (don't block on AI)
2. In background, generate `aiContext` by:
   - Fetching the code content for those lines
   - Sending to LLM: "Summarize what this code does in 1-2 sentences: ```{code}```"
   - Updating the bookmark with the AI response

#### DELETE /api/workspaces/[workspaceId]/repos/[repoId]/bookmarks/[bookmarkId]
Delete a bookmark. Verify ownership (userId matches session).

#### PATCH /api/workspaces/[workspaceId]/repos/[repoId]/bookmarks/[bookmarkId]
Update title, note, or color.

### 3. UI Components

#### BookmarkButton (`src/components/code-viewer/bookmark-button.tsx`)
A small bookmark icon button shown in the code viewer gutter or toolbar.

Props:
```typescript
interface BookmarkButtonProps {
  workspaceId: string;
  repoId: string;
  fileId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  existingBookmark?: Bookmark; // if already bookmarked, show filled icon
  onBookmarkCreated: (bookmark: Bookmark) => void;
  onBookmarkRemoved: (bookmarkId: string) => void;
}
```

Behavior:
- Shows outline bookmark icon by default
- Click → creates bookmark (filled icon)
- Click again on filled → removes bookmark
- Optional: small popup to add note/color before saving

#### BookmarksPanel (`src/components/workspace/bookmarks-panel.tsx`)
A list panel showing all bookmarks for the current repo.

Props:
```typescript
interface BookmarksPanelProps {
  workspaceId: string;
  repoId: string;
  onBookmarkClick: (bookmark: Bookmark) => void; // navigate to file + line
}
```

Layout:
- Search/filter bar at top
- List of bookmarks grouped by file
- Each item shows: title, file:line range, color dot, note preview
- Click → opens file in code viewer at that line
- Hover → shows full AI context
- Delete button (trash icon) on hover

### 4. Integration with Code Viewer
Modify `src/components/code-viewer/code-viewer.tsx`:
- Add a "Bookmark" button in the top toolbar (next to file name)
- When clicked, bookmarks the currently visible code range (or selected range if selection exists)
- Show a small colored marker in the gutter for bookmarked lines

### 5. Integration with Workspace Shell
Modify `src/components/layout/workspace-shell.tsx`:
- Add a "Bookmarks" tab/button that toggles the BookmarksPanel
- Could replace the file tree temporarily, or show as a slide-over panel

## Files to Create
- `src/lib/db/schema-bookmarks.ts`
- `src/app/api/workspaces/[workspaceId]/repos/[repoId]/bookmarks/route.ts` (GET, POST)
- `src/app/api/workspaces/[workspaceId]/repos/[repoId]/bookmarks/[bookmarkId]/route.ts` (DELETE, PATCH)
- `src/components/code-viewer/bookmark-button.tsx`
- `src/components/workspace/bookmarks-panel.tsx`
- `src/modules/bookmarks/service.ts` (CRUD + AI context generation)
- `src/modules/bookmarks/queries.ts` (DB queries)

## Files to Modify
- `src/lib/db/schema.ts` — Add `export * from "./schema-bookmarks"`
- `src/components/code-viewer/code-viewer.tsx` — Add bookmark button to toolbar
- `src/components/layout/workspace-shell.tsx` — Add bookmarks panel toggle

## NPM Packages: None (uses existing OpenAI SDK)

## Acceptance Criteria
1. User can click bookmark icon in code viewer → bookmark is created
2. Bookmarks panel lists all bookmarks for the repo
3. Clicking a bookmark opens the file at that line in code viewer
4. AI-generated context appears on bookmark within a few seconds
5. User can add/edit notes and change color
6. User can delete bookmarks
7. Bookmarks persist across page refreshes (stored in DB)
8. `npm run build` passes
9. Existing file tree, chat, and code viewer work normally

## What NOT to Do
- Do not add real-time collaboration (bookmarks are per-user)
- Do not build a search-within-bookmarks AI feature
- Do not modify the chat module
- Do not add bookmark sharing between users
