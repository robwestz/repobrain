/**
 * Symbol extraction using tree-sitter WASM and regex fallback.
 *
 * Extracts functions, classes, methods, interfaces, types, imports, exports
 * from source files. Uses tree-sitter WASM grammars when available for
 * JS/TS/Python/Go/Rust/Java. Falls back to regex for other languages.
 *
 * Grammar .wasm files are loaded from node_modules/web-tree-sitter
 * or a `grammars/` directory at the project root.
 */

import type { SymbolKind } from "@/src/types/domain";

export interface ExtractedSymbol {
  name: string;
  kind: SymbolKind;
  startLine: number; // 1-based
  endLine: number;   // 1-based
  signature: string | null;
  children: ExtractedSymbol[];
}

export interface ExtractedImport {
  /** The module/package being imported from */
  source: string;
  /** Individual imported names, or null for side-effect/namespace imports */
  names: string[];
}

export interface ExtractionResult {
  symbols: ExtractedSymbol[];
  imports: ExtractedImport[];
  exports: string[];
}

// Tree-sitter initialization state
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let TreeSitterModule: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let parserInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadedLanguages: Map<string, any> = new Map();
let initAttempted = false;
let initSucceeded = false;

async function initTreeSitter(): Promise<boolean> {
  if (initAttempted) return initSucceeded;
  initAttempted = true;

  try {
    const mod = await import("web-tree-sitter");
    TreeSitterModule = mod.default ?? mod;
    await TreeSitterModule.init();
    parserInstance = new TreeSitterModule();
    initSucceeded = true;
    return true;
  } catch (err) {
    console.warn("[symbols] tree-sitter WASM init failed, using regex fallback:", err);
    initSucceeded = false;
    return false;
  }
}

