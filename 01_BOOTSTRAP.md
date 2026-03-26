# RepoBrain — Implementation Bootstrap

> Source of truth: `00_MASTER_PACKAGE.md`
> This document translates the master package into executable implementation steps.

---

## 1. Recommended Repository / App Structure

```
repobrain/
├── .env.example                    # All required env vars documented
├── .gitignore
├── docker-compose.yml              # Postgres (pgvector) + Redis
├── drizzle.config.ts               # Drizzle ORM configuration
├── next.config.ts                  # Next.js config
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
│
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── layout.tsx              # Root layout (font, providers)
│   │   ├── page.tsx                # Landing / redirect to dashboard
│   │   ├── globals.css             # Tailwind base
│   │   │
│   │   ├── auth/
│   │   │   ├── login/page.tsx      # Login page with GitHub button
│   │   │   └── callback/page.tsx   # OAuth callback handler (client)
│   │   │
│   │   ├── dashboard/
│   │   │   └── page.tsx            # Workspace list
│   │   │
│   │   ├── workspace/
│   │   │   └── [workspaceId]/
│   │   │       ├── page.tsx        # Three-panel workspace view
│   │   │       └── layout.tsx      # Workspace layout shell
│   │   │
│   │   └── api/                    # API Routes
│   │       ├── auth/
│   │       │   ├── github/route.ts         # GET: redirect to GitHub OAuth
│   │       │   ├── github/callback/route.ts # GET: exchange code for token
│   │       │   ├── session/route.ts        # GET: current session
│   │       │   └── logout/route.ts         # POST: destroy session
│   │       │
│   │       ├── workspaces/
│   │       │   ├── route.ts                # GET: list, POST: create
│   │       │   └── [workspaceId]/
│   │       │       ├── route.ts            # GET: workspace detail
│   │       │       └── repos/
│   │       │           ├── route.ts        # GET: list, POST: connect
│   │       │           └── [repoId]/
│   │       │               ├── route.ts           # GET: repo detail + status
│   │       │               ├── files/route.ts     # GET: file tree
│   │       │               ├── files/[...path]/route.ts # GET: file content
│   │       │               └── index-status/route.ts    # GET: index progress
│   │       │
│   │       ├── conversations/
│   │       │   ├── route.ts                # GET: list, POST: create
│   │       │   └── [conversationId]/
│   │       │       ├── route.ts            # GET: conversation with messages
│   │       │       └── messages/route.ts   # POST: ask question (SSE stream)
│   │       │
│   │       ├── github/
│   │       │   └── repos/route.ts          # GET: list user's GitHub repos
│   │       │
│   │       └── changes/
│   │           └── route.ts                # ALL methods → 501 stub
│   │
│   ├── lib/                        # Shared library code
│   │   ├── db/
│   │   │   ├── index.ts            # Drizzle client singleton
│   │   │   ├── schema.ts           # All Drizzle table definitions
│   │   │   └── migrate.ts          # Migration runner script
│   │   │
│   │   ├── redis.ts                # Redis client singleton (ioredis)
│   │   ├── auth.ts                 # Session helpers (iron-session)
│   │   └── env.ts                  # Typed env var access (zod validated)
│   │
│   ├── modules/                    # Domain modules (§09 boundaries)
│   │   ├── github/
│   │   │   ├── oauth.ts            # getAuthorizationUrl, exchangeCodeForToken
│   │   │   ├── repos.ts            # listUserRepos, getRepoMetadata
│   │   │   └── clone.ts            # cloneRepo
│   │   │
│   │   ├── workspace/
│   │   │   ├── service.ts          # createWorkspace, connectRepo, getWorkspace
│   │   │   └── queries.ts          # DB queries for workspace/repo
│   │   │
│   │   ├── ingestion/
│   │   │   ├── index.ts            # indexRepo entry point
│   │   │   ├── walker.ts           # File tree walker (skip binary/vendor)
│   │   │   ├── language.ts         # Language detection
│   │   │   ├── symbols.ts          # tree-sitter symbol extraction
│   │   │   ├── relations.ts        # Symbol relationship builder
│   │   │   ├── chunker.ts          # Symbol-aware chunking
│   │   │   ├── embedder.ts         # Embedding generation (batched)
│   │   │   └── progress.ts         # Job progress reporting
│   │   │
│   │   ├── retrieval/
│   │   │   ├── index.ts            # retrieve() entry point
│   │   │   ├── semantic.ts         # pgvector k-NN search
│   │   │   ├── lexical.ts          # Postgres FTS search
│   │   │   ├── structural.ts       # Symbol graph traversal
│   │   │   ├── ranker.ts           # Score normalization + merge
│   │   │   └── context.ts          # Context assembly for LLM
│   │   │
│   │   ├── llm/
│   │   │   ├── index.ts            # generateAnswer entry point
│   │   │   ├── prompt.ts           # System prompt + prompt construction
│   │   │   ├── provider.ts         # Anthropic Claude client wrapper
│   │   │   ├── citations.ts        # Citation parser + validator
│   │   │   └── stream.ts           # SSE streaming helpers
│   │   │
│   │   ├── chat/
│   │   │   ├── service.ts          # askQuestion, getConversation, listConversations
│   │   │   └── queries.ts          # DB queries for conversations/messages
│   │   │
│   │   └── changes/
│   │       └── stub.ts             # Returns 501 for all operations
│   │
│   ├── workers/                    # BullMQ background workers
│   │   ├── index.ts                # Worker bootstrap (run separately)
│   │   ├── clone.worker.ts         # Clone repo job processor
│   │   ├── ingest.worker.ts        # Ingestion pipeline job processor
│   │   └── summary.worker.ts       # Repo summary generation job
│   │
│   ├── components/                 # React components
│   │   ├── ui/                     # shadcn/ui primitives
│   │   ├── layout/
│   │   │   ├── workspace-shell.tsx # Three-panel layout container
│   │   │   ├── left-panel.tsx      # File tree panel
│   │   │   ├── center-panel.tsx    # Code viewer panel
│   │   │   └── right-panel.tsx     # Chat panel
│   │   │
│   │   ├── file-tree/
│   │   │   ├── file-tree.tsx       # Collapsible tree component
│   │   │   ├── file-node.tsx       # Individual file/folder node
│   │   │   └── file-search.tsx     # Filter input
│   │   │
│   │   ├── code-viewer/
│   │   │   ├── code-viewer.tsx     # Syntax-highlighted viewer
│   │   │   ├── line-highlight.tsx  # Citation highlight overlay
│   │   │   ├── tab-bar.tsx         # Open files tab bar
│   │   │   └── ask-about-file.tsx  # "Ask about this file" button
│   │   │
│   │   ├── chat/
│   │   │   ├── chat-pane.tsx       # Chat container
│   │   │   ├── message.tsx         # Single message (user or assistant)
│   │   │   ├── citation-badge.tsx  # Clickable citation chip
│   │   │   ├── input-bar.tsx       # Question input
│   │   │   └── streaming-indicator.tsx
│   │   │
│   │   ├── auth/
│   │   │   └── github-button.tsx   # "Sign in with GitHub" button
│   │   │
│   │   └── workspace/
│   │       ├── repo-picker.tsx     # GitHub repo selection dialog
│   │       ├── index-progress.tsx  # Indexing progress bar
│   │       └── empty-state.tsx     # "Connect a repo" prompt
│   │
│   └── types/                      # Shared TypeScript types
│       ├── domain.ts               # Entity types matching §05
│       ├── api.ts                  # API request/response types
│       └── retrieval.ts            # RetrievalResult, RankedChunk, etc.
│
├── drizzle/                        # Generated migrations
│   └── 0000_initial.sql
│
├── repos/                          # Blob storage: cloned repos (gitignored)
│
└── scripts/
    ├── seed.ts                     # Dev seed data
    └── test-retrieval.ts           # Manual retrieval quality testing
```

