# Job 11: Codebase Narrator

## Summary
AI traces a flow through the codebase and generates a narrative walkthrough. "When a user sends a chat message, first the API route at POST /api/conversations/{id}/messages validates the session (auth.ts:15), then calls askQuestion() in chat/service.ts which triggers the retrieval pipeline..." Each step links to actual code. Not Q&A — proactive storytelling.

## Size: L (~5h)

## Dependencies: None

## What to Build

### 1. Narrator Module
Create `src/modules/narrator/`

#### flow-tracer.ts — Traces execution flow through symbol graph
```typescript
interface FlowStep {
  order: number;
  symbolName: string;
  symbolKind: string;
  filePath: string;
  startLine: number;
  endLine: number;
  code: string; // the actual code content
  incomingRelation?: string; // "calls", "imports"
}

interface TracedFlow {
  entryPoint: FlowStep;
  steps: FlowStep[];
  totalFiles: number;
  totalSymbols: number;
}

async function traceFlow(
  repoConnectionId: string,
  entrySymbolName: string,
  maxDepth?: number // default 10
): Promise<TracedFlow>
```

Implementation:
1. Find the entry symbol by name (query symbols table, fuzzy match)
2. From entry symbol, follow outgoing symbol_relations (calls, uses)
3. BFS traversal with depth limit
4. For each visited symbol, fetch its chunk content
5. Order steps by logical flow (BFS order = rough execution order)
6. Return max 15 steps to keep narrative focused

#### narrator.ts — AI narrative generation
```typescript
interface NarratedFlow {
  title: string;
  overview: string; // 2-3 sentence overview
  steps: NarratedStep[];
  conclusion: string;
}

interface NarratedStep {
  order: number;
  heading: string; // e.g. "Step 3: Retrieving relevant code chunks"
  narrative: string; // AI-generated explanation, 2-4 sentences
  filePath: string;
  startLine: number;
  endLine: number;
  code: string;
  symbolName: string;
  keyInsight: string; // one-line takeaway
}

async function narrateFlow(
  tracedFlow: TracedFlow,
  userPrompt: string // e.g. "Explain what happens when a user sends a chat message"
): Promise<NarratedFlow>
```

Implementation:
1. Build LLM prompt with all traced steps and their code
2. System prompt:
```
You are a senior developer narrating a code flow for a teammate.
For each step, explain what happens, why it matters, and how it connects to the next step.
Use the actual function/variable names. Reference specific line numbers.
Write in second person: "When you call X, it first Y, then Z..."
Keep each step explanation to 2-4 sentences. Be concrete, not abstract.
```
3. Parse structured JSON response
4. Validate all file paths and line numbers

#### suggestions.ts — Suggested flows
```typescript
async function suggestFlows(repoConnectionId: string): Promise<SuggestedFlow[]>
```

Suggests interesting flows to narrate based on:
- API route handlers (most common entry points)
- Functions with highest outgoing call chains
- Functions that cross multiple modules

Returns 5-10 suggestions like:
- "User authentication flow" (starting from OAuth callback)
- "Chat message processing" (starting from POST /messages)
- "Repository indexing pipeline" (starting from ingest worker)

### 2. API Routes

#### POST /api/workspaces/[workspaceId]/repos/[repoId]/narrate
Request:
```json
{
  "prompt": "Explain what happens when a user sends a chat message",
  "entrySymbol": "askQuestion" // optional, AI picks if not provided
}
```

Response: `NarratedFlow` JSON (streamed if possible, else full response)

#### GET /api/workspaces/[workspaceId]/repos/[repoId]/narrate/suggestions
Response:
```json
{
  "suggestions": [
    {
      "title": "Chat message processing",
      "description": "Follow a user's question through retrieval, LLM, and response",
      "entrySymbol": "askQuestion",
      "entryFile": "src/modules/chat/service.ts"
    }
  ]
}
```

Create: `src/app/api/workspaces/[workspaceId]/repos/[repoId]/narrate/route.ts`
Create: `src/app/api/workspaces/[workspaceId]/repos/[repoId]/narrate/suggestions/route.ts`

### 3. UI — Narrator Page
Create `src/app/workspace/[workspaceId]/narrator/page.tsx`

#### NarratorView (`src/components/narrator/narrator-view.tsx`)
Main view component.

**Initial state — flow selector:**
- "What flow would you like to understand?"
- Text input for free-form description
- OR pick from suggested flows (rendered as clickable cards)
- Optional: entry symbol input (advanced, collapsible)
- "Generate Walkthrough" button

**Narration state:**
- Title + overview at top
- Steps rendered as a vertical timeline/scroll:
  - Each step is a full-width card:
    - Step number + heading
    - Narrative text (AI-generated)
    - Code block with syntax highlighting (shiki)
    - File path + line range (clickable → code viewer)
    - Key insight (highlighted box)
    - Arrow/line connecting to next step
- Conclusion section at bottom
- "Open all files" button — opens all referenced files in code viewer tabs

**Loading state:**
- "Tracing flow through the codebase..."
- Then "Generating narrative..." (two phases)

#### NarratorStep (`src/components/narrator/narrator-step.tsx`)
Individual narration step card.

Props:
```typescript
interface NarratorStepProps {
  step: NarratedStep;
  isFirst: boolean;
  isLast: boolean;
  onFileClick: (filePath: string, line: number) => void;
}
```

Layout:
- Left: step number in a circle
- Right: content card with heading, narrative, code block, file link
- Connecting line between steps

#### FlowSuggestions (`src/components/narrator/flow-suggestions.tsx`)
Grid of suggested flow cards.

### 4. Integration
- Add "Narrator" to sidebar nav with a book/story icon
- In chat, when AI references a complex flow, add a "Narrate this flow" button

## Files to Create
- `src/modules/narrator/flow-tracer.ts`
- `src/modules/narrator/narrator.ts`
- `src/modules/narrator/suggestions.ts`
- `src/app/api/workspaces/[workspaceId]/repos/[repoId]/narrate/route.ts`
- `src/app/api/workspaces/[workspaceId]/repos/[repoId]/narrate/suggestions/route.ts`
- `src/app/workspace/[workspaceId]/narrator/page.tsx`
- `src/components/narrator/narrator-view.tsx`
- `src/components/narrator/narrator-step.tsx`
- `src/components/narrator/flow-suggestions.tsx`

## Files to Modify
- `src/components/layout/sidebar-nav.tsx` — Add "Narrator" nav item (if exists)

## No DB Schema Changes
## No New NPM Packages (uses existing shiki for code highlighting)

## Acceptance Criteria
1. Narrator page loads at `/workspace/{wId}/narrator`
2. Suggested flows are shown and clickable
3. User can type a free-form description of a flow
4. AI generates a coherent narrative walkthrough with code excerpts
5. Each step links to the actual code location
6. Clicking a file link opens code viewer at that line
7. Narrative reads naturally — tells a story, not just lists functions
8. Flow tracing correctly follows symbol_relations
9. Max 15 steps per narrative (focused, not exhaustive)
10. `npm run build` passes

## What NOT to Do
- Do not build this as a chat feature (it's a dedicated narrator)
- Do not trace more than 15 steps (keep it focused)
- Do not store narratives in DB (ephemeral, regenerate each time)
- Do not add audio/speech synthesis
- Do not modify the existing chat module
