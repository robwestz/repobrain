# Job 13: Dependency Galaxy

## Summary
Interactive force-directed graph visualization of the entire codebase's dependency network. Zoom from 10,000ft module view down to individual function calls. Nodes colored by type, sized by importance. The "wow factor" feature — makes complex codebases visually graspable in seconds.

## Size: L (~6h)

## Dependencies: None

## What to Build

### 1. Graph Data Module
Create `src/modules/dependency-graph/`

#### builder.ts — Graph data builder
```typescript
type ViewLevel = "module" | "file" | "symbol";

interface GraphNode {
  id: string;
  label: string;
  type: "module" | "file" | "class" | "function" | "method" | "interface" | "type" | "route";
  group: string; // module/directory group for coloring
  size: number; // relative importance (1-10)
  filePath?: string;
  symbolId?: string;
  metadata: {
    language?: string;
    lineCount?: number;
    symbolCount?: number;
    inDegree: number; // incoming edges
    outDegree: number; // outgoing edges
  };
}

interface GraphEdge {
  source: string; // node id
  target: string; // node id
  type: "imports" | "calls" | "extends" | "implements" | "uses";
  weight: number; // 1-5, thicker for stronger coupling
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  groups: { id: string; label: string; color: string }[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    avgDegree: number;
    clusters: number;
  };
}

async function buildGraph(
  repoConnectionId: string,
  level: ViewLevel,
  options?: {
    focusModule?: string; // filter to specific module
    maxNodes?: number; // default 200
    minEdgeWeight?: number; // filter weak connections
  }
): Promise<GraphData>
```

**Module-level graph:**
1. Group files by top-level directory: `src/modules/chat/`, `src/lib/`, etc.
2. Each module = one node
3. Edges = aggregated symbol_relations crossing module boundaries
4. Edge weight = count of cross-module relations
5. Node size = number of files in module

**File-level graph:**
1. Each file = one node
2. Edges = symbol_relations between files (deduplicated)
3. Filter: only files with at least 1 relation (skip orphan config files)
4. Edge weight = count of relations between file pair
5. Node size = symbol count in file
6. Max ~200 nodes for performance

**Symbol-level graph:**
1. Each symbol = one node (filter: only functions, classes, methods — skip variables)
2. Edges = direct symbol_relations
3. Filter to specific module/file for manageability
4. Node size = line count of symbol
5. Max ~150 nodes

#### queries.ts
```typescript
async function getModuleGraph(repoConnectionId: string): Promise<RawModuleEdge[]>
async function getFileGraph(repoConnectionId: string, focusModule?: string): Promise<RawFileEdge[]>
async function getSymbolGraph(repoConnectionId: string, filePath?: string): Promise<RawSymbolEdge[]>
async function getNodeMetadata(repoConnectionId: string, level: ViewLevel): Promise<Map<string, NodeMeta>>
```

### 2. API Route

#### GET /api/workspaces/[workspaceId]/repos/[repoId]/dependency-graph
Query: `?level=module|file|symbol` `&focus=src/modules/chat` `&maxNodes=200`

Response: `GraphData` JSON

Cache in Redis for 10 min.

Create: `src/app/api/workspaces/[workspaceId]/repos/[repoId]/dependency-graph/route.ts`

### 3. UI — Galaxy Page
Create `src/app/workspace/[workspaceId]/galaxy/page.tsx`

**Use `react-force-graph-2d` for the force-directed layout.** This is a lightweight React wrapper around d3-force that handles canvas rendering efficiently.

#### GalaxyView (`src/components/galaxy/galaxy-view.tsx`)
Main view component.

**Top control bar:**
- View level toggle: "Modules" | "Files" | "Symbols" (3 buttons)
- Focus filter: dropdown/input to narrow to specific module
- Node count limit slider (50-300)
- Edge type filter: checkboxes for imports/calls/extends/implements/uses
- Layout options: "Force" | "Radial" | "Tree" (force-graph supports these)
- Fullscreen toggle button

**Main area — Force graph canvas:**
- Fills remaining viewport
- Nodes rendered as circles:
  - Color: by group/module (each module gets a unique color from a palette)
  - Size: proportional to importance (inDegree + outDegree)
  - Label: node label (shown when zoomed in enough)
