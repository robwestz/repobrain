/**
 * Language detection by file extension.
 * Returns a normalized language identifier or null for unknown/binary files.
 */

const EXTENSION_MAP: Record<string, string> = {
  // JavaScript / TypeScript
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",

  // Python
  ".py": "python",
  ".pyi": "python",
  ".pyw": "python",

  // Go
  ".go": "go",

  // Rust
  ".rs": "rust",

  // Java
  ".java": "java",

  // C / C++
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".hxx": "cpp",

  // C#
  ".cs": "csharp",

  // Ruby
  ".rb": "ruby",
  ".rake": "ruby",
  ".gemspec": "ruby",

  // PHP
  ".php": "php",

  // Swift
  ".swift": "swift",

  // Kotlin
  ".kt": "kotlin",
  ".kts": "kotlin",

  // Scala
  ".scala": "scala",

  // Shell
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",

  // Web
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "scss",
  ".sass": "sass",
  ".less": "less",
  ".vue": "vue",
  ".svelte": "svelte",

  // Data / Config
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".xml": "xml",
  ".ini": "ini",
  ".cfg": "ini",

  // Markup
  ".md": "markdown",
  ".mdx": "markdown",
  ".rst": "restructuredtext",
  ".tex": "latex",

  // SQL
  ".sql": "sql",

  // Elixir / Erlang
  ".ex": "elixir",
  ".exs": "elixir",
  ".erl": "erlang",

  // Haskell
  ".hs": "haskell",

  // Lua
  ".lua": "lua",

  // R
  ".r": "r",
  ".R": "r",

  // Dart
  ".dart": "dart",

  // Zig
  ".zig": "zig",

  // Dockerfile
  ".dockerfile": "dockerfile",

  // GraphQL
  ".graphql": "graphql",
  ".gql": "graphql",

  // Protobuf
  ".proto": "protobuf",
};

// Special filenames that map to languages
const FILENAME_MAP: Record<string, string> = {
  "Dockerfile": "dockerfile",
  "Makefile": "makefile",
  "CMakeLists.txt": "cmake",
  "Rakefile": "ruby",
  "Gemfile": "ruby",
  "Vagrantfile": "ruby",
  ".gitignore": "gitignore",
  ".dockerignore": "dockerignore",
  ".env": "dotenv",
  ".env.example": "dotenv",
  ".env.local": "dotenv",
};

// Languages that tree-sitter supports (we have/can load WASM grammars for)
export const TREE_SITTER_LANGUAGES = new Set([
  "javascript",
  "typescript",
  "python",
  "go",
  "rust",
  "java",
]);

export function detectLanguage(filePath: string): string | null {
  const parts = filePath.split("/");
  const fileName = parts[parts.length - 1];

  // Check full filename first
  if (FILENAME_MAP[fileName]) {
    return FILENAME_MAP[fileName];
  }

  // Check extension
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const ext = fileName.slice(dotIndex).toLowerCase();
  return EXTENSION_MAP[ext] ?? null;
}

export function supportsTreeSitter(language: string): boolean {
  return TREE_SITTER_LANGUAGES.has(language);
}