---

## 2. Workstream Decomposition

### WS1: Project Skeleton + Auth
**Owner output**: Runnable Next.js app with GitHub OAuth, session management, protected routes, database with full schema, Redis connection, BullMQ queue setup, Docker Compose for infra.

**Concrete deliverables**:
- `package.json` with all dependencies
- `docker-compose.yml` (Postgres 16 + pgvector, Redis 7)
- `src/lib/db/schema.ts` — ALL tables from §05 (including Phase 3 stubs)
- `src/lib/db/index.ts` — Drizzle client
- `drizzle.config.ts` + initial migration
- `src/lib/redis.ts` — ioredis client
- `src/lib/auth.ts` — iron-session config
- `src/lib/env.ts` — zod-validated env vars
- `src/app/api/auth/*` — GitHub OAuth routes
- `src/modules/github/oauth.ts` — OAuth helpers
- `src/app/layout.tsx` — root layout with Tailwind
- `src/app/auth/login/page.tsx` — login page
- `.env.example` — documented env vars

**Packages to install**:
```
next@14 react react-dom typescript @types/react @types/node
tailwindcss postcss autoprefixer
drizzle-orm @neondatabase/serverless pg
drizzle-kit
ioredis
bullmq
iron-session
zod
@anthropic-ai/sdk
openai (for embeddings)
```

