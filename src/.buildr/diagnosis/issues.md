# RepoBrain Diagnosis — 2026-03-27

## Already Fixed by User
- [x] Chat didn't use activeFilePath → fixed (destructuring + filePath in POST)
- [x] Breadcrumbs existed but unused → fixed (wired into workspace-shell)

## BLOCKER

### B1: Build failure — sidebar-nav.tsx JSX parsing error
**Location:** `src/components/layout/sidebar-nav.tsx:67`
**Evidence:** `Expected corresponding JSX closing tag for 'a'` — template literal in className confuses parser
**Fix:** Close template literal properly before JSX closing tag
**Status:** OPEN

## MAJOR

### M1: Hardcoded fallback secrets in production paths
**Location:** `src/lib/auth.ts`, `src/lib/db/index.ts`, `src/lib/redis.ts`
**Evidence:** SESSION_SECRET falls back to hardcoded string, DATABASE_URL defaults to localhost, REDIS_URL defaults to localhost
**Fix:** Fail fast if env vars missing in production (check NODE_ENV)

### M2: Missing seed script
**Location:** `package.json:13` references `scripts/seed.ts` — file doesn't exist
**Fix:** Create seed script or remove from package.json

### M3: Unused imports and dead code (11+ instances)
**Location:** ingestion/index.ts, retrieval/context.ts, cross-repo/detector.ts, workspace/repo-picker.tsx, etc.
**Fix:** Remove unused imports

### M4: React hook dependency — thread-panel.tsx
**Location:** `src/components/threads/thread-panel.tsx:121`
**Evidence:** useEffect missing `initialThread` in dependency array
**Fix:** Add to deps or restructure effect

### M5: Binary file handling
**Location:** `src/app/api/.../files/[...filePath]/route.ts`
**Evidence:** Reads all files as utf-8 — binary files will corrupt
**Fix:** Detect binary, return appropriate Content-Type or "not supported"

### M6: No observability
**Evidence:** No structured logging, no request-id, no error tracking, no LLM latency metrics
**Fix:** Add pino/winston + Sentry + request-id middleware

### M7: No rate limiting
**Evidence:** Chat and LLM-powered endpoints have no rate limits
**Fix:** Add rate limiting middleware for expensive endpoints

## MINOR

### m1: Middleware only checks cookie existence, not session validity
### m2: GitHub token storage needs rotation/retention policy
### m3: Path traversal — Windows mixed separators edge case
### m4: Sidebar links to unfinished features without fallback
### m5: No E2E tests, no CI pipeline
