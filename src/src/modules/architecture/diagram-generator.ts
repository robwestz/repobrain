/**
 * Generates Mermaid diagram syntax from indexed DB data.
 * Four diagram types: module-dependency, component, data-flow, class-hierarchy.
 */

import {
  getModuleDependencies,
  getClassHierarchy,
  getApiRouteFiles,
  getRelationsFromFiles,
} from "./queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DiagramType = "module-dependency" | "component" | "data-flow" | "class-hierarchy";

export interface DiagramNode {
  id: string;
  label: string;
  type: "module" | "file" | "class" | "function" | "api-route" | "database" | "external";
  filePath?: string;
  symbolId?: string;
  metadata?: Record<string, string>;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  type: "imports" | "calls" | "extends" | "implements" | "data-flow" | "http";
}

export interface GeneratedDiagram {
  type: DiagramType;
  title: string;
  description: string;
  mermaidCode: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

interface GenerateOptions {
  focusPath?: string;
  maxDepth?: number;
  maxNodes?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sanitize a string for use as a Mermaid node ID (no spaces or special chars). */
function toNodeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+/, "").replace(/_+$/, "") || "node";
}

/** Truncate a label to keep Mermaid diagrams readable. */
function truncateLabel(s: string, max = 30): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/** Derive a human-friendly module label from a path like "src/modules/chat". */
function moduleLabel(modulePath: string): string {
  const parts = modulePath.split("/");
  // Last segment, title-cased
  const last = parts[parts.length - 1];
  return last.charAt(0).toUpperCase() + last.slice(1) + " Module";
}

// ---------------------------------------------------------------------------
// Module Dependency Diagram
// ---------------------------------------------------------------------------

async function generateModuleDependencyDiagram(
  repoConnectionId: string,
  options: GenerateOptions,
): Promise<GeneratedDiagram> {
  const maxNodes = options.maxNodes ?? 30;
  const deps = await getModuleDependencies(repoConnectionId);

  // Collect unique modules
  const moduleSet = new Set<string>();
  for (const d of deps) {
    moduleSet.add(d.fromModule);
    moduleSet.add(d.toModule);
  }

  // Build module file counts
  const moduleFileCounts = new Map<string, number>();
  for (const d of deps) {
    if (!moduleFileCounts.has(d.fromModule)) moduleFileCounts.set(d.fromModule, d.fromFileCount);
    if (!moduleFileCounts.has(d.toModule)) moduleFileCounts.set(d.toModule, d.toFileCount);
  }

  // If no data at all, return an empty diagram with a note
  if (moduleSet.size === 0) {
    return {
      type: "module-dependency",
      title: "Module Dependencies",
      description: "How modules depend on each other",
      mermaidCode: `graph LR\n  note["No module data yet — index a repository first"]`,
      nodes: [],
      edges: [],
    };
  }

  // Limit to top modules by activity
  const modules = Array.from(moduleSet).slice(0, maxNodes);

  const nodes: DiagramNode[] = modules.map((m) => ({
    id: toNodeId(m),
    label: moduleLabel(m),
    type: "module",
    metadata: { fileCount: String(moduleFileCounts.get(m) ?? 0) },
  }));

  const edges: DiagramEdge[] = deps
    .filter((d) => modules.includes(d.fromModule) && modules.includes(d.toModule))
    .map((d) => ({
      from: toNodeId(d.fromModule),
      to: toNodeId(d.toModule),
      label: d.depCount > 1 ? String(d.depCount) : undefined,
      type: "imports" as const,
    }));

  // Build mermaid code
  const lines: string[] = ["graph LR"];

  // Node definitions with file count in label
  for (const m of modules) {
    const id = toNodeId(m);
    const label = moduleLabel(m);
    const fileCount = moduleFileCounts.get(m) ?? 0;
    const parts = m.split("/");
    const lastSeg = parts[parts.length - 1];
    // Use database shape for db/storage modules
    const isDb = lastSeg === "db" || lastSeg === "database" || lastSeg === "storage";
    if (isDb) {
      lines.push(`  ${id}[(${label}<br/>${fileCount} files)]`);
    } else {
      lines.push(`  ${id}[${label}<br/>${fileCount} files]`);
    }
  }

  lines.push("");

  // Edge definitions
  for (const dep of deps) {
    if (!modules.includes(dep.fromModule) || !modules.includes(dep.toModule)) continue;
    const fromId = toNodeId(dep.fromModule);
    const toId = toNodeId(dep.toModule);
    if (dep.depCount > 5) {
      lines.push(`  ${fromId} ==>|${dep.depCount}| ${toId}`);
    } else if (dep.depCount > 1) {
      lines.push(`  ${fromId} -->|${dep.depCount}| ${toId}`);
    } else {
      lines.push(`  ${fromId} --> ${toId}`);
    }
  }

  return {
    type: "module-dependency",
    title: "Module Dependencies",
    description: "How modules depend on each other based on symbol relations",
    mermaidCode: lines.join("\n"),
    nodes,
    edges,
  };
}