### WS2: Workspace + Repo Connection
**Owner output**: User can create workspace, list GitHub repos, connect one, trigger clone job, see clone status.

**Concrete deliverables**:
- `src/modules/workspace/service.ts` — CRUD operations
- `src/modules/workspace/queries.ts` — DB access
- `src/modules/github/repos.ts` — listUserRepos, getRepoMetadata
- `src/modules/github/clone.ts` — cloneRepo (simple-git)
- `src/workers/clone.worker.ts` — BullMQ job processor
- `src/app/api/workspaces/*` — REST endpoints
- `src/app/api/github/repos/route.ts` — list repos
- `src/app/dashboard/page.tsx` — workspace list
- `src/components/workspace/repo-picker.tsx`
- `src/components/workspace/empty-state.tsx`

**Additional packages**:
```
simple-git
```

### WS3: Ingestion Pipeline
**Owner output**: Cloned repo is parsed into files, symbols, symbol relations, chunks, and embeddings stored in Postgres/pgvector. Index job reports progress.

**Concrete deliverables**:
- `src/modules/ingestion/walker.ts` — recursive file walk, skip rules
- `src/modules/ingestion/language.ts` — extension-based detection
- `src/modules/ingestion/symbols.ts` — tree-sitter extraction
- `src/modules/ingestion/relations.ts` — import/export edge building
- `src/modules/ingestion/chunker.ts` — symbol-aware chunking (~500 tokens, 50-token overlap)
- `src/modules/ingestion/embedder.ts` — OpenAI text-embedding-3-small, batched (100/batch)
- `src/modules/ingestion/progress.ts` — Redis-backed progress reporting
- `src/modules/ingestion/index.ts` — orchestrator
- `src/workers/ingest.worker.ts` — BullMQ job processor
- `src/app/api/workspaces/[workspaceId]/repos/[repoId]/index-status/route.ts`

**Additional packages**:
```
web-tree-sitter
tree-sitter-javascript
tree-sitter-typescript
tree-sitter-python
tree-sitter-go
tree-sitter-rust
tree-sitter-java
tiktoken (for token counting)
```

**Skip rules for walker** (files/dirs to exclude):
```
node_modules, .git, vendor, dist, build, __pycache__,
.next, .nuxt, coverage, .cache,
*.min.js, *.min.css, *.map, *.lock, package-lock.json,
yarn.lock, pnpm-lock.yaml, *.png, *.jpg, *.jpeg, *.gif,
*.ico, *.svg, *.woff, *.woff2, *.ttf, *.eot, *.mp4,
*.webm, *.zip, *.tar, *.gz, *.pdf, *.exe, *.dll, *.so,
*.dylib, *.pyc, *.class, *.o, *.obj
```

### WS4: Retrieval Engine
**Owner output**: Given a question + repo_connection_id, returns ranked chunks from semantic + lexical + structural search, merged and assembled into LLM-ready context.