async function loadLanguageGrammar(language: string): Promise<boolean> {
  if (loadedLanguages.has(language)) return true;
  if (!TreeSitterModule || !parserInstance) return false;

  // Map our language names to tree-sitter grammar names
  const grammarMap: Record<string, string> = {
    javascript: "javascript",
    typescript: "typescript",
    python: "python",
    go: "go",
    rust: "rust",
    java: "java",
  };

  const grammarName = grammarMap[language];
  if (!grammarName) return false;

  // Try multiple paths for grammar .wasm files
  const possiblePaths = [
    `${process.cwd()}/grammars/tree-sitter-${grammarName}.wasm`,
    `${process.cwd()}/node_modules/tree-sitter-wasms/out/tree-sitter-${grammarName}.wasm`,
    `${process.cwd()}/public/grammars/tree-sitter-${grammarName}.wasm`,
  ];

  // For TypeScript, also try tsx grammar
  if (language === "typescript") {
    possiblePaths.unshift(
      `${process.cwd()}/grammars/tree-sitter-tsx.wasm`,
      `${process.cwd()}/node_modules/tree-sitter-wasms/out/tree-sitter-tsx.wasm`,
    );
  }

  for (const wasmPath of possiblePaths) {
    try {
      const fs = await import("fs");
      if (!fs.existsSync(wasmPath)) continue;
      const lang = await TreeSitterModule.Language.load(wasmPath);
      loadedLanguages.set(language, lang);
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

/**
 * Extract symbols from a source file.
 * Uses tree-sitter when available, regex fallback otherwise.
 */
export async function extractSymbols(
  content: string,
  language: string,
  filePath: string,
): Promise<ExtractionResult> {
  const tsInited = await initTreeSitter();

  if (tsInited) {
    const grammarLoaded = await loadLanguageGrammar(language);
    if (grammarLoaded && parserInstance) {
      try {
        return extractWithTreeSitter(content, language);
      } catch (err) {
        console.warn(`[symbols] tree-sitter parse failed for ${filePath}, using regex:`, err);
      }
    }
  }

  return extractWithRegex(content, language);
}

// ---------------------------------------------------------------------------
// Tree-sitter extraction
// ---------------------------------------------------------------------------

function extractWithTreeSitter(content: string, language: string): ExtractionResult {
  if (!parserInstance || !loadedLanguages.has(language)) {
    return extractWithRegex(content, language);
  }

  const lang = loadedLanguages.get(language);
  parserInstance.setLanguage(lang);
  const tree = parserInstance.parse(content);
  const rootNode = tree.rootNode;

  const symbols: ExtractedSymbol[] = [];
  const imports: ExtractedImport[] = [];
  const exports: string[] = [];
  const lines = content.split("\n");

  function nodeText(node: { startIndex: number; endIndex: number }): string {
    return content.slice(node.startIndex, node.endIndex);
  }

  function getSignature(node: { startPosition: { row: number } }): string | null {
    const line = lines[node.startPosition.row];
    return line ? line.trim() : null;
  }

  function walk(node: { type: string; children: typeof node[]; startPosition: { row: number }; endPosition: { row: number }; childForFieldName: (name: string) => typeof node | null; namedChildren: typeof node[] }): void {
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;

    switch (language) {
      case "javascript":
      case "typescript":
        extractJsTsNode(node, startLine, endLine, symbols, imports, exports, nodeText, getSignature);
        break;
      case "python":
        extractPythonNode(node, startLine, endLine, symbols, imports, nodeText, getSignature);
        break;
      case "go":
        extractGoNode(node, startLine, endLine, symbols, imports, nodeText, getSignature);
        break;
      case "rust":
        extractRustNode(node, startLine, endLine, symbols, imports, nodeText, getSignature);
        break;
      case "java":
        extractJavaNode(node, startLine, endLine, symbols, imports, nodeText, getSignature);
        break;
    }

    for (const child of node.children) {
      walk(child);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walk(rootNode as any);
  tree.delete();

  return { symbols, imports, exports };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function extractJsTsNode(
  node: any,
  startLine: number,
  endLine: number,
  symbols: ExtractedSymbol[],
  imports: ExtractedImport[],
  exports: string[],
  nodeText: (n: any) => string,
  getSignature: (n: any) => string | null,
): void {
  switch (node.type) {
    case "function_declaration": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          name: nodeText(nameNode),
          kind: "function",
          startLine,
          endLine,
          signature: getSignature(node),
          children: [],
        });
      }
      break;
    }
    case "class_declaration": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          name: nodeText(nameNode),
          kind: "class",
          startLine,
          endLine,
          signature: getSignature(node),
          children: [],
        });
      }
      break;
    }
    case "method_definition": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          name: nodeText(nameNode),
          kind: "method",
          startLine,
          endLine,
          signature: getSignature(node),
          children: [],
        });
      }
      break;
    }
    case "interface_declaration": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          name: nodeText(nameNode),
          kind: "interface",
          startLine,
          endLine,
          signature: getSignature(node),
          children: [],
        });
      }
      break;
    }
    case "type_alias_declaration": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          name: nodeText(nameNode),
          kind: "type",
          startLine,
          endLine,
          signature: getSignature(node),
          children: [],
        });
      }
      break;
    }
    case "lexical_declaration":
    case "variable_declaration": {
      // Handle: const foo = ..., export const foo = ...
      for (const decl of node.namedChildren) {
        if (decl.type === "variable_declarator") {
          const nameNode = decl.childForFieldName("name");
          const valueNode = decl.childForFieldName("value");
          if (nameNode) {
            const isArrowFunc = valueNode?.type === "arrow_function";
            const isFuncExpr = valueNode?.type === "function_expression" || valueNode?.type === "function";
            symbols.push({
              name: nodeText(nameNode),
              kind: isArrowFunc || isFuncExpr ? "function" : "variable",
              startLine,
              endLine,
              signature: getSignature(node),
              children: [],
            });
          }
        }
      }
      break;
    }
    case "import_statement": {
      const sourceNode = node.childForFieldName("source");
      if (sourceNode) {
        const source = nodeText(sourceNode).replace(/['"]/g, "");
        const names: string[] = [];
        for (const child of node.namedChildren) {
          if (child.type === "import_specifier") {
            const nameNode = child.childForFieldName("name");
            if (nameNode) names.push(nodeText(nameNode));
          } else if (child.type === "import_clause") {
            for (const subChild of child.namedChildren) {
              if (subChild.type === "identifier") {
                names.push(nodeText(subChild));
              } else if (subChild.type === "named_imports") {
                for (const spec of subChild.namedChildren) {
                  if (spec.type === "import_specifier") {
                    const specName = spec.childForFieldName("name");
                    if (specName) names.push(nodeText(specName));
                  }
                }
              }
            }
          }
        }
        imports.push({ source, names });
      }
      break;
    }
    case "export_statement": {
      const declNode = node.childForFieldName("declaration");
      if (declNode) {
        const nameNode = declNode.childForFieldName("name");
        if (nameNode) exports.push(nodeText(nameNode));
      }
      break;
    }
  }
}

