# Job 06: Code Conversations (Anchored Discussions)

## Summary
Persistent discussion threads anchored to specific code regions. Like Google Docs comments but for code. Threads travel with the code — if lines shift due to edits, the anchor updates on re-index. Team members can discuss specific functions, raise concerns, or document decisions directly on the code.

## Size: M (~3h)

## Dependencies: None

## What to Build

### 1. Database Schema
Create `src/lib/db/schema-threads.ts`:

```typescript
import { pgTable, uuid, text, varchar, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { users, repoConnections, files, symbols } from "./schema";

export const codeThreads = pgTable("code_threads", {
  id: uuid("id").defaultRandom().primaryKey(),
  repoConnectionId: uuid("repo_connection_id").notNull().references(() => repoConnections.id, { onDelete: "cascade" }),
  fileId: uuid("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  startLine: integer("start_line").notNull(),
  endLine: integer("end_line").notNull(),
  symbolId: uuid("symbol_id").references(() => symbols.id, { onDelete: "set null" }), // anchor to symbol if possible
  title: varchar("title", { length: 300 }).notNull(),
  status: varchar("status", { length: 20 }).default("open").notNull(), // open, resolved
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

export const codeComments = pgTable("code_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  threadId: uuid("thread_id").notNull().references(() => codeThreads.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

Add to `src/lib/db/schema.ts`:
```typescript
export * from "./schema-threads";
```

### 2. Thread Service
Create `src/modules/threads/`

#### service.ts
```typescript
interface CreateThreadInput {
  repoConnectionId: string;
  fileId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  title: string;
  firstComment: string; // the initial comment content
  userId: string;
}

async function createThread(input: CreateThreadInput): Promise<Thread>
async function addComment(threadId: string, userId: string, content: string): Promise<Comment>
async function resolveThread(threadId: string, userId: string): Promise<Thread>
async function reopenThread(threadId: string, userId: string): Promise<Thread>
async function getThreadsForFile(repoConnectionId: string, filePath: string): Promise<Thread[]>
async function getThreadsForRepo(repoConnectionId: string, status?: "open" | "resolved"): Promise<Thread[]>
async function getThread(threadId: string): Promise<ThreadWithComments>
async function deleteThread(threadId: string, userId: string): Promise<void>
```

When creating a thread:
1. Look up the file in DB to get fileId
2. Check if the line range overlaps with a symbol — if so, set symbolId (this enables the thread to "travel" with the symbol)
3. Create thread + first comment in a transaction

#### queries.ts
Standard Drizzle queries for CRUD operations.

### 3. API Routes

#### GET /api/workspaces/[workspaceId]/repos/[repoId]/threads
Query: `?file=src/lib/auth.ts` (optional, filter by file) `&status=open` (optional)

Response:
```json
{
  "threads": [
    {
      "id": "uuid",
      "filePath": "src/lib/auth.ts",
      "startLine": 15,
      "endLine": 25,
      "title": "Should we add rate limiting here?",
      "status": "open",
      "commentCount": 3,
      "createdBy": { "login": "robin", "avatarUrl": "..." },
      "createdAt": "2024-...",
      "lastCommentAt": "2024-..."
    }
  ]
}
```

#### POST /api/workspaces/[workspaceId]/repos/[repoId]/threads
Request:
```json
{
  "filePath": "src/lib/auth.ts",
  "startLine": 15,
  "endLine": 25,
  "title": "Should we add rate limiting here?",
  "comment": "I think this function is called too frequently without any throttling..."
}
```

#### GET /api/workspaces/[workspaceId]/repos/[repoId]/threads/[threadId]
Returns thread with all comments and user info.

#### POST /api/workspaces/[workspaceId]/repos/[repoId]/threads/[threadId]/comments
Add comment to thread.

#### PATCH /api/workspaces/[workspaceId]/repos/[repoId]/threads/[threadId]
Update thread (resolve/reopen).

#### DELETE /api/workspaces/[workspaceId]/repos/[repoId]/threads/[threadId]
Delete thread (creator only).

### 4. UI Components

#### Thread Markers in Code Viewer
Modify `src/components/code-viewer/code-viewer.tsx`:
- Fetch threads for the currently viewed file
- Show colored markers in the left gutter on lines that have threads
- Open threads: yellow/orange markers
- Resolved threads: green markers (dimmed)
- Clicking a marker opens the thread panel

#### ThreadPanel (`src/components/threads/thread-panel.tsx`)
Side panel showing thread details.

Props:
```typescript
interface ThreadPanelProps {
  thread: ThreadWithComments;
  onClose: () => void;
  onCommentAdded: () => void;
  onStatusChanged: () => void;
}
```

Layout:
- Header: title + status badge + close button
- Code snippet: the anchored code region (highlighted)
- File path + line range
- Comments list (chronological)
- Each comment: avatar + username + timestamp + content
- Input bar at bottom for new comment
- "Resolve" / "Reopen" button

#### ThreadsList (`src/components/threads/threads-list.tsx`)
List of all threads for a repo (used in a dedicated panel or page).

Props:
```typescript
interface ThreadsListProps {
  workspaceId: string;
  repoId: string;
  onThreadClick: (thread: Thread) => void;
}
```

Layout:
- Tabs: "Open" | "Resolved"
- Each item: title, file path, comment count, last activity
- Click → navigate to file + open thread panel

#### NewThreadDialog (`src/components/threads/new-thread-dialog.tsx`)
Dialog for creating a new thread.

Triggered from code viewer — user selects line range, clicks "Start discussion".

Fields:
- Title (required)
- Initial comment (required, textarea)
- Submit button

### 5. Integration
- Add "Discussions" nav item to sidebar (if exists)
- Add thread count badge on the nav item
- In code viewer: add "Start discussion" button (appears when hovering line numbers)
- In workspace shell: thread panel slides in from right when a thread is opened

## Files to Create
- `src/lib/db/schema-threads.ts`
- `src/modules/threads/service.ts`
- `src/modules/threads/queries.ts`
- `src/app/api/workspaces/[workspaceId]/repos/[repoId]/threads/route.ts`
- `src/app/api/workspaces/[workspaceId]/repos/[repoId]/threads/[threadId]/route.ts`
- `src/app/api/workspaces/[workspaceId]/repos/[repoId]/threads/[threadId]/comments/route.ts`
- `src/components/threads/thread-panel.tsx`
- `src/components/threads/threads-list.tsx`
- `src/components/threads/new-thread-dialog.tsx`

## Files to Modify
- `src/lib/db/schema.ts` — Add `export * from "./schema-threads"`
- `src/components/code-viewer/code-viewer.tsx` — Add gutter markers + "Start discussion" button
- `src/components/layout/workspace-shell.tsx` — Add thread panel slide-over

## NPM Packages: None

## Acceptance Criteria
1. User can start a discussion by clicking on line numbers in code viewer
2. Thread appears as a marker in the code gutter
3. Clicking a marker opens the thread panel with all comments
4. Users can add comments to threads
5. Threads can be resolved and reopened
6. Thread list shows all open/resolved threads for the repo
7. Thread creator can delete their thread
8. Thread anchors to a symbol if one exists at that line range
9. `npm run build` passes

## What NOT to Do
- Do not add real-time WebSocket updates (polling on page load is fine)
- Do not add @ mentions or notifications
- Do not add markdown rendering in comments (plain text is fine for now)
- Do not add thread migration when code changes (symbol anchoring is sufficient)
- Do not modify the chat module