**Concrete deliverables**:
- `src/modules/retrieval/semantic.ts` — embed query, pgvector `<=>` cosine distance, k=20
- `src/modules/retrieval/lexical.ts` — `ts_vector`/`ts_query` + `pg_trgm` fallback
- `src/modules/retrieval/structural.ts` — symbol name extraction from question, graph traversal 1-2 hops
- `src/modules/retrieval/ranker.ts` — normalize scores 0-1, weighted merge (0.45/0.30/0.25), intersection bonus +0.15, dedup, top-K
- `src/modules/retrieval/context.ts` — assemble repo summary + ranked chunks + file headers into prompt string
- `src/modules/retrieval/index.ts` — `retrieve()` function matching §09 contract
- Retrieval options support: `filePath` scope (file-scoped Q&A with +0.3 boost per §06) and `depth` control (top-K override)
- File-scoped retrieval: when `filePath` is set, include full file content + symbols defined in file + files that import from it (per §06)
- Unit tests with fixture data: 10+ test queries against a seeded test repo snapshot in `scripts/test-retrieval.ts`

### WS5: LLM + Chat
**Owner output**: User asks a question via chat, system retrieves context, calls Claude, streams cited answer, persists conversation.

**Concrete deliverables**:
- `src/modules/llm/provider.ts` — Anthropic Claude client (claude-sonnet-4-20250514)
- `src/modules/llm/prompt.ts` — system prompt with citation instructions (exact format from §06)
- `src/modules/llm/citations.ts` — regex parser for `[file:path:L##-L##]`, validator against file records
- `src/modules/llm/stream.ts` — SSE encoding helpers
- `src/modules/llm/index.ts` — `generateAnswer()` async generator matching §09
- `src/modules/chat/service.ts` — `askQuestion()` orchestration: retrieve → generate → persist
- `src/modules/chat/queries.ts` — conversation/message DB operations
- `src/app/api/conversations/*` — REST + SSE endpoints
- `src/components/chat/chat-pane.tsx`
- `src/components/chat/message.tsx`
- `src/components/chat/citation-badge.tsx`
- `src/components/chat/input-bar.tsx`
- `src/components/chat/streaming-indicator.tsx`

### WS6: File Tree + Code Viewer
**Owner output**: User browses file tree, clicks file to view syntax-highlighted code, clicks citation to jump to highlighted line range.

**Concrete deliverables**:
- `src/app/api/workspaces/[workspaceId]/repos/[repoId]/files/route.ts` — nested tree from File records
- `src/app/api/workspaces/[workspaceId]/repos/[repoId]/files/[...path]/route.ts` — raw file content from blob storage
- `src/components/file-tree/file-tree.tsx`
- `src/components/file-tree/file-node.tsx`
- `src/components/file-tree/file-search.tsx`
- `src/components/code-viewer/code-viewer.tsx` — Shiki for highlighting
- `src/components/code-viewer/line-highlight.tsx`
- `src/components/code-viewer/tab-bar.tsx`
- `src/components/code-viewer/ask-about-file.tsx` — "Ask about this file" button (sends file-scoped question to chat pane)
- `src/components/layout/workspace-shell.tsx` — resizable three-panel layout

**Additional packages**:
```
shiki
react-resizable-panels
```

### WS7: Repo Summary
**Owner output**: After indexing completes, an LLM generates an architectural summary stored in RepoSummary. This summary is included in every retrieval context.

**Concrete deliverables**:
- `src/workers/summary.worker.ts` — BullMQ job triggered after ingest completes
- Summary generation prompt (send file list + top symbols + directory structure to Claude)
- `RepoSummary` record persistence
- Summary retrieval in `src/modules/retrieval/context.ts`
- UI: summary view in workspace (optional for v1, nice-to-have — can be a collapsible section in the right panel above chat)

---

## 3. Dependency Graph Between Workstreams

