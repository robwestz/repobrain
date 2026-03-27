# RepoBrain Production Checklist

Status: **Development complete (15 features), not yet production-hardened.**

---

## P0 — Must fix before any real users

### Security
- [ ] **SESSION_SECRET**: env.ts already throws in prod if default — verify deploy sets a real 32+ char hex secret
- [ ] **GitHub token scope**: reduce to minimum (`read:user`, `repo:read` if possible), document rotation procedure
- [ ] **Path traversal hardening**: add `path.normalize()` before `startsWith` check in files API (Windows mixed-separator edge case)
- [ ] **Binary file handling**: files/[...filePath] reads as utf-8 — return 415 or content-type header for binary files, enforce size limit (1MB)
- [ ] **CORS/CSP headers**: add Content-Security-Policy and restrict CORS in next.config.ts for production domain
- [ ] **Cookie settings**: verify `secure: true`, `sameSite: "lax"`, `httpOnly: true` are enforced in prod (auth.ts already does this conditionally)

### Environment
- [ ] **Fail-fast env validation**: call `env()` from middleware or root layout so missing vars crash at startup, not on first request
- [ ] **Remove all localhost defaults**: db/index.ts, redis.ts, workers/index.ts — require env vars, no fallbacks
- [ ] **Separate .env.production**: create template with all required vars documented

### Data
- [ ] **Run all migrations in order**: verify `drizzle/0000`, `0001`, `0002` apply cleanly on fresh DB
- [ ] **Database SSL**: already enabled for DigitalOcean — verify `rejectUnauthorized: false` is acceptable or pin CA cert
- [ ] **Redis eviction policy**: BullMQ warns about `volatile-lru` — change Redis Cloud to `noeviction`

---

## P1 — Required for production quality

### Observability
- [ ] **Structured logging**: replace console.log/error with a logger (pino or winston) with JSON output, request-id, timestamp
- [ ] **Error tracking**: integrate Sentry or similar — catch unhandled rejections in API routes, workers, and LLM calls
- [ ] **LLM metrics**: log retrieval latency, chunk count, embedding calls, LLM tokens used per request
- [ ] **Worker monitoring**: BullMQ dashboard (bull-board) or health endpoint for queue depth, failed jobs, processing time
- [ ] **Request tracing**: add x-request-id header, propagate through retrieval → LLM pipeline

### Rate Limiting
- [ ] **Chat endpoint**: max 10 messages/min per user (prevent LLM cost runaway)
- [ ] **Search endpoint**: max 30 requests/min per user
- [ ] **Onboarding/Narrator**: max 5 LLM generations/min per user (expensive operations)
- [ ] **Clone/index**: max 3 concurrent per user (prevent resource exhaustion)
- [ ] **Input size limits**: max question length 2000 chars, max file path depth 20 segments

### Testing
- [ ] **E2E happy path**: auth → create workspace → connect repo → wait for index → ask question → verify citation
- [ ] **Retrieval quality**: golden questions per repo type — verify semantic search returns relevant chunks
- [ ] **Citation accuracy**: test that citations reference real files and valid line ranges
- [ ] **API route tests**: verify auth, 404s, validation errors for all endpoints
- [ ] **Build in CI**: `npm run build` on every PR, block merge on failure

### CI/CD
- [ ] **GitHub Actions workflow**: lint → typecheck → build → test → deploy
- [ ] **Migration safety**: run `drizzle-kit check` or diff against staging before deploying schema changes
- [ ] **Preview deploys**: Vercel/Railway preview for PRs
- [ ] **Rollback plan**: document how to revert a bad deploy (DB migrations are forward-only — plan accordingly)

---

## P2 — Polish & scale

### UX Polish
- [ ] **Loading states**: ensure all feature pages show skeleton/spinner on first load (some compile slowly in dev, fast in prod)
- [ ] **Error boundaries**: wrap each feature page in React error boundary — show "Something went wrong" instead of blank screen
- [ ] **404 handling**: sidebar links to features that aren't ready should show "Coming soon" not browser 404
- [ ] **Mobile responsive**: sidebar collapse behavior on small screens
- [ ] **Dark/light mode**: verify all features respect system theme (CSS variables are set up)
- [ ] **Keyboard navigation**: Cmd+K for search, Escape to close panels

### Performance
- [ ] **Redis cache warming**: pre-cache health, patterns, API map after indexing completes
- [ ] **Incremental indexing**: re-index only changed files on push (webhook trigger)
- [ ] **Branch selection**: let user choose which branch to index (currently defaults to clone default)
- [ ] **Embedding batch optimization**: current batch size 100 — test with 500 for large repos
- [ ] **ISR/SSG for static pages**: dashboard, login can be static

### Features for Launch
- [ ] **Workspace deletion**: no UI for deleting workspaces or disconnecting repos
- [ ] **Conversation management**: delete/rename conversations
- [ ] **Export**: PDF/Markdown export of architecture diagrams, health reports, narrations
- [ ] **Webhook indexing**: GitHub webhook → trigger re-index on push
- [ ] **User settings page**: theme, default LLM provider, notification preferences

---

## P3 — Platform / Enterprise

### Team & Collaboration
- [ ] **Shared workspaces**: invite team members, role-based access (owner, editor, viewer)
- [ ] **Audit log**: who did what, when (important for enterprise)
- [ ] **SSO/SAML**: enterprise auth integration
- [ ] **Usage billing**: track LLM tokens, embeddings, storage per workspace

### Advanced Features
- [ ] **Change workflow**: suggested code changes → diff review → branch → PR (schema stubs exist)
- [ ] **GitHub Checks integration**: post RepoBrain insights as PR comments
- [ ] **Slack/Linear integration**: share findings, create tickets from patterns/health issues
- [ ] **Secrets scanner**: detect tokens, API keys, passwords in indexed code
- [ ] **Custom rules**: user-defined pattern detection rules
- [ ] **Scheduled re-analysis**: daily/weekly health + pattern reports

### Scale
- [ ] **Multi-tenant isolation**: separate DB schemas or row-level security per organization
- [ ] **Worker scaling**: horizontal scaling of clone/ingest workers
- [ ] **Embedding model selection**: allow users to choose model (cost vs quality trade-off)
- [ ] **Large repo support**: test with 10k+ file repos, optimize walker and chunker
- [ ] **CDN for static assets**: serve syntax highlighting themes, fonts from CDN