function extractPythonNode(
  node: any,
  startLine: number,
  endLine: number,
  symbols: ExtractedSymbol[],
  imports: ExtractedImport[],
  nodeText: (n: any) => string,
  getSignature: (n: any) => string | null,
): void {
  switch (node.type) {
    case "function_definition": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          name: nodeText(nameNode),
          kind: "function",
          startLine,
          endLine,
          signature: getSignature(node),
          children: [],
        });
      }
      break;
    }
    case "class_definition": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          name: nodeText(nameNode),
          kind: "class",
          startLine,
          endLine,
          signature: getSignature(node),
          children: [],
        });
      }
      break;
    }
    case "import_statement":
    case "import_from_statement": {
      const moduleName = node.childForFieldName("module_name");
      if (moduleName) {
        const names: string[] = [];
        for (const child of node.namedChildren) {
          if (child.type === "dotted_name" && child !== moduleName) {
            names.push(nodeText(child));
          } else if (child.type === "aliased_import") {
            const nameNode = child.childForFieldName("name");
            if (nameNode) names.push(nodeText(nameNode));
          }
        }
        imports.push({ source: nodeText(moduleName), names });
      }
      break;
    }
  }
}

function extractGoNode(
  node: any,
  startLine: number,
  endLine: number,
  symbols: ExtractedSymbol[],
  imports: ExtractedImport[],
  nodeText: (n: any) => string,
  getSignature: (n: any) => string | null,
): void {
  switch (node.type) {
    case "function_declaration": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          name: nodeText(nameNode),
          kind: "function",
          startLine,
          endLine,
          signature: getSignature(node),
          children: [],
        });
      }
      break;
    }
    case "method_declaration": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          name: nodeText(nameNode),
          kind: "method",
          startLine,
          endLine,
          signature: getSignature(node),
          children: [],
        });
      }
      break;
    }
    case "type_declaration": {
      for (const spec of node.namedChildren) {
        if (spec.type === "type_spec") {
          const nameNode = spec.childForFieldName("name");
          const typeNode = spec.childForFieldName("type");
          if (nameNode) {
            const isInterface = typeNode?.type === "interface_type";
            symbols.push({
              name: nodeText(nameNode),
              kind: isInterface ? "interface" : "type",
              startLine: spec.startPosition.row + 1,
              endLine: spec.endPosition.row + 1,
              signature: getSignature(spec),
              children: [],
            });
          }
        }
      }
      break;
    }
    case "import_declaration": {
      for (const child of node.namedChildren) {
        if (child.type === "import_spec") {
          const pathNode = child.childForFieldName("path");
          if (pathNode) {
            imports.push({
              source: nodeText(pathNode).replace(/"/g, ""),
              names: [],
            });
          }
        } else if (child.type === "import_spec_list") {
          for (const spec of child.namedChildren) {
            if (spec.type === "import_spec") {
              const pathNode = spec.childForFieldName("path");
              if (pathNode) {
                imports.push({
                  source: nodeText(pathNode).replace(/"/g, ""),
                  names: [],
                });
              }
            }
          }
        }
      }
      break;
    }
  }
}