```
WS1 (Skeleton + Auth)
 │
 ├──► WS2 (Workspace + Repo Connection)
 │     │
 │     ├──► WS3 (Ingestion Pipeline)
 │     │     │
 │     │     ├──► WS4 (Retrieval Engine)
 │     │     │     │
 │     │     │     └──► WS5 (LLM + Chat)
 │     │     │
 │     │     ├──► WS7 (Repo Summary) ◄── needs WS3 (indexed data) + WS5's llm module
 │     │     │
 │     │     └──► WS6 (File Tree + Code Viewer) ◄── can start after WS2 (partial)
 │     │
 │     └──► WS6 (File Tree + Code Viewer) [partial: file tree only, before WS3]
```

**Parallelization opportunities**:
- WS6 (file tree UI) can begin after WS2, using File records from clone metadata before full ingestion.
- WS6 (code viewer) can be built with mock data while WS3/WS4 proceed.
- WS7 depends on WS3 (indexed data) and the LLM module from WS5 — but it does NOT need WS5 to be fully complete. Once the `llm/provider.ts` exists from WS5, WS7 can proceed in parallel with the rest of WS5.

---

## 4. Phase-1 Implementation Order

### Step 1: Infrastructure + Schema (WS1, Part A)
1. Create `docker-compose.yml`:
   ```yaml
   services:
     postgres:
       image: pgvector/pgvector:pg16
       ports: ["5432:5432"]
       environment:
         POSTGRES_DB: repobrain
         POSTGRES_USER: repobrain
         POSTGRES_PASSWORD: repobrain
       volumes: [pgdata:/var/lib/postgresql/data]
     redis:
       image: redis:7-alpine
       ports: ["6379:6379"]
     app:
       build: .
       ports: ["3000:3000"]
       depends_on: [postgres, redis]
       env_file: .env
       volumes: ["./repos:/app/repos"]
       # Note: for local dev, use `npm run dev` directly instead of Docker app service
   volumes:
     pgdata:
   ```
2. Initialize Next.js project: `npx create-next-app@14 . --typescript --tailwind --app --src-dir --no-import-alias`
3. Install all dependencies (see WS1 packages list).
4. Create `src/lib/env.ts` with zod schema for:
   ```
   GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_REDIRECT_URI,
   DATABASE_URL, REDIS_URL, ANTHROPIC_API_KEY, OPENAI_API_KEY,
   SESSION_SECRET, BLOB_STORAGE_PATH
   ```
5. Create `.env.example` documenting all variables.
6. Create `src/lib/db/schema.ts` — full Drizzle schema for ALL entities from §05.
7. Create `src/lib/db/index.ts` — Drizzle client.
8. Run `npx drizzle-kit generate` + `npx drizzle-kit migrate`.
9. Create `src/lib/redis.ts`.
10. Verify: `docker compose up -d && npm run db:migrate` creates all tables.

### Step 2: Auth (WS1, Part B)
1. Create `src/modules/github/oauth.ts`.
2. Create `src/lib/auth.ts` (iron-session with cookie config).
3. Create API routes: `/api/auth/github`, `/api/auth/github/callback`, `/api/auth/session`, `/api/auth/logout`.
4. Create `src/app/auth/login/page.tsx`.
5. Create auth middleware helper for protected API routes.
6. Verify: user can log in via GitHub, session persists, `/api/auth/session` returns user.

### Step 3: Layout Shell (WS1, Part C)
1. Install shadcn/ui: `npx shadcn-ui@latest init`.
2. Add components: button, dialog, input, scroll-area, separator, skeleton, toast.
3. Create `src/app/layout.tsx` with font + providers.
4. Create `src/components/layout/workspace-shell.tsx` — three-panel with `react-resizable-panels`.
5. Create `src/app/dashboard/page.tsx` — empty workspace list.
6. Create `src/app/workspace/[workspaceId]/layout.tsx` + `page.tsx` with empty panels.
7. Verify: app renders, panels resize, empty states show.