// ---------------------------------------------------------------------------
// Component Diagram
// ---------------------------------------------------------------------------

async function generateComponentDiagram(
  repoConnectionId: string,
  options: GenerateOptions,
): Promise<GeneratedDiagram> {
  const maxNodes = options.maxNodes ?? 40;
  const classNodes = await getClassHierarchy(repoConnectionId);

  if (classNodes.length === 0) {
    return {
      type: "component",
      title: "Component Diagram",
      description: "Classes and interfaces with their relationships",
      mermaidCode: `classDiagram\n  note "No class/interface data yet — index a repository first"`,
      nodes: [],
      edges: [],
    };
  }

  // Deduplicate symbols
  const symbolMap = new Map<
    string,
    { id: string; name: string; kind: string; filePath: string }
  >();
  for (const cn of classNodes) {
    if (!symbolMap.has(cn.symbolId)) {
      symbolMap.set(cn.symbolId, {
        id: cn.symbolId,
        name: cn.symbolName,
        kind: cn.kind,
        filePath: cn.filePath,
      });
    }
    if (cn.relatedSymbolId && !symbolMap.has(cn.relatedSymbolId)) {
      symbolMap.set(cn.relatedSymbolId, {
        id: cn.relatedSymbolId,
        name: cn.relatedSymbolName ?? "Unknown",
        kind: cn.relatedSymbolKind ?? "class",
        filePath: cn.filePath,
      });
    }
  }

  const allSymbols = Array.from(symbolMap.values()).slice(0, maxNodes);
  const symbolIdSet = new Set(allSymbols.map((s) => s.id));

  const nodes: DiagramNode[] = allSymbols.map((s) => ({
    id: toNodeId(s.name + "_" + s.id.slice(0, 6)),
    label: s.name,
    type: s.kind === "interface" ? "class" : "class",
    filePath: s.filePath,
    symbolId: s.id,
  }));

  const edges: DiagramEdge[] = [];

  // Build mermaid class diagram
  const lines: string[] = ["classDiagram"];

  // Emit class/interface definitions
  const emittedClasses = new Set<string>();
  for (const s of allSymbols) {
    const safeName = toNodeId(s.name);
    if (!emittedClasses.has(s.id)) {
      emittedClasses.add(s.id);
      if (s.kind === "interface") {
        lines.push(`  class ${safeName} {`);
        lines.push(`    <<interface>>`);
        lines.push(`  }`);
      } else if (s.kind === "type") {
        lines.push(`  class ${safeName} {`);
        lines.push(`    <<type>>`);
        lines.push(`  }`);
      } else {
        lines.push(`  class ${safeName}`);
      }
    }
  }

  lines.push("");

  // Emit relationships
  for (const cn of classNodes) {
    if (!symbolIdSet.has(cn.symbolId)) continue;
    if (!cn.relatedSymbolId || !symbolIdSet.has(cn.relatedSymbolId)) continue;
    if (!cn.relationType) continue;

    const fromName = toNodeId(cn.symbolName);
    const toSym = symbolMap.get(cn.relatedSymbolId);
    if (!toSym) continue;
    const toName = toNodeId(toSym.name);

    if (cn.relationType === "extends") {
      lines.push(`  ${fromName} --|> ${toName} : extends`);
      edges.push({ from: toNodeId(cn.symbolId), to: toNodeId(cn.relatedSymbolId), type: "extends" });
    } else if (cn.relationType === "implements") {
      lines.push(`  ${fromName} ..|> ${toName} : implements`);
      edges.push({ from: toNodeId(cn.symbolId), to: toNodeId(cn.relatedSymbolId), type: "implements" });
    }
  }

  return {
    type: "component",
    title: "Component Diagram",
    description: "Classes and interfaces with their inheritance and implementation relationships",
    mermaidCode: lines.join("\n"),
    nodes,
    edges,
  };
}

// ---------------------------------------------------------------------------
// Data Flow Diagram
// ---------------------------------------------------------------------------