- Edges rendered as lines:
  - Color: by type (imports=gray, calls=blue, extends=green, implements=purple)
  - Thickness: by weight
  - Optional arrows showing direction
- Interactions:
  - **Zoom**: scroll wheel
  - **Pan**: drag background
  - **Drag node**: repositions the node
  - **Hover node**: highlight all connected edges, show tooltip with details
  - **Click node**:
    1. Center view on node
    2. Open detail panel
    3. If double-click: navigate to code viewer
  - **Right-click node**: "Analyze Blast Radius" (link to Job 12 if available)

**Right detail panel (on node click):**
- Node name + type badge
- File path (clickable → code viewer)
- Metrics: in-degree, out-degree, group
- Connected nodes list (grouped by relation type):
  - Incoming: "Called by: X, Y, Z"
  - Outgoing: "Calls: A, B, C"
  - Extends/Implements
- "Open in Code Viewer" button
- "Focus on this node" button (re-renders graph centered on this node's neighborhood)

**Legend:**
- Color legend for groups/modules
- Edge type legend with line styles

**Loading state:**
- "Building dependency graph..." with spinning icon

#### GraphCanvas (`src/components/galaxy/graph-canvas.tsx`)
Wrapper around react-force-graph-2d.

```typescript
"use client";

interface GraphCanvasProps {
  data: GraphData;
  onNodeClick: (node: GraphNode) => void;
  onNodeHover: (node: GraphNode | null) => void;
  highlightedNodeId?: string;
  edgeTypeFilter: Set<string>;
}
```

Implementation:
```typescript
import dynamic from "next/dynamic";

// Must be dynamically imported (no SSR — uses canvas)
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });
```

Configure force-graph:
- `nodeAutoColorBy="group"`
- `nodeRelSize={4}`
- `nodeLabel={node => node.label}`
- `linkColor={link => edgeTypeColorMap[link.type]}`
- `linkWidth={link => link.weight}`
- `linkDirectionalArrowLength={3}`
- `onNodeClick={handleNodeClick}`
- `warmupTicks={50}` (pre-simulate to avoid initial chaos)
- `cooldownTime={3000}`

#### NodeDetail (`src/components/galaxy/node-detail.tsx`)
Right panel showing selected node details.

### 4. Integration
- Add "Galaxy" to sidebar nav with a constellation/network icon — primary nav item
- In code viewer, add "Show in Galaxy" button linking to `/workspace/{wId}/galaxy?level=file&focus={filePath}`

## Files to Create
- `src/modules/dependency-graph/builder.ts`
- `src/modules/dependency-graph/queries.ts`
- `src/app/api/workspaces/[workspaceId]/repos/[repoId]/dependency-graph/route.ts`
- `src/app/workspace/[workspaceId]/galaxy/page.tsx`
- `src/components/galaxy/galaxy-view.tsx`
- `src/components/galaxy/graph-canvas.tsx`
- `src/components/galaxy/node-detail.tsx`

## Files to Modify
- `src/components/layout/sidebar-nav.tsx` — Add "Galaxy" nav item (if exists)
- `src/components/code-viewer/code-viewer.tsx` — Add "Show in Galaxy" button

## NPM Packages to Install
- `react-force-graph-2d` (lightweight force-directed graph renderer)

## Acceptance Criteria
1. Galaxy page loads at `/workspace/{wId}/galaxy`
2. Module-level view shows modules as nodes with connections
3. File-level view shows files with dependency edges
4. Symbol-level view shows functions/classes (filtered to manageable count)
5. Zooming and panning work smoothly
6. Hovering a node highlights its connections
7. Clicking a node shows detail panel with connections list
8. Double-clicking a node navigates to code viewer
9. View level toggle switches between module/file/symbol
10. Edge type filter hides/shows specific relation types
11. Graph renders within 2 seconds for 200 nodes
12. `npm run build` passes

## What NOT to Do
- Do not build a 3D graph (2D is sufficient and more performant)
- Do not try to render > 300 nodes (use maxNodes limit)
- Do not use D3 directly (react-force-graph-2d wraps it cleanly)
- Do not add graph editing/saving (read-only visualization)
- Do not add animation replay or time-travel features