### Step 4: Workspace + Repo Connection (WS2)
1. Create `src/modules/workspace/queries.ts` + `service.ts`.
2. Create `src/modules/github/repos.ts` — `listUserRepos` using GitHub REST API.
3. Create `src/modules/github/clone.ts` — `cloneRepo` using `simple-git`.
4. Create `src/workers/clone.worker.ts` — BullMQ processor.
5. Create `src/workers/index.ts` — worker bootstrap entry point.
6. Add to `package.json`: `"worker": "tsx src/workers/index.ts"`.
7. Create API routes: `/api/workspaces/*`, `/api/github/repos`.
8. Create `src/components/workspace/repo-picker.tsx` + `empty-state.tsx`.
9. Verify: user creates workspace, picks repo, clone job runs, status goes pending → cloning → ready.

### Step 5: Ingestion Pipeline (WS3)
1. Build `walker.ts` — recursive readdir with skip rules.
2. Build `language.ts` — extension → language map.
3. Build `symbols.ts` — tree-sitter WASM integration for JS/TS/Python/Go/Rust/Java.
4. Build `relations.ts` — import/export edge extraction.
5. Build `chunker.ts` — symbol-aware chunking (target 500 tokens, 50 overlap).
6. Build `embedder.ts` — OpenAI batch embedding (100 chunks/batch, exponential backoff).
7. Build `progress.ts` — write progress to Redis hash, API reads it.
8. Build `ingest.worker.ts` — orchestrate full pipeline.
9. Wire: clone.worker triggers ingest.worker on completion.
10. Build index-status API route.
11. Build `src/components/workspace/index-progress.tsx`.
12. Verify: after clone completes, ingestion runs; files/symbols/chunks/embeddings populate in DB.

### Step 6: Retrieval Engine (WS4)
1. Build `semantic.ts` — embed query with OpenAI, pgvector `<=>` operator, k=20.
2. Build `lexical.ts` — `to_tsvector`/`to_tsquery` on chunk content, `pg_trgm` similarity fallback.
3. Build `structural.ts` — regex symbol extraction from question, lookup in Symbol table, traverse SymbolRelation 1-2 hops.
4. Build `ranker.ts` — normalize, weight (0.45/0.30/0.25), intersection bonus, dedup, top-K.
5. Build `context.ts` — assemble formatted context string.
6. Build file-scoped retrieval path: when `options.filePath` is set, include entire file content (up to 500 lines), symbols defined in that file, files that import from it via SymbolRelation, and apply +0.3 boost to file-scoped results (per §06).
7. Build `index.ts` — `retrieve()` function with `RetrievalOptions` support (`filePath?: string`, `depth?: number`).
8. Verify with `scripts/test-retrieval.ts`: run 10 test questions (including 2 file-scoped), inspect ranked results.

### Step 7: LLM + Chat (WS5)
1. Build `provider.ts` — Anthropic SDK client, streaming.
2. Build `prompt.ts` — system prompt with exact citation format from §06.
3. Build `citations.ts` — regex parser `\[file:(.+?):L(\d+)-L(\d+)\]`, validate against File table.
4. Build `stream.ts` — SSE encoder.
5. Build `llm/index.ts` — `generateAnswer()` async generator.
6. Build `chat/queries.ts` — conversation + message CRUD.
7. Build `chat/service.ts` — `askQuestion()` orchestration.
8. Build conversation API routes.
9. Build chat UI components.
10. Verify: user asks question, gets streamed answer with clickable citations.

### Step 8: File Tree + Code Viewer (WS6)
1. Build file tree API from File records (nested JSON structure).
2. Build file content API (read from blob storage path).
3. Build file-tree component with collapse/expand + search filter.
4. Build code-viewer with Shiki syntax highlighting.
5. Build citation-click → navigate to file:line with yellow highlight.
6. Build tab bar for multiple open files.
7. Build "Ask about this file" button — when clicked, sends file path to chat pane which triggers file-scoped retrieval (§06).
8. Verify: click citation → code viewer opens with highlighted lines. Click "Ask about this file" → chat pane receives file-scoped context.