async function generateDataFlowDiagram(
  repoConnectionId: string,
  options: GenerateOptions,
): Promise<GeneratedDiagram> {
  const maxNodes = options.maxNodes ?? 40;

  // Find API route files
  const apiFiles = await getApiRouteFiles(repoConnectionId);

  if (apiFiles.length === 0) {
    return {
      type: "data-flow",
      title: "Data Flow",
      description: "How data flows from API routes through services to the database",
      mermaidCode: `graph TD\n  note["No API routes found — index a repository first"]`,
      nodes: [],
      edges: [],
    };
  }

  const apiFileIds = apiFiles.map((f) => f.fileId);
  const relations = await getRelationsFromFiles(repoConnectionId, apiFileIds);

  // Build nodes — API routes first, then referenced files
  const fileSet = new Map<string, string>(); // fileId -> path
  for (const f of apiFiles) fileSet.set(f.fileId, f.filePath);
  for (const r of relations) {
    const toFileId = relations.find(
      (rel) => rel.toSymbolId === r.toSymbolId,
    )?.toFilePath;
    if (toFileId && !fileSet.has(r.toSymbolId)) {
      // Just track the path from relations
    }
  }

  // Collect unique file paths from relations
  const referencedFiles = new Map<string, string>(); // path -> node id
  for (const rel of relations) {
    referencedFiles.set(rel.fromFilePath, toNodeId("file_" + rel.fromFilePath));
    referencedFiles.set(rel.toFilePath, toNodeId("file_" + rel.toFilePath));
  }

  const allFilePaths = Array.from(referencedFiles.keys()).slice(0, maxNodes);

  const nodes: DiagramNode[] = [];
  const addedNodeIds = new Set<string>();

  for (const fp of allFilePaths) {
    const nodeId = toNodeId("file_" + fp);
    if (addedNodeIds.has(nodeId)) continue;
    addedNodeIds.add(nodeId);

    const isApiRoute = fp.includes("/api/");
    const isDb = fp.includes("/db/") || fp.includes("schema") || fp.includes("migrate");
    const fileName = fp.split("/").pop() ?? fp;

    nodes.push({
      id: nodeId,
      label: truncateLabel(fileName),
      type: isApiRoute ? "api-route" : isDb ? "database" : "file",
      filePath: fp,
    });
  }

  // Has database references?
  const hasDbRefs = relations.some(
    (r) => r.toFilePath.includes("/db/") || r.toFilePath.includes("schema"),
  );

  const edges: DiagramEdge[] = relations
    .filter(
      (r) =>
        allFilePaths.includes(r.fromFilePath) && allFilePaths.includes(r.toFilePath),
    )
    .map((r) => ({
      from: toNodeId("file_" + r.fromFilePath),
      to: toNodeId("file_" + r.toFilePath),
      label: r.relationType,
      type: (r.relationType === "calls" ? "calls" : "imports") as DiagramEdge["type"],
    }));

  // Remove duplicate edges
  const edgeKeys = new Set<string>();
  const uniqueEdges = edges.filter((e) => {
    const key = `${e.from}-->${e.to}`;
    if (edgeKeys.has(key)) return false;
    edgeKeys.add(key);
    return true;
  });

  // Build mermaid
  const lines: string[] = ["graph TD"];

  // Add DB node if we have DB references
  if (hasDbRefs) {
    lines.push(`  db_node[(PostgreSQL<br/>Database)]`);
    if (!addedNodeIds.has("db_node")) {
      nodes.push({ id: "db_node", label: "PostgreSQL", type: "database" });
    }
  }

  for (const node of nodes) {
    if (node.type === "api-route") {
      const routePath = node.filePath
        ? node.filePath.replace(/.*\/api\//, "/api/").replace(/\/route\.ts$/, "")
        : node.label;
      lines.push(`  ${node.id}["${truncateLabel(routePath, 40)}"]`);
    } else if (node.type === "database") {
      lines.push(`  ${node.id}[(${node.label})]`);
    } else {
      lines.push(`  ${node.id}["${node.label}"]`);
    }
  }

  lines.push("");

  for (const edge of uniqueEdges) {
    if (edge.label) {
      lines.push(`  ${edge.from} -->|${edge.label}| ${edge.to}`);
    } else {
      lines.push(`  ${edge.from} --> ${edge.to}`);
    }
  }

  // Connect db-touching files to db_node
  if (hasDbRefs) {
    for (const node of nodes) {
      if (
        node.filePath &&
        (node.filePath.includes("/db/") || node.filePath.includes("schema"))
      ) {
        lines.push(`  ${node.id} --> db_node`);
      }
    }
  }

  if (allFilePaths.length === 0) {
    return {
      type: "data-flow",
      title: "Data Flow",
      description: "How data flows from API routes through services to the database",
      mermaidCode: `graph TD\n  note["No call chains found for API routes"]`,
      nodes: [],
      edges: [],
    };
  }

  return {
    type: "data-flow",
    title: "Data Flow",
    description: "How data flows from API routes through services to the database",
    mermaidCode: lines.join("\n"),
    nodes,
    edges: uniqueEdges,
  };
}

// ---------------------------------------------------------------------------
// Class Hierarchy Diagram
// ---------------------------------------------------------------------------

async function generateClassHierarchyDiagram(
  repoConnectionId: string,
  options: GenerateOptions,
): Promise<GeneratedDiagram> {
  const maxNodes = options.maxNodes ?? 50;
  const classNodes = await getClassHierarchy(repoConnectionId);

  if (classNodes.length === 0) {
    return {
      type: "class-hierarchy",
      title: "Class Hierarchy",
      description: "Inheritance and implementation chains",
      mermaidCode: `classDiagram\n  note "No class hierarchy data — index a repository first"`,
      nodes: [],
      edges: [],
    };
  }

  // Only include classes/interfaces that have relationships
  const symbolsWithRels = new Set<string>();
  for (const cn of classNodes) {
    if (cn.relationType && cn.relatedSymbolId) {
      symbolsWithRels.add(cn.symbolId);
      symbolsWithRels.add(cn.relatedSymbolId);
    }
  }

  // Fallback: include all if none have relationships
  const targetSymbols =
    symbolsWithRels.size > 0 ? symbolsWithRels : new Set(classNodes.map((cn) => cn.symbolId));

  // Deduplicate
  const symbolMap = new Map<string, { name: string; kind: string; filePath: string }>();
  for (const cn of classNodes) {
    if (targetSymbols.has(cn.symbolId) && !symbolMap.has(cn.symbolId)) {
      symbolMap.set(cn.symbolId, {
        name: cn.symbolName,
        kind: cn.kind,
        filePath: cn.filePath,
      });
    }
    if (
      cn.relatedSymbolId &&
      cn.relatedSymbolName &&
      targetSymbols.has(cn.relatedSymbolId) &&
      !symbolMap.has(cn.relatedSymbolId)
    ) {
      symbolMap.set(cn.relatedSymbolId, {
        name: cn.relatedSymbolName,
        kind: cn.relatedSymbolKind ?? "class",
        filePath: cn.filePath,
      });
    }
  }

  const allSymbols = Array.from(symbolMap.entries()).slice(0, maxNodes);
  const symbolIdSet = new Set(allSymbols.map(([id]) => id));

  const nodes: DiagramNode[] = allSymbols.map(([id, s]) => ({
    id: toNodeId(s.name + "_" + id.slice(0, 6)),
    label: s.name,
    type: "class",
    filePath: s.filePath,
    symbolId: id,
  }));

  const edges: DiagramEdge[] = [];
  const lines: string[] = ["classDiagram"];

  const emittedClasses = new Set<string>();
  for (const [id, s] of allSymbols) {
    const safeName = toNodeId(s.name);
    if (!emittedClasses.has(id)) {
      emittedClasses.add(id);
      if (s.kind === "interface") {
        lines.push(`  class ${safeName} {`);
        lines.push(`    <<interface>>`);
        lines.push(`  }`);
      } else if (s.kind === "type") {
        lines.push(`  class ${safeName} {`);
        lines.push(`    <<type>>`);
        lines.push(`  }`);
      } else {
        lines.push(`  class ${safeName}`);
      }
    }
  }

  lines.push("");

  const emittedEdges = new Set<string>();
  for (const cn of classNodes) {
    if (!symbolIdSet.has(cn.symbolId)) continue;
    if (!cn.relatedSymbolId || !symbolIdSet.has(cn.relatedSymbolId)) continue;
    if (!cn.relationType) continue;

    const fromSym = symbolMap.get(cn.symbolId);
    const toSym = symbolMap.get(cn.relatedSymbolId);
    if (!fromSym || !toSym) continue;

    const fromName = toNodeId(fromSym.name);
    const toName = toNodeId(toSym.name);
    const edgeKey = `${fromName}|${cn.relationType}|${toName}`;

    if (emittedEdges.has(edgeKey)) continue;
    emittedEdges.add(edgeKey);

    if (cn.relationType === "extends") {
      lines.push(`  ${fromName} --|> ${toName} : extends`);
      edges.push({ from: cn.symbolId, to: cn.relatedSymbolId, type: "extends" });
    } else if (cn.relationType === "implements") {
      lines.push(`  ${fromName} ..|> ${toName} : implements`);
      edges.push({ from: cn.symbolId, to: cn.relatedSymbolId, type: "implements" });
    }
  }

  return {
    type: "class-hierarchy",
    title: "Class Hierarchy",
    description: "Inheritance and implementation chains across the codebase",
    mermaidCode: lines.join("\n"),
    nodes,
    edges,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function generateDiagram(
  repoConnectionId: string,
  diagramType: DiagramType,
  options: GenerateOptions = {},
): Promise<GeneratedDiagram> {
  switch (diagramType) {
    case "module-dependency":
      return generateModuleDependencyDiagram(repoConnectionId, options);
    case "component":
      return generateComponentDiagram(repoConnectionId, options);
    case "data-flow":
      return generateDataFlowDiagram(repoConnectionId, options);
    case "class-hierarchy":
      return generateClassHierarchyDiagram(repoConnectionId, options);
    default:
      throw new Error(`Unknown diagram type: ${diagramType}`);
  }
}
