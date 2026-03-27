# Job 09: Smart Onboarding Paths

## Summary
AI generates personalized learning paths for developers new to a codebase. Based on the repo's architecture, it creates an interactive walkthrough: "Start with the data model, then understand the auth flow, then explore the API layer." Each step links to actual code with explanations. Think of it as an AI senior developer onboarding you.

## Size: M-L (~4h)

## Dependencies: None

## What to Build

### 1. Onboarding Module
Create `src/modules/onboarding/`

#### path-generator.ts — Learning path generation
```typescript
interface OnboardingStep {
  order: number;
  title: string;
  description: string; // AI-generated explanation
  focusFiles: { path: string; startLine?: number; endLine?: number; why: string }[];
  keySymbols: { name: string; kind: string; filePath: string; explanation: string }[];
  conceptsLearned: string[]; // what you understand after this step
  estimatedMinutes: number;
}

interface OnboardingPath {
  id: string;
  repoConnectionId: string;
  role: string; // "frontend developer", "backend developer", "new team member"
  title: string; // "Getting Started with RepoBrain"
  overview: string; // 2-3 sentence repo overview
  totalSteps: number;
  estimatedTotalMinutes: number;
  steps: OnboardingStep[];
  generatedAt: string;
}

async function generateOnboardingPath(
  repoConnectionId: string,
  role: string
): Promise<OnboardingPath>
```

**Implementation:**
1. Gather repo context:
   - Repo summary (from `repo_summaries` table if available)
   - File count, language breakdown (from `files` table)
   - Top-level directory structure (from `files` table, group by first path segment)
   - Key symbols: most-referenced symbols (highest afferent coupling from `symbol_relations`)
   - Entry points: route handlers, main files, index files
2. Build a prompt for the LLM:
```
You are generating a developer onboarding guide for a codebase.

Repository stats:
- {fileCount} files across {languages}
- Key directories: {topDirs}
- Most important symbols: {topSymbols with file paths}
- Entry points: {entryPoints}
- Repo summary: {summary}

Generate a {5-8} step learning path for a {role} developer.
Each step should focus on one concept/layer. Order from foundational to advanced.
For each step, specify which files to read and which symbols to understand.
Return as JSON matching this schema: {schema}
```
3. Parse LLM response
4. Validate file paths and symbol names against DB (remove any hallucinated ones)
5. Cache in Redis for 30 min per (repoConnectionId, role)

### 2. Database Schema
Create `src/lib/db/schema-onboarding.ts`:

```typescript
import { pgTable, uuid, text, varchar, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { repoConnections, users } from "./schema";

export const onboardingProgress = pgTable("onboarding_progress", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  repoConnectionId: uuid("repo_connection_id").notNull().references(() => repoConnections.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 100 }).notNull(),
  completedSteps: jsonb("completed_steps").default([]).notNull(), // array of step numbers
  currentStep: integer("current_step").default(1).notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
});
```

Add to `src/lib/db/schema.ts`:
```typescript
export * from "./schema-onboarding";
```

### 3. API Routes

#### POST /api/workspaces/[workspaceId]/repos/[repoId]/onboarding/generate
Request:
```json
{
  "role": "backend developer"
}
```
Response: `OnboardingPath` JSON

#### GET /api/workspaces/[workspaceId]/repos/[repoId]/onboarding/progress
Returns user's onboarding progress for this repo.

#### PATCH /api/workspaces/[workspaceId]/repos/[repoId]/onboarding/progress
Update progress (mark step complete, update current step).

Create files under: `src/app/api/workspaces/[workspaceId]/repos/[repoId]/onboarding/`

### 4. UI — Onboarding Page
Create `src/app/workspace/[workspaceId]/onboarding/page.tsx`

#### OnboardingView (`src/components/onboarding/onboarding-view.tsx`)
Main onboarding interface.

**Initial state (no path generated yet):**
- Welcome message: "Let's get you familiar with this codebase"
- Role selector: dropdown or cards
  - "Full-stack developer"
  - "Frontend developer"
  - "Backend developer"
  - "DevOps / Infrastructure"
  - "New team member (general)"
- "Generate my learning path" button

**Path generated state:**
- Left sidebar: step list with progress indicators
  - Each step: number + title + checkmark if complete + time estimate
  - Current step highlighted
  - Completed steps have green checkmark
  - Progress bar at top showing overall completion

- Main content area (current step):
  - Step title (large)
  - Description (AI-generated, 2-3 paragraphs)
  - "Key Files" section:
    - Each file as a card: path + "why read this" text
    - Click → opens file in code viewer (use router.push)
  - "Key Concepts" section:
    - Symbol cards: name + kind + explanation
    - Click → opens file at that symbol in code viewer
  - "What you learned" checklist:
    - Each concept as a checkbox
    - User can check off concepts they understood
  - Navigation: "Previous Step" / "Mark Complete & Next Step" buttons

**Completion state:**
- Congratulations message
- Summary of what was covered
- "Start exploring on your own" link to workspace

#### StepCard (`src/components/onboarding/step-card.tsx`)
Card for displaying a single step's content.

#### ProgressTracker (`src/components/onboarding/progress-tracker.tsx`)
The left sidebar step list with progress.

### 5. Integration
- Add "Onboarding" to sidebar nav with a graduation cap icon
- On workspace page, if user has never generated an onboarding path, show a banner: "New to this codebase? Start your guided tour →"

## Files to Create
- `src/modules/onboarding/path-generator.ts`
- `src/lib/db/schema-onboarding.ts`
- `src/app/api/workspaces/[workspaceId]/repos/[repoId]/onboarding/generate/route.ts`
- `src/app/api/workspaces/[workspaceId]/repos/[repoId]/onboarding/progress/route.ts`
- `src/app/workspace/[workspaceId]/onboarding/page.tsx`
- `src/components/onboarding/onboarding-view.tsx`
- `src/components/onboarding/step-card.tsx`
- `src/components/onboarding/progress-tracker.tsx`

## Files to Modify
- `src/lib/db/schema.ts` — Add `export * from "./schema-onboarding"`
- `src/components/layout/sidebar-nav.tsx` — Add "Onboarding" nav item (if exists)

## NPM Packages: None

## Acceptance Criteria
1. Onboarding page loads at `/workspace/{wId}/onboarding`
2. User can select a role and generate a learning path
3. Path has 5-8 steps, each with files and symbols
4. All file paths and symbol names in the path actually exist in the repo
5. User can navigate between steps
6. Clicking a file opens it in the code viewer
7. Progress persists (can leave and come back)
8. Path is cached (regenerating same role is fast)
9. Loading state shown while LLM generates the path
10. `npm run build` passes

## What NOT to Do
- Do not pre-generate paths at index time (on-demand only)
- Do not build a quiz or test system
- Do not add video or interactive tutorial features
- Do not modify the ingestion pipeline
- Do not add multi-user path sharing