function extractRustNode(
  node: any,
  startLine: number,
  endLine: number,
  symbols: ExtractedSymbol[],
  imports: ExtractedImport[],
  nodeText: (n: any) => string,
  getSignature: (n: any) => string | null,
): void {
  switch (node.type) {
    case "function_item": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          name: nodeText(nameNode),
          kind: "function",
          startLine,
          endLine,
          signature: getSignature(node),
          children: [],
        });
      }
      break;
    }
    case "struct_item": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          name: nodeText(nameNode),
          kind: "class",
          startLine,
          endLine,
          signature: getSignature(node),
          children: [],
        });
      }
      break;
    }
    case "impl_item": {
      const nameNode = node.childForFieldName("type");
      if (nameNode) {
        symbols.push({
          name: nodeText(nameNode),
          kind: "class",
          startLine,
          endLine,
          signature: getSignature(node),
          children: [],
        });
      }
      break;
    }
    case "trait_item": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          name: nodeText(nameNode),
          kind: "interface",
          startLine,
          endLine,
          signature: getSignature(node),
          children: [],
        });
      }
      break;
    }
    case "enum_item": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          name: nodeText(nameNode),
          kind: "enum",
          startLine,
          endLine,
          signature: getSignature(node),
          children: [],
        });
      }
      break;
    }
    case "use_declaration": {
      const argNode = node.childForFieldName("argument");
      if (argNode) {
        imports.push({
          source: nodeText(argNode),
          names: [],
        });
      }
      break;
    }
  }
}

function extractJavaNode(
  node: any,
  startLine: number,
  endLine: number,
  symbols: ExtractedSymbol[],
  imports: ExtractedImport[],
  nodeText: (n: any) => string,
  getSignature: (n: any) => string | null,
): void {
  switch (node.type) {
    case "method_declaration": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          name: nodeText(nameNode),
          kind: "method",
          startLine,
          endLine,
          signature: getSignature(node),
          children: [],
        });
      }
      break;
    }
    case "class_declaration": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          name: nodeText(nameNode),
          kind: "class",
          startLine,
          endLine,
          signature: getSignature(node),
          children: [],
        });
      }
      break;
    }
    case "interface_declaration": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          name: nodeText(nameNode),
          kind: "interface",
          startLine,
          endLine,
          signature: getSignature(node),
          children: [],
        });
      }
      break;
    }
    case "enum_declaration": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          name: nodeText(nameNode),
          kind: "enum",
          startLine,
          endLine,
          signature: getSignature(node),
          children: [],
        });
      }
      break;
    }
    case "import_declaration": {
      const lastChild = node.namedChildren[node.namedChildren.length - 1];
      if (lastChild) {
        imports.push({
          source: nodeText(lastChild),
          names: [],
        });
      }
      break;
    }
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Regex-based fallback extraction
// ---------------------------------------------------------------------------

// Each language has patterns for common constructs
const REGEX_PATTERNS: Record<string, RegexPattern[]> = {
  javascript: jstsPatterns(),
  typescript: jstsPatterns(),
  python: pythonPatterns(),
  go: goPatterns(),
  rust: rustPatterns(),
  java: javaPatterns(),
  csharp: csharpPatterns(),
  ruby: rubyPatterns(),
  php: phpPatterns(),
  kotlin: kotlinPatterns(),
  swift: swiftPatterns(),
};

interface RegexPattern {
  regex: RegExp;
  kind: SymbolKind;
  nameGroup: number;
  type?: "import" | "export";
  sourceGroup?: number;
}

function jstsPatterns(): RegexPattern[] {
  return [
    { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm, kind: "function", nameGroup: 1 },
    { regex: /^(?:export\s+)?class\s+(\w+)/gm, kind: "class", nameGroup: 1 },
    { regex: /^(?:export\s+)?interface\s+(\w+)/gm, kind: "interface", nameGroup: 1 },
    { regex: /^(?:export\s+)?type\s+(\w+)\s*=/gm, kind: "type", nameGroup: 1 },
    { regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/gm, kind: "function", nameGroup: 1 },
    { regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>/gm, kind: "function", nameGroup: 1 },
    { regex: /^(?:export\s+)?enum\s+(\w+)/gm, kind: "enum", nameGroup: 1 },
    { regex: /^import\s+.*?\s+from\s+['"]([^'"]+)['"]/gm, kind: "variable", nameGroup: 1, type: "import", sourceGroup: 1 },
    { regex: /^export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/gm, kind: "variable", nameGroup: 1, type: "export" },
  ];
}

