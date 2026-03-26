/**
 * File tree walker for repository ingestion.
 * Recursively walks the repo, skipping binary/vendored/generated files.
 * Returns an array of walkable file entries.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export interface WalkedFile {
  /** Path relative to repo root (forward slashes) */
  relativePath: string;
  /** Absolute path on disk */
  absolutePath: string;
  /** File size in bytes */
  sizeBytes: number;
  /** SHA-256 hash of file content */
  contentHash: string;
  /** Number of lines */
  lineCount: number;
  /** Raw file content */
  content: string;
}

// Directories to skip entirely
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "vendor",
  "dist",
  "build",
  "__pycache__",
  ".next",
  ".nuxt",
  "coverage",
  ".cache",
  ".tox",
  ".venv",
  "venv",
  ".env",
  "env",
  ".eggs",
  ".mypy_cache",
  ".pytest_cache",
  ".gradle",
  ".idea",
  ".vscode",
  ".vs",
  "target",       // Rust/Java build output
  "out",
  ".output",
  ".turbo",
  ".vercel",
  ".svelte-kit",
  "bower_components",
  ".bundle",
  "__snapshots__",
]);

// File extensions to skip (binary, generated, lock files)
const SKIP_EXTENSIONS = new Set([
  ".min.js",
  ".min.css",
  ".map",
  ".lock",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".svg",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp4",
  ".webm",
  ".mp3",
  ".wav",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".xz",
  ".7z",
  ".rar",
  ".pdf",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".pyc",
  ".pyo",
  ".class",
  ".o",
  ".obj",
  ".a",
  ".lib",
  ".wasm",
  ".bin",
  ".dat",
  ".db",
  ".sqlite",
  ".sqlite3",
]);

// Specific filenames to skip
const SKIP_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Cargo.lock",
  "Gemfile.lock",
  "poetry.lock",
  "composer.lock",
  "go.sum",
  ".DS_Store",
  "Thumbs.db",
]);

// Max file size to process (1MB) — larger files are skipped
const MAX_FILE_SIZE = 1_048_576;

function shouldSkipDir(dirName: string): boolean {
  return SKIP_DIRS.has(dirName) || dirName.startsWith(".");
}

function shouldSkipFile(fileName: string, sizeBytes: number): boolean {
  if (SKIP_FILES.has(fileName)) return true;
  if (sizeBytes > MAX_FILE_SIZE) return true;
  if (sizeBytes === 0) return true;

  // Check multi-part extensions (e.g., .min.js)
  const lower = fileName.toLowerCase();
  for (const ext of SKIP_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }

  return false;
}

function isBinaryContent(buffer: Buffer): boolean {
  // Check first 8KB for null bytes (strong indicator of binary)
  const checkLength = Math.min(buffer.length, 8192);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

/**
 * Walk a cloned repository and return all processable source files.
 */
export async function walkRepo(repoPath: string): Promise<WalkedFile[]> {
  const results: WalkedFile[] = [];
  await walkDirectory(repoPath, repoPath, results);
  // Sort for deterministic ordering (idempotent)
  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return results;
}

async function walkDirectory(
  rootPath: string,
  currentPath: string,
  results: WalkedFile[],
): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
  } catch {
    // Permission denied or other read error — skip silently
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      if (!shouldSkipDir(entry.name)) {
        await walkDirectory(rootPath, fullPath, results);
      }
      continue;
    }

    if (!entry.isFile()) continue;

    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(fullPath);
    } catch {
      continue;
    }

    if (shouldSkipFile(entry.name, stat.size)) continue;

    try {
      const buffer = await fs.promises.readFile(fullPath);

      // Skip binary files
      if (isBinaryContent(buffer)) continue;

      const content = buffer.toString("utf-8");
      const contentHash = crypto.createHash("sha256").update(buffer).digest("hex");
      const lineCount = content.split("\n").length;

      const relativePath = path
        .relative(rootPath, fullPath)
        .split(path.sep)
        .join("/");

      results.push({
        relativePath,
        absolutePath: fullPath,
        sizeBytes: stat.size,
        contentHash,
        lineCount,
        content,
      });
    } catch {
      // Read error — skip file
    }
  }
}
