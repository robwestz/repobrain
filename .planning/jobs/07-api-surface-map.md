# Job 07: Auto-Generated API Surface Map

## Summary
Automatically detect all API endpoints in a repository (REST routes, GraphQL resolvers, RPC handlers) and present them as interactive, searchable documentation. Shows endpoint path, HTTP method, request/response types, auth requirements, and linked handler code. Like auto-generated Swagger but from actual code, not annotations.

## Size: M (~3h)

## Dependencies: None

## What to Build

### 1. API Detection Module
Create `src/modules/api-map/`

#### detector.ts — Endpoint detection engine
```typescript
interface DetectedEndpoint {
  id: string; // generated hash
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "ALL";
  path: string; // e.g. "/api/users/:id"
  filePath: string;
  startLine: number;
  endLine: number;
  handlerName: string | null; // function/export name
  framework: string; // "nextjs-app-router" | "nextjs-pages" | "express" | "fastapi" | "flask" | "unknown"
  parameters: ParameterInfo[];
  responseType: string | null; // inferred from code
  authRequired: boolean; // detected from middleware/guards
  description: string | null; // from comments or AI
}

interface ParameterInfo {
  name: string;
  location: "path" | "query" | "body" | "header";
  type: string; // inferred
  required: boolean;
}

async function detectEndpoints(repoConnectionId: string): Promise<DetectedEndpoint[]>
```

**Detection strategies** (check all, merge results):

1. **Next.js App Router** (this repo's pattern):
   - Scan files matching `app/api/**/route.ts`
   - Path derived from directory structure
   - Methods from exported function names: `GET`, `POST`, `PUT`, `DELETE`
   - Dynamic segments: `[param]` → `:param`, `[...path]` → `:path*`

2. **Next.js Pages API**:
   - Scan `pages/api/**/*.ts`
   - Default export = handler
   - Method from `req.method` checks in code

3. **Express/Koa**:
   - Grep for `app.get(`, `router.post(`, etc.
   - Extract path string and handler

4. **FastAPI (Python)**:
   - Grep for `@app.get(`, `@router.post(`, etc.

5. **Flask (Python)**:
   - Grep for `@app.route(`

For each detected endpoint:
- Read the handler code from the `chunks` table
- Check for auth patterns: `requireSession`, `getSession`, `authenticate`, `auth`, `jwt`, `token`
- Extract parameters from path segments and request body parsing (`req.json()`, `req.nextUrl.searchParams`)
- Infer response type from `NextResponse.json()`, `res.json()`, `return Response()`

#### analyzer.ts — Endpoint enrichment
```typescript
async function enrichEndpoint(
  endpoint: DetectedEndpoint,
  repoConnectionId: string
): Promise<EnrichedEndpoint>
```

For each endpoint:
1. Follow the handler code to find:
   - Database queries it makes (grep for table names)
   - External API calls
   - Validation logic
2. Generate a one-line description via LLM (batch all endpoints in one call)
3. Detect related endpoints (same resource, e.g., GET/POST/DELETE /users)

### 2. API Route

#### GET /api/workspaces/[workspaceId]/repos/[repoId]/api-map
Response:
```json
{
  "endpoints": [...],
  "framework": "nextjs-app-router",
  "totalEndpoints": 15,
  "groupedByResource": {
    "/api/auth": [...],
    "/api/workspaces": [...],
    "/api/conversations": [...]
  },
  "cached": true
}
```

Cache in Redis for 10 min.

Create: `src/app/api/workspaces/[workspaceId]/repos/[repoId]/api-map/route.ts`

### 3. UI — API Map Page
Create `src/app/workspace/[workspaceId]/api-map/page.tsx`

#### ApiMapView (`src/components/api-map/api-map-view.tsx`)
Main view component.

**Layout:**

**Left panel — Endpoint list (sidebar):**
- Grouped by resource (e.g., "Auth", "Workspaces", "Conversations")
- Each group collapsible
- Each endpoint shows: METHOD badge (colored) + path
- Search/filter bar at top
- Method filter: checkboxes for GET/POST/PUT/DELETE
- Auth filter: "Auth required" / "Public"

**Right panel — Endpoint detail:**
- Selected endpoint details:
  - Method + Path (large)
  - Description
  - Auth requirement badge
  - Framework badge
  - Parameters table: name, location, type, required
  - Handler code (syntax highlighted, from chunks)
  - "Open in Code Viewer" link
  - Related endpoints (same resource)

**Method badge colors:**
- GET: green
- POST: blue
- PUT: orange
- PATCH: yellow
- DELETE: red

#### EndpointCard (`src/components/api-map/endpoint-card.tsx`)
Compact endpoint display for the list.

#### EndpointDetail (`src/components/api-map/endpoint-detail.tsx`)
Full detail view for selected endpoint.

### 4. Integration
- Add "API Map" to sidebar nav
- In code viewer, when viewing a route.ts file, show a small "View in API Map" link

## Files to Create
- `src/modules/api-map/detector.ts`
- `src/modules/api-map/analyzer.ts`
- `src/app/api/workspaces/[workspaceId]/repos/[repoId]/api-map/route.ts`
- `src/app/workspace/[workspaceId]/api-map/page.tsx`
- `src/components/api-map/api-map-view.tsx`
- `src/components/api-map/endpoint-card.tsx`
- `src/components/api-map/endpoint-detail.tsx`

## Files to Modify
- `src/components/layout/sidebar-nav.tsx` — Add "API Map" nav item (if exists)

## No DB Schema Changes
## No New NPM Packages

## Acceptance Criteria
1. API Map page loads at `/workspace/{wId}/api-map`
2. All Next.js App Router endpoints are detected correctly
3. Endpoints grouped by resource
4. Each endpoint shows method, path, auth requirement
5. Handler code is displayed with syntax highlighting
6. Clicking "Open in Code Viewer" navigates to the handler file
7. Search/filter by method and auth works
8. Express endpoints detected if the repo uses Express
9. Results cached in Redis
10. `npm run build` passes

## What NOT to Do
- Do not generate OpenAPI/Swagger spec files
- Do not add a "Try it" / API playground feature
- Do not add request/response body validation schemas
- Do not install any API documentation libraries
- Do not modify any existing API routes