### Step 9: Repo Summary (WS7)
1. Build summary.worker.ts — triggered after ingest completes.
2. Build prompt: send directory tree + top 50 symbols + language breakdown → Claude.
3. Store in RepoSummary table.
4. Wire into retrieval context assembly.
5. Verify: summary appears in retrieval context, improves answer quality.

### Step 10: Integration + Polish
1. End-to-end test: login → connect repo → wait for index → ask question → click citation.
2. Error states for all failure modes.
3. Responsive layout down to 1024px.
4. Phase 3 stub: `/api/changes` returns 501.
5. Run acceptance criteria checklist from §11.

---

## 5. Non-Negotiable Invariants

1. **Every answer must cite specific files and line ranges.** No uncited factual claims about the codebase. Post-process LLM output to validate all citations. Answers with zero valid citations get a warning appended.

2. **Retrieval must combine semantic + lexical + structural.** All three strategies run in parallel on every query. No single-strategy fallback "for simplicity."

3. **Domain model matches §05 exactly.** Table names, column names, types, relationships — as specified. Phase 3 tables (SuggestedChange, BranchAction) exist in schema but are empty.

4. **Module boundaries from §09 are enforced.**
   - `github` module never writes to DB directly (returns data, caller writes).
   - `retrieval` module is pure read-only.
   - `llm` module never stores messages (caller stores).
   - `ingestion` module never handles HTTP requests.
   - No cross-module imports outside the declared dependency graph.

5. **Ingestion is idempotent.** Re-indexing the same commit SHA produces identical results. Use `content_hash` to detect unchanged files and skip re-processing.

6. **No Phase 3 features in v1.** No repo mutation, no diff application, no branch creation, no commit, no push. The `/api/changes` endpoint returns 501.

7. **Single repo per workspace enforced in v1.** The `connectRepo` function must reject a second repo connection. Schema allows N, code enforces 1.

8. **Background jobs via BullMQ only.** No inline long-running operations in API request handlers. Clone, ingest, embed, summarize — all go through the job queue.

9. **Cloned repos stored on local filesystem** at `BLOB_STORAGE_PATH`. Abstracted behind a storage interface so S3 swap is trivial later.

10. **LLM system prompt must include the exact citation format instruction** from §06. The format is `[file:path/to/file.ts:L15-L30]`. Do not invent alternative formats.

11. **The change workflow must never blur "suggested" and "applied."** These are distinct states with explicit user transitions (§07). Even though Phase 3 is not built in v1, the schema's `status` enum on `SuggestedChange` (`proposed`, `approved`, `applied`, `rejected`) must reflect this state machine. No code in v1 may collapse these states.

12. **Schema supports multi-repo from day one.** The `Workspace → RepoConnection` relationship is 1:N in the schema. v1 enforces max 1 in application code, but no schema constraint prevents N. This is a critical invariant from §00 — do not add a unique constraint on `workspace_id` in the `repo_connections` table.

---

## 6. Escalation Triggers

Stop and ask for review if:

1. **tree-sitter WASM fails to load or parse** in the Node.js/Next.js runtime. Do not silently fall back to regex for the affected languages without flagging.

2. **pgvector queries exceed 500ms** for a repo with <50K chunks. This indicates index tuning is needed.

3. **A module boundary change is needed** — e.g., retrieval needs to write data, or ingestion needs to call the LLM outside of summary generation. Do not bend the boundaries silently.

4. **A new database table or column is needed** that isn't in §05. Do not add schema without explicit approval.

5. **Retrieval quality is consistently poor** — test queries return <50% relevant results in the top 10. The three-strategy approach may need tuning or a fourth strategy.

6. **Embedding API rate limits cause indexing to take >10 minutes** for a repo with <5K files. Batching/backoff strategy needs rethinking.

7. **Citation validation rejects >30% of LLM citations.** The prompt or the citation format needs revision.

8. **Any temptation to build Phase 3 features** to make the demo "more impressive." Resist. Escalate if the product feels incomplete without write operations.

9. **GitHub OAuth scopes need to be expanded** beyond `repo` read access. Any write scope is Phase 3+.