function pythonPatterns(): RegexPattern[] {
  return [
    { regex: /^(?:async\s+)?def\s+(\w+)\s*\(/gm, kind: "function", nameGroup: 1 },
    { regex: /^class\s+(\w+)/gm, kind: "class", nameGroup: 1 },
    { regex: /^from\s+(\S+)\s+import/gm, kind: "variable", nameGroup: 1, type: "import", sourceGroup: 1 },
    { regex: /^import\s+(\S+)/gm, kind: "variable", nameGroup: 1, type: "import", sourceGroup: 1 },
  ];
}

function goPatterns(): RegexPattern[] {
  return [
    { regex: /^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/gm, kind: "function", nameGroup: 1 },
    { regex: /^type\s+(\w+)\s+struct\b/gm, kind: "class", nameGroup: 1 },
    { regex: /^type\s+(\w+)\s+interface\b/gm, kind: "interface", nameGroup: 1 },
    { regex: /^type\s+(\w+)\s+/gm, kind: "type", nameGroup: 1 },
    { regex: /^\s*"([^"]+)"/gm, kind: "variable", nameGroup: 1, type: "import", sourceGroup: 1 },
  ];
}

function rustPatterns(): RegexPattern[] {
  return [
    { regex: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/gm, kind: "function", nameGroup: 1 },
    { regex: /^(?:pub\s+)?struct\s+(\w+)/gm, kind: "class", nameGroup: 1 },
    { regex: /^(?:pub\s+)?trait\s+(\w+)/gm, kind: "interface", nameGroup: 1 },
    { regex: /^(?:pub\s+)?enum\s+(\w+)/gm, kind: "enum", nameGroup: 1 },
    { regex: /^use\s+([\w:]+)/gm, kind: "variable", nameGroup: 1, type: "import", sourceGroup: 1 },
  ];
}

