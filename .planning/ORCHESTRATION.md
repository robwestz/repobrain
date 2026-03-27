# RepoBrain Feature Orchestration

## Overview
15 features ordered smallest→largest. Each job is **fully self-contained** — when an agent finishes, the feature is production-ready with no placeholders.

## Wave Plan (parallel execution)

### Wave 1 — Foundation & Small Features (6 agents)
All independent, zero cross-dependencies.

| Job | Feature | Size | Est. |
|-----|---------|------|------|
| 01 | Breadcrumbs + Sidebar Navigation | XS | 30m |
| 02 | Semantic Bookmarks & Annotations | S | 1.5h |
| 03 | Semantic Git Timeline | S | 2h |
| 04 | Code Health Dashboard | M | 3h |
| 05 | Natural Language Code Queries | M | 3h |
| 06 | Code Conversations (anchored) | M | 3h |

### Wave 2 — Analysis Features (5 agents)
Depend on Wave 1 only for sidebar nav (Job 01). If Job 01 isn't done, agents create standalone pages.

| Job | Feature | Size | Depends |
|-----|---------|------|---------|
| 07 | API Surface Map | M | — |
| 08 | Pattern Detective | M | — |
| 09 | Smart Onboarding Paths | M-L | — |
| 10 | Living Architecture Diagrams | L | — |
| 11 | Codebase Narrator | L | — |

### Wave 3 — Graph & Advanced (4 agents)
| Job | Feature | Size | Depends |
|-----|---------|------|---------|
| 12 | Blast Radius Analysis | L | — |
| 13 | Dependency Galaxy | L | — |
| 14 | "What If" Sandbox | L | 12 (reuses blast-radius module) |
| 15 | Cross-Repo Intelligence | XL | — (last, touches schema broadly) |

## Conflict Avoidance Rules

### Database Schema
Each job creates its tables in a **separate schema file**:
```
src/lib/db/schema-{feature}.ts
```
Then adds ONE import line to `src/lib/db/schema.ts`:
```typescript
export * from "./schema-bookmarks";  // Job 02
```
This prevents merge conflicts since each job only appends one line.

### New Pages
Each job creates its page under a new route:
```
src/app/workspace/[workspaceId]/{feature}/page.tsx
```
No job modifies another job's page.

### Sidebar Navigation
Job 01 creates `src/components/layout/sidebar-nav.tsx` with a `NAV_ITEMS` array.
Other jobs add their nav item to the array. If Job 01 isn't done yet, the job creates its page standalone with a back-link.

### Shared Files — Modification Protocol
These files may be modified by multiple jobs. Each job:
1. Reads the CURRENT state of the file
2. Makes ONLY its additions
3. Does NOT reformat or restructure existing code

| Shared File | Who Modifies |
|-------------|-------------|
| `src/lib/db/schema.ts` | All jobs with DB tables (append export) |
| `src/components/layout/sidebar-nav.tsx` | Jobs 02-15 (add nav item) |
| `src/middleware.ts` | Jobs needing public API routes |
| `package.json` | Jobs needing new npm packages |

## Environment
- **Runtime**: Next.js 15 + React 19 + TypeScript
- **DB**: PostgreSQL (DigitalOcean) with Drizzle ORM + pgvector
- **Queue**: BullMQ + Redis Cloud
- **LLM**: OpenAI (default) or Anthropic
- **Styling**: Tailwind CSS (no component library — hand-built components)
- **Auth**: iron-session with GitHub OAuth

## Existing Codebase Map (for agents)
```
src/
├── app/
│   ├── api/
│   │   ├── auth/github/          # OAuth routes
│   │   ├── conversations/        # Chat API
│   │   ├── github/repos/         # Repo listing
│   │   └── workspaces/           # Workspace + repo + files API
│   ├── auth/                     # Login/callback pages
│   ├── dashboard/                # User dashboard
│   └── workspace/[workspaceId]/  # Main workspace page
├── components/
│   ├── chat/                     # ChatPane, InputBar, Message, CitationBadge
│   ├── code-viewer/              # CodeViewer, TabBar, AskAboutFile
│   ├── file-tree/                # FileTree, FileNode, FileSearch
│   ├── layout/                   # WorkspaceShell
│   └── workspace/                # RepoPicker, IndexProgress, EmptyState
├── lib/
│   ├── db/
│   │   ├── schema.ts             # All Drizzle table definitions
│   │   ├── index.ts              # DB connection (ssl for DO)
│   │   └── migrate.ts            # Migration runner
│   ├── auth.ts                   # getSession, requireSession
│   └── redis.ts                  # ioredis singleton
├── modules/
│   ├── chat/                     # service.ts, queries.ts
│   ├── github/                   # oauth.ts, repos.ts, clone.ts
│   ├── ingestion/                # walker, symbols, relations, chunker, embedder
│   ├── llm/                      # provider, prompt, citations, stream
│   ├── retrieval/                # semantic, lexical, structural, ranker, context
│   └── workspace/                # service.ts, queries.ts
├── types/
│   ├── domain.ts                 # Core domain types
│   ├── api.ts                    # Request/response types
│   └── retrieval.ts              # Retrieval pipeline types
└── workers/
    ├── index.ts                  # Worker bootstrap
    ├── clone.worker.ts           # Git clone jobs
    └── ingest.worker.ts          # Indexing pipeline jobs
```

## Auth Pattern (copy this in every API route)
```typescript
import { requireSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await requireSession();  // throws redirect if not authed
  // session.userId is the current user
}
```

## DB Pattern (Drizzle)
```typescript
import { db } from "@/lib/db";
import { myTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const rows = await db.select().from(myTable).where(eq(myTable.id, id));
await db.insert(myTable).values({ ... }).returning();
```

## QA Gates (every job must pass ALL)
1. `npm run build` succeeds with zero errors
2. Feature is accessible via UI (page loads, no blank screens)
3. No regressions — existing chat, file tree, code viewer still work
4. No hardcoded IDs, URLs, or test data in committed code
5. All new API routes require authentication (use requireSession)
6. New DB tables have proper indexes and foreign keys
7. No console.log in production code (use structured logging if needed)
