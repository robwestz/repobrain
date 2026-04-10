import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { getSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { repoConnections, workspaces } from "@/src/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { env } from "@/src/lib/env";

// Binary file extensions — not suitable for text serving
const BINARY_EXTENSIONS = new Set([
  // Images
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".svg",
  ".tiff", ".tif", ".avif",
  // Fonts
  ".ttf", ".otf", ".woff", ".woff2", ".eot",
  // Compiled / archives
  ".exe", ".dll", ".so", ".dylib", ".a", ".lib",
  ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar",
  ".jar", ".war", ".ear", ".class",
  ".pyc", ".pyd", ".pyo",
  ".wasm",
  // Media
  ".mp3", ".mp4", ".wav", ".ogg", ".flac", ".aac",
  ".mov", ".avi", ".mkv", ".webm",
  // Documents
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  // Database / binary data
  ".db", ".sqlite", ".sqlite3",
  ".bin", ".dat",
]);

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MB

/** Extension → highlighter / UI language id (matches client expectations) */
const EXT_TO_LANGUAGE: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".json": "json",
  ".md": "markdown",
  ".mdx": "markdown",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".kt": "kotlin",
  ".swift": "swift",
  ".rb": "ruby",
  ".php": "php",
  ".cs": "csharp",
  ".css": "css",
  ".html": "html",
  ".htm": "html",
  ".xml": "xml",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".sql": "sql",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
};

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      workspaceId: string;
      repoId: string;
      filePath: string[];
    }>;
  },
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, repoId, filePath: filePathSegments } = await params;

  // Verify the workspace belongs to this user
  const workspace = await db.query.workspaces.findFirst({
    where: and(
      eq(workspaces.id, workspaceId),
      eq(workspaces.userId, session.userId),
    ),
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const repoRow = await db.query.repoConnections.findFirst({
    where: and(
      eq(repoConnections.id, repoId),
      eq(repoConnections.workspaceId, workspaceId),
    ),
  });

  if (!repoRow) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  // Reconstruct requested path from segments
  const requestedRelative = filePathSegments.join("/");

  // Null byte check — reject immediately
  if (requestedRelative.includes("\0")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  // Build the repo base directory
  const blobStoragePath = env().BLOB_STORAGE_PATH;
  const repoBase = path.resolve(blobStoragePath, workspaceId, repoId);

  // Normalize the full requested path and assert it stays within repoBase
  // path.normalize converts backslashes on Windows and resolves . / ..
  const requestedFull = path.normalize(path.join(repoBase, requestedRelative));

  // Ensure the resolved path is strictly inside repoBase
  const repoBaseNormalized = path.normalize(repoBase) + path.sep;
  if (!requestedFull.startsWith(repoBaseNormalized) && requestedFull !== path.normalize(repoBase)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  // Binary extension check
  const ext = path.extname(requestedFull).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: "Binary files not supported", contentType: "binary" },
      { status: 415 },
    );
  }

  // Stat before reading to enforce size limit
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(requestedFull);
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  if (!stat.isFile()) {
    return NextResponse.json({ error: "Not a file" }, { status: 400 });
  }

  if (stat.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File too large", maxBytes: MAX_FILE_SIZE },
      { status: 413 },
    );
  }

  // Read the file
  let content: string;
  try {
    content = await fs.readFile(requestedFull, "utf-8");
  } catch {
    return NextResponse.json({ error: "Unable to read file" }, { status: 500 });
  }

  const language = EXT_TO_LANGUAGE[ext] ?? null;
  const lineCount = content.split("\n").length;

  // JSON body — WorkspaceShell and other clients use res.json() (content, language, …)
  return NextResponse.json(
    {
      path: requestedRelative,
      content,
      language,
      lineCount,
      sizeBytes: stat.size,
    },
    {
      status: 200,
      headers: { "X-Content-Type-Options": "nosniff" },
    },
  );
}