function javaPatterns(): RegexPattern[] {
  return [
    { regex: /(?:public|private|protected|static|\s)+[\w<>\[\]]+\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*\{/gm, kind: "method", nameGroup: 1 },
    { regex: /^(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/gm, kind: "class", nameGroup: 1 },
    { regex: /^(?:public\s+)?interface\s+(\w+)/gm, kind: "interface", nameGroup: 1 },
    { regex: /^(?:public\s+)?enum\s+(\w+)/gm, kind: "enum", nameGroup: 1 },
    { regex: /^import\s+([\w.]+);/gm, kind: "variable", nameGroup: 1, type: "import", sourceGroup: 1 },
  ];
}

function csharpPatterns(): RegexPattern[] {
  return [
    { regex: /(?:public|private|protected|internal|static|async|\s)+[\w<>\[\]?]+\s+(\w+)\s*\([^)]*\)/gm, kind: "method", nameGroup: 1 },
    { regex: /^(?:\s*(?:public|internal|abstract|sealed|static|partial)\s+)*class\s+(\w+)/gm, kind: "class", nameGroup: 1 },
    { regex: /^(?:\s*(?:public|internal)\s+)?interface\s+(\w+)/gm, kind: "interface", nameGroup: 1 },
    { regex: /^(?:\s*(?:public|internal)\s+)?enum\s+(\w+)/gm, kind: "enum", nameGroup: 1 },
    { regex: /^using\s+([\w.]+);/gm, kind: "variable", nameGroup: 1, type: "import", sourceGroup: 1 },
  ];
}

function rubyPatterns(): RegexPattern[] {
  return [
    { regex: /^\s*def\s+(?:self\.)?(\w+[?!=]?)/gm, kind: "function", nameGroup: 1 },
    { regex: /^\s*class\s+(\w+)/gm, kind: "class", nameGroup: 1 },
    { regex: /^\s*module\s+(\w+)/gm, kind: "module", nameGroup: 1 },
    { regex: /^require\s+['"]([^'"]+)['"]/gm, kind: "variable", nameGroup: 1, type: "import", sourceGroup: 1 },
  ];
}

function phpPatterns(): RegexPattern[] {
  return [
    { regex: /(?:public|private|protected|static|\s)+function\s+(\w+)\s*\(/gm, kind: "function", nameGroup: 1 },
    { regex: /^(?:abstract\s+)?class\s+(\w+)/gm, kind: "class", nameGroup: 1 },
    { regex: /^interface\s+(\w+)/gm, kind: "interface", nameGroup: 1 },
    { regex: /^use\s+([\w\\]+);/gm, kind: "variable", nameGroup: 1, type: "import", sourceGroup: 1 },
  ];
}

function kotlinPatterns(): RegexPattern[] {
  return [
    { regex: /^\s*(?:(?:public|private|internal|protected|open|abstract|override|suspend)\s+)*fun\s+(\w+)/gm, kind: "function", nameGroup: 1 },
    { regex: /^\s*(?:(?:public|private|internal|open|abstract|data|sealed)\s+)*class\s+(\w+)/gm, kind: "class", nameGroup: 1 },
    { regex: /^\s*interface\s+(\w+)/gm, kind: "interface", nameGroup: 1 },
    { regex: /^import\s+([\w.]+)/gm, kind: "variable", nameGroup: 1, type: "import", sourceGroup: 1 },
  ];
}

function swiftPatterns(): RegexPattern[] {
  return [
    { regex: /^\s*(?:(?:public|private|internal|open|static|class|override)\s+)*func\s+(\w+)/gm, kind: "function", nameGroup: 1 },
    { regex: /^\s*(?:(?:public|private|internal|open|final)\s+)*class\s+(\w+)/gm, kind: "class", nameGroup: 1 },
    { regex: /^\s*(?:(?:public|private|internal)\s+)?protocol\s+(\w+)/gm, kind: "interface", nameGroup: 1 },
    { regex: /^\s*(?:(?:public|private|internal)\s+)?struct\s+(\w+)/gm, kind: "class", nameGroup: 1 },
    { regex: /^\s*(?:(?:public|private|internal)\s+)?enum\s+(\w+)/gm, kind: "enum", nameGroup: 1 },
    { regex: /^import\s+(\w+)/gm, kind: "variable", nameGroup: 1, type: "import", sourceGroup: 1 },
  ];
}

function extractWithRegex(content: string, language: string): ExtractionResult {
  const patterns = REGEX_PATTERNS[language];
  if (!patterns) {
    return { symbols: [], imports: [], exports: [] };
  }

  const symbols: ExtractedSymbol[] = [];
  const imports: ExtractedImport[] = [];
  const exports: string[] = [];
  const lines = content.split("\n");

  for (const pattern of patterns) {
    // Reset regex state
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.regex.exec(content)) !== null) {
      const name = match[pattern.nameGroup];
      if (!name) continue;

      if (pattern.type === "import" && pattern.sourceGroup !== undefined) {
        const source = match[pattern.sourceGroup];
        if (source) {
          imports.push({ source, names: [name] });
        }
        continue;
      }

      if (pattern.type === "export") {
        exports.push(name);
        continue;
      }

      // Calculate line number from character offset
      const beforeMatch = content.slice(0, match.index);
      const startLine = beforeMatch.split("\n").length;

      // Estimate end line by finding the matching closing brace/dedent
      const endLine = estimateEndLine(lines, startLine - 1, language);

      symbols.push({
        name,
        kind: pattern.kind,
        startLine,
        endLine,
        signature: lines[startLine - 1]?.trim() ?? null,
        children: [],
      });
    }
  }

  return { symbols, imports, exports };
}

/**
 * Estimate where a symbol block ends by counting braces or indentation.
 */
function estimateEndLine(lines: string[], startIdx: number, language: string): number {
  if (language === "python") {
    // Python uses indentation
    const startIndent = lines[startIdx]?.search(/\S/) ?? 0;
    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === "") continue;
      const indent = line.search(/\S/);
      if (indent <= startIndent && line.trim() !== "") {
        return i; // 1-based from the loop, but i is 0-based so this is line number of the next symbol
      }
    }
    return lines.length;
  }

  // Brace-based languages
  let braceCount = 0;
  let foundOpenBrace = false;
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    for (const char of line) {
      if (char === "{") {
        braceCount++;
        foundOpenBrace = true;
      } else if (char === "}") {
        braceCount--;
        if (foundOpenBrace && braceCount === 0) {
          return i + 1; // 1-based
        }
      }
    }
  }

  // If no braces found (single-line), return start line
  if (!foundOpenBrace) return startIdx + 1;

  return Math.min(startIdx + 50, lines.length);
}