10. **Docker Compose services fail to start** or pgvector extension is unavailable. Infrastructure must work before any code is written.

---

## 7. First Executable Milestone

### Milestone: "Auth-to-Clone" Vertical Slice

**Definition**: A user can open the app in a browser, sign in with GitHub, create a workspace, select a repository from their GitHub account, and see it cloned to the server with status tracking.

**Includes**:
- Docker Compose running Postgres + Redis
- Full database schema migrated (all tables from §05)
- GitHub OAuth login flow (redirect → callback → session)
- Dashboard page listing workspaces
- Create workspace flow
- GitHub repo listing API (fetches user's repos)
- Repo picker UI component
- Clone job submitted to BullMQ
- Clone worker processes job, clones repo to `BLOB_STORAGE_PATH`
- RepoConnection status updates: `pending` → `cloning` → `ready`
- UI reflects status changes (polling)

**Does NOT include**:
- Ingestion (no file parsing, no symbols, no embeddings)
- Retrieval or Q&A
- File tree or code viewer
- Chat

**Verification commands**:
```bash
# 1. Start infrastructure
docker compose up -d

# 2. Run migrations
npm run db:migrate

# 3. Start app
npm run dev

# 4. Start worker (separate terminal)
npm run worker

# 5. Open browser
# → http://localhost:3000
# → Click "Sign in with GitHub"
# → Authorize the OAuth app
# → See dashboard
# → Click "Create Workspace"
# → Pick a repo
# → See status go from "Cloning..." to "Ready"

# 6. Verify clone
ls repos/<workspace-id>/<repo-name>/
# → Should contain the repo files

# 7. Verify database
psql $DATABASE_URL -c "SELECT id, status, owner, name FROM repo_connections;"
# → Should show one row with status = 'ready'
```

**Why this milestone**:
- Validates the full infrastructure stack (Postgres, Redis, BullMQ, GitHub API)
- Validates auth flow end-to-end
- Validates the background job architecture
- Produces a tangible, testable result (cloned repo on disk)
- Every subsequent workstream depends on this working correctly

**Estimated effort**: 1-2 days for an experienced agent team.

---

## Appendix A: Package.json Dependencies

```json
{
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "drizzle-orm": "^0.36.0",
    "pg": "^8.13.0",
    "@neondatabase/serverless": "^0.10.0",
    "ioredis": "^5.4.0",
    "bullmq": "^5.25.0",
    "iron-session": "^8.0.0",
    "zod": "^3.23.0",
    "@anthropic-ai/sdk": "^0.32.0",
    "openai": "^4.70.0",
    "simple-git": "^3.27.0",
    "web-tree-sitter": "^0.24.0",
    "shiki": "^1.22.0",
    "react-resizable-panels": "^2.1.0",
    "tiktoken": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/react": "^18.3.0",
    "@types/node": "^22.0.0",
    "@types/pg": "^8.11.0",
    "drizzle-kit": "^0.28.0",
    "tsx": "^4.19.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "worker": "tsx src/workers/index.ts",
    "db:migrate": "tsx src/lib/db/migrate.ts",
    "db:generate": "drizzle-kit generate",
    "db:seed": "tsx scripts/seed.ts"
  }
}
```

## Appendix B: Environment Variables

```env
# GitHub OAuth App
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_REDIRECT_URI=http://localhost:3000/api/auth/github/callback

# Database
DATABASE_URL=postgresql://repobrain:repobrain@localhost:5432/repobrain

# Redis
REDIS_URL=redis://localhost:6379

# LLM Providers
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# Session
SESSION_SECRET=          # 32+ character random string

# Storage
BLOB_STORAGE_PATH=./repos

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Appendix C: Database Migration Verification Query

After running `npm run db:migrate`, this query must return all expected tables:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expected output:
```
branch_actions
chunks
conversations
embeddings
files
index_jobs
messages
repo_connections
repo_summaries
suggested_changes
symbol_relations
symbols
users
workspaces
```

All 14 tables must exist. Phase 3 tables (`branch_actions`, `suggested_changes`) must be empty but present.
