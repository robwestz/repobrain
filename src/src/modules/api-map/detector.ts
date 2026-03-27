/**
 * API Surface Map — Endpoint Detector
 *
 * Detects API endpoints from indexed repository code using multiple strategies:
 *   1. Next.js App Router  (app/api/[...]]/route.ts)
 *   2. Next.js Pages API   (pages/api/[...].ts)
 *   3. Express / Koa       (app.get, router.post, etc.)
 *   4. FastAPI (Python)    (app.get, router.post decorators)
 *   5. Flask  (Python)     (app.route decorator)
 *
 * Data comes exclusively from the indexed `files` and `chunks` tables —
 * no file-system access is needed.
 */

import { db } from "@/src/lib/db";
import { files, chunks } from "@/src/lib/db/schema";
import { eq, or } from "drizzle-orm";
import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Types (public surface)
// ---------------------------------------------------------------------------

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "ALL";

export interface ParameterInfo {
  name: string;
  location: "path" | "query" | "body" | "header";
  type: string;
  required: boolean;
}

export interface DetectedEndpoint {
  id: string;
  method: HttpMethod;
  path: string;
  filePath: string;
  startLine: number;
  endLine: number;
  handlerName: string | null;
  framework: string;
  parameters: ParameterInfo[];
  responseType: string | null;
  authRequired: boolean;
  description: string | null;
  handlerCode: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function makeId(filePath: string, method: string, path: string): string {
  return createHash("sha1")
    .update(`${filePath}:${method}:${path}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Convert a Next.js App Router directory path into an HTTP route path.
 * e.g. "src/app/api/workspaces/[workspaceId]/repos/[repoId]/route.ts"
 *   -> "/api/workspaces/:workspaceId/repos/:repoId"
 */
function nextAppRouterPathFromFile(filePath: string): string {
  // Strip leading path components up to and including "app/"
  const appIdx = filePath.indexOf("/app/");
  const segment = appIdx >= 0 ? filePath.slice(appIdx + 5) : filePath;

  // Remove trailing "route.ts" or "route.js"
  const withoutFile = segment.replace(/\/?route\.[jt]sx?$/, "");

  // Convert [param] → :param and [...param] → :param*
  const parts = withoutFile
    .split("/")
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith("[...") && part.endsWith("]")) {
        return ":" + part.slice(4, -1) + "*";
      }
      if (part.startsWith("[") && part.endsWith("]")) {
        return ":" + part.slice(1, -1);
      }
      return part;
    });

  return "/" + parts.join("/");
}

/**
 * Convert a Next.js Pages API file path into an HTTP route path.
 * e.g. "pages/api/users/[id].ts" -> "/api/users/:id"
 */
function nextPagesApiPathFromFile(filePath: string): string {
  const pagesIdx = filePath.indexOf("/pages/");
  const segment = pagesIdx >= 0 ? filePath.slice(pagesIdx + 7) : filePath;

  // Remove file extension
  const withoutExt = segment.replace(/\.[jt]sx?$/, "");

  // Remove trailing "/index"
  const withoutIndex = withoutExt.replace(/\/index$/, "");

  const parts = withoutIndex
    .split("/")
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith("[...") && part.endsWith("]")) {
        return ":" + part.slice(4, -1) + "*";
      }
      if (part.startsWith("[") && part.endsWith("]")) {
        return ":" + part.slice(1, -1);
      }
      return part;
    });

  return "/" + parts.join("/");
}

/**
 * Extract HTTP methods exported from a Next.js App Router route file.
 * Looks for: export async function GET(...) / export function POST(...)
 * Also handles: export { GET, POST } from re-exports (best-effort)
 */
function extractNextAppRouterMethods(code: string): HttpMethod[] {
  const methods: HttpMethod[] = [];
  const methodPattern =
    /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g;
  let match;
  while ((match = methodPattern.exec(code)) !== null) {
    methods.push(match[1] as HttpMethod);
  }

  // Handle re-export pattern: export { GET, POST }
  const reExportPattern = /export\s+\{([^}]+)\}/g;
  while ((match = reExportPattern.exec(code)) !== null) {
    const names = match[1].split(",").map((s) => s.trim());
    for (const name of names) {
      if (["GET", "POST", "PUT", "PATCH", "DELETE"].includes(name)) {
        if (!methods.includes(name as HttpMethod)) {
          methods.push(name as HttpMethod);
        }
      }
    }
  }

  return methods.length > 0 ? methods : ["GET"];
}

/**
 * Extract HTTP methods used in a Next.js Pages API handler.
 * Looks for: req.method === "GET" / req.method === 'POST'
 */
function extractPagesMethods(code: string): HttpMethod[] {
  const methods: HttpMethod[] = [];
  const pattern = /req\.method\s*===?\s*['"]([A-Z]+)['"]/g;
  let match;
  while ((match = pattern.exec(code)) !== null) {
    const m = match[1] as HttpMethod;
    if (["GET", "POST", "PUT", "PATCH", "DELETE"].includes(m)) {
      if (!methods.includes(m)) methods.push(m);
    }
  }
  return methods.length > 0 ? methods : ["ALL"];
}

/**
 * Extract Express/Koa-style routes from code.
 * Handles: app.get('/path', ...) / router.post('/path', ...) etc.
 */
interface ExpressRoute {
  method: HttpMethod;
  path: string;
  handlerName: string | null;
}

function extractExpressRoutes(code: string): ExpressRoute[] {
  const routes: ExpressRoute[] = [];

  // Pattern: (app|router).(get|post|put|patch|delete)('/path'
  const pattern =
    /(?:app|router|server)\.(get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"` ]+)['"`]/gi;
  let match;
  while ((match = pattern.exec(code)) !== null) {
    routes.push({
      method: match[1].toUpperCase() as HttpMethod,
      path: match[2],
      handlerName: null,
    });
  }

  // Also: router.route('/path').get(...).post(...)
  const routeChainPattern = /router\.route\s*\(\s*['"`]([^'"` ]+)['"`]\s*\)/g;
  while ((match = routeChainPattern.exec(code)) !== null) {
    const routePath = match[1];
    // Find chained method calls after this pattern
    const afterRoute = code.slice(match.index + match[0].length);
    const chainedMethods = afterRoute.match(/\.(get|post|put|patch|delete)\s*\(/gi) ?? [];
    for (const cm of chainedMethods.slice(0, 5)) {
      const m = cm.replace(/[.(]/g, "").toUpperCase() as HttpMethod;
      routes.push({ method: m, path: routePath, handlerName: null });
    }
  }

  return routes;
}

/**
 * Extract FastAPI routes from Python code.
 * Handles: @app.get("/path") / @router.post("/path")
 */
interface PythonRoute {
  method: HttpMethod;
  path: string;
  handlerName: string | null;
  startLine: number;
}

function extractFastAPIRoutes(code: string): PythonRoute[] {
  const routes: PythonRoute[] = [];
  const pattern =
    /@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/gi;
  let match;
  while ((match = pattern.exec(code)) !== null) {
    // Find the line number
    const upToMatch = code.slice(0, match.index);
    const lineNo = upToMatch.split("\n").length;

    // The function def is usually the next non-decorator line
    const defMatch = code.slice(match.index).match(/\ndef\s+(\w+)\s*\(/);
    const handlerName = defMatch ? defMatch[1] : null;

    routes.push({
      method: match[1].toUpperCase() as HttpMethod,
      path: match[2],
      handlerName,
      startLine: lineNo,
    });
  }
  return routes;
}

/**
 * Extract Flask routes from Python code.
 * Handles: @app.route("/path", methods=["GET","POST"])
 */
function extractFlaskRoutes(code: string): PythonRoute[] {
  const routes: PythonRoute[] = [];
  const pattern =
    /@app\.route\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*methods\s*=\s*\[([^\]]*)\])?\s*\)/gi;
  let match;
  while ((match = pattern.exec(code)) !== null) {
    const upToMatch = code.slice(0, match.index);
    const lineNo = upToMatch.split("\n").length;

    const defMatch = code.slice(match.index).match(/\ndef\s+(\w+)\s*\(/);
    const handlerName = defMatch ? defMatch[1] : null;

    const methodsStr = match[2] ?? "'GET'";
    const methods: HttpMethod[] = [];
    const methodPattern = /['"]([A-Z]+)['"]/g;
    let mMatch;
    while ((mMatch = methodPattern.exec(methodsStr)) !== null) {
      const m = mMatch[1] as HttpMethod;
      if (["GET", "POST", "PUT", "PATCH", "DELETE"].includes(m)) {
        methods.push(m);
      }
    }
    if (methods.length === 0) methods.push("GET");

    for (const method of methods) {
      routes.push({ method, path: match[1], handlerName, startLine: lineNo });
    }
  }
  return routes;
}

/**
 * Detect auth requirements in handler code.
 * Returns true if any known auth patterns are found.
 */
function detectAuth(code: string): boolean {
  const authPatterns = [
    /requireSession\s*\(/,
    /getSession\s*\(/,
    /authenticate\s*\(/,
    /verifyToken\s*\(/,
    /jwt\.verify\s*\(/,
    /bearerToken/i,
    /authorization/i,
    /isAuthenticated/,
    /checkAuth/,
    /authMiddleware/,
    /Depends\(get_current_user/,
    /login_required/,
    /current_user/,
    /@jwt_required/,
  ];
  return authPatterns.some((p) => p.test(code));
}

/**
 * Extract parameter info from handler code.
 */
function extractParameters(
  code: string,
  routePath: string,
): ParameterInfo[] {
  const params: ParameterInfo[] = [];

  // Path parameters from the route pattern
  const pathParamPattern = /:([a-zA-Z_][a-zA-Z0-9_]*)\*?/g;
  let match;
  while ((match = pathParamPattern.exec(routePath)) !== null) {
    params.push({
      name: match[1],
      location: "path",
      type: "string",
      required: true,
    });
  }

  // Also extract from Next.js dynamic segments [param]
  const nextParamPattern = /\[(?:\.\.\.)?([a-zA-Z_][a-zA-Z0-9_]*)\]/g;
  while ((match = nextParamPattern.exec(routePath)) !== null) {
    const name = match[1];
    if (!params.some((p) => p.name === name)) {
      params.push({
        name,
        location: "path",
        type: "string",
        required: true,
      });
    }
  }

  // Query parameters: searchParams.get("name") / req.query.name / request.query["name"]
  const queryPattern1 =
    /(?:searchParams|query)\.get\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = queryPattern1.exec(code)) !== null) {
    const name = match[1];
    if (!params.some((p) => p.name === name)) {
      params.push({ name, location: "query", type: "string", required: false });
    }
  }

  const queryPattern2 = /(?:req|request)\.query(?:\[['"]([^'"]+)['"]\]|\.([a-zA-Z_]\w*))/g;
  while ((match = queryPattern2.exec(code)) !== null) {
    const name = match[1] ?? match[2];
    if (name && !params.some((p) => p.name === name)) {
      params.push({ name, location: "query", type: "string", required: false });
    }
  }

  // Body parameters: const { field } = await req.json() / body destructuring
  const bodyJsonPattern = /await\s+(?:req|request)\.json\s*\(\s*\)/;
  if (bodyJsonPattern.test(code)) {
    // Look for destructuring after .json()
    const destructPattern =
      /const\s+\{([^}]+)\}\s*=\s*(?:await\s+)?(?:req|request)\.json\s*\(\s*\)/g;
    while ((match = destructPattern.exec(code)) !== null) {
      const fields = match[1].split(",").map((f) => f.trim().split(":")[0].trim());
      for (const field of fields) {
        if (field && !params.some((p) => p.name === field)) {
          params.push({ name: field, location: "body", type: "unknown", required: true });
        }
      }
    }
  }

  // Header parameters: req.headers.get("x-...") / headers().get(...)
  const headerPattern =
    /(?:req|request|headers)\s*(?:\(\s*\))?\s*(?:\.|\.get\s*\(\s*)['"]([a-zA-Z][a-zA-Z0-9\-]*)['"](?:\s*\))?/g;
  while ((match = headerPattern.exec(code)) !== null) {
    const name = match[1].toLowerCase();
    if (
      name.startsWith("x-") ||
      ["authorization", "content-type", "accept"].includes(name)
    ) {
      if (!params.some((p) => p.name === name)) {
        params.push({ name, location: "header", type: "string", required: false });
      }
    }
  }

  return params;
}

/**
 * Infer response type from handler code.
 */
function inferResponseType(code: string): string | null {
  if (/NextResponse\.json\s*\(/.test(code)) return "JSON";
  if (/Response\s*\(\s*JSON\.stringify/.test(code)) return "JSON";
  if (/res\.json\s*\(/.test(code)) return "JSON";
  if (/return\s+Response\s*\(/.test(code)) return "Response";
  if (/StreamingTextResponse/.test(code)) return "StreamingText";
  if (/NextResponse\.redirect/.test(code)) return "Redirect";
  if (/res\.send\s*\(/.test(code)) return "Text";
  return null;
}

// ---------------------------------------------------------------------------
// Main detection function
// ---------------------------------------------------------------------------

export async function detectEndpoints(
  repoConnectionId: string,
): Promise<DetectedEndpoint[]> {
  const endpoints: DetectedEndpoint[] = [];

  // Fetch all files for this repo
  const allFiles = await db
    .select()
    .from(files)
    .where(eq(files.repoConnectionId, repoConnectionId));

  // Build a lookup: fileId -> chunks (sorted by startLine)
  const chunksByFile = new Map<
    string,
    { id: string; fileId: string; content: string; startLine: number; endLine: number }[]
  >();

  // Fetch all chunks for files in this repo
  const fileIds = allFiles.map((f) => f.id);

  if (fileIds.length > 0) {
    const repoChunks = await db
      .select({
        id: chunks.id,
        fileId: chunks.fileId,
        content: chunks.content,
        startLine: chunks.startLine,
        endLine: chunks.endLine,
      })
      .from(chunks)
      .where(
        fileIds.length === 1
          ? eq(chunks.fileId, fileIds[0])
          : or(...fileIds.map((id) => eq(chunks.fileId, id))),
      );

    for (const chunk of repoChunks) {
      const arr = chunksByFile.get(chunk.fileId) ?? [];
      arr.push(chunk);
      chunksByFile.set(chunk.fileId, arr);
    }
  }

  // Build a helper to get full file code (join all chunks sorted by line)
  function getFileCode(fileId: string): string {
    const fileChunks = chunksByFile.get(fileId) ?? [];
    return fileChunks
      .sort((a, b) => a.startLine - b.startLine)
      .map((c) => c.content)
      .join("\n");
  }

  for (const file of allFiles) {
    const filePath = file.path;
    const fileCode = getFileCode(file.id);
    const fileLines = fileCode.split("\n");

    // -----------------------------------------------------------------
    // Strategy 1: Next.js App Router
    // -----------------------------------------------------------------
    if (/\/app\/api\/.*\/route\.[jt]sx?$/.test(filePath)) {
      const routePath = nextAppRouterPathFromFile(filePath);
      const methods = extractNextAppRouterMethods(fileCode);

      for (const method of methods) {
        // Find the actual exported function in the code
        const funcPattern = new RegExp(
          `export\\s+(?:async\\s+)?function\\s+${method}\\s*\\(`,
          "m",
        );
        const funcMatch = funcPattern.exec(fileCode);
        const startLine = funcMatch
          ? fileCode.slice(0, funcMatch.index).split("\n").length
          : 1;
        const endLine = Math.min(startLine + 60, fileLines.length);

        // Get the relevant chunk for this handler
        const handlerChunks = chunksByFile.get(file.id) ?? [];
        const handlerChunk =
          handlerChunks
            .filter((c) => c.startLine <= startLine + 5 && c.endLine >= startLine - 5)
            .sort((a, b) => Math.abs(a.startLine - startLine) - Math.abs(b.startLine - startLine))[0] ??
          handlerChunks[0];

        const handlerCode = handlerChunk?.content ?? null;
        const relevantCode = handlerCode ?? fileCode;

        endpoints.push({
          id: makeId(filePath, method, routePath),
          method,
          path: routePath,
          filePath,
          startLine,
          endLine,
          handlerName: method,
          framework: "nextjs-app-router",
          parameters: extractParameters(relevantCode, routePath),
          responseType: inferResponseType(relevantCode),
          authRequired: detectAuth(relevantCode),
          description: null,
          handlerCode,
        });
      }
      continue;
    }

    // -----------------------------------------------------------------
    // Strategy 2: Next.js Pages API
    // -----------------------------------------------------------------
    if (/\/pages\/api\/.*\.[jt]sx?$/.test(filePath)) {
      const routePath = nextPagesApiPathFromFile(filePath);
      const methods = extractPagesMethods(fileCode);

      const handlerChunks = chunksByFile.get(file.id) ?? [];
      const handlerCode = handlerChunks[0]?.content ?? null;

      for (const method of methods) {
        endpoints.push({
          id: makeId(filePath, method, routePath),
          method,
          path: routePath,
          filePath,
          startLine: 1,
          endLine: fileLines.length,
          handlerName: "handler",
          framework: "nextjs-pages",
          parameters: extractParameters(fileCode, routePath),
          responseType: inferResponseType(fileCode),
          authRequired: detectAuth(fileCode),
          description: null,
          handlerCode,
        });
      }
      continue;
    }

    // -----------------------------------------------------------------
    // Strategy 3: Express / Koa (TypeScript / JavaScript)
    // -----------------------------------------------------------------
    if (
      /\.[jt]sx?$/.test(filePath) &&
      !filePath.endsWith(".d.ts") &&
      /(?:app|router)\.(get|post|put|patch|delete|all)\s*\(/.test(fileCode)
    ) {
      const routes = extractExpressRoutes(fileCode);
      if (routes.length > 0) {
        const handlerChunks = chunksByFile.get(file.id) ?? [];

        for (const route of routes) {
          const handlerCode = handlerChunks[0]?.content ?? null;
          endpoints.push({
            id: makeId(filePath, route.method, route.path),
            method: route.method,
            path: route.path,
            filePath,
            startLine: 1,
            endLine: fileLines.length,
            handlerName: route.handlerName,
            framework: "express",
            parameters: extractParameters(fileCode, route.path),
            responseType: inferResponseType(fileCode),
            authRequired: detectAuth(fileCode),
            description: null,
            handlerCode,
          });
        }
        continue;
      }
    }

    // -----------------------------------------------------------------
    // Strategy 4: FastAPI (Python)
    // -----------------------------------------------------------------
    if (
      /\.py$/.test(filePath) &&
      /@(?:app|router)\.(get|post|put|patch|delete)/.test(fileCode)
    ) {
      const routes = extractFastAPIRoutes(fileCode);
      if (routes.length > 0) {
        const handlerChunks = chunksByFile.get(file.id) ?? [];

        for (const route of routes) {
          const handlerCode = handlerChunks[0]?.content ?? null;
          endpoints.push({
            id: makeId(filePath, route.method, route.path),
            method: route.method,
            path: route.path,
            filePath,
            startLine: route.startLine,
            endLine: route.startLine + 30,
            handlerName: route.handlerName,
            framework: "fastapi",
            parameters: extractParameters(fileCode, route.path),
            responseType: "JSON",
            authRequired: detectAuth(fileCode),
            description: null,
            handlerCode,
          });
        }
        continue;
      }
    }

    // -----------------------------------------------------------------
    // Strategy 5: Flask (Python)
    // -----------------------------------------------------------------
    if (/\.py$/.test(filePath) && /@app\.route\s*\(/.test(fileCode)) {
      const routes = extractFlaskRoutes(fileCode);
      if (routes.length > 0) {
        const handlerChunks = chunksByFile.get(file.id) ?? [];

        for (const route of routes) {
          const handlerCode = handlerChunks[0]?.content ?? null;
          endpoints.push({
            id: makeId(filePath, route.method, route.path),
            method: route.method,
            path: route.path,
            filePath,
            startLine: route.startLine,
            endLine: route.startLine + 30,
            handlerName: route.handlerName,
            framework: "flask",
            parameters: extractParameters(fileCode, route.path),
            responseType: "JSON",
            authRequired: detectAuth(fileCode),
            description: null,
            handlerCode,
          });
        }
      }
    }
  }

  // Deduplicate by id (prefer first occurrence)
  const seen = new Set<string>();
  return endpoints.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}
