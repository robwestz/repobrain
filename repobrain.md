Här får du ett paket i två led:

en masterprompt till Opus 4.6 i Cursor för att ta fram styrpaketet
en byggprompt till agentteamet som använder Opus-outputen som kontrakt

Jag har skrivit det så att det ska vara så nära “copy-paste och kör” som möjligt.

Del 1 — Prompt till Opus 4.6 i Cursor

Kopiera allt nedan som ett enda startmeddelande till Opus.

You are acting as a principal product architect, staff-level software architect, and AI systems designer.

Your task is to create a production-grade, agent-executable master package for a product called RepoBrain.

## Mission

Design RepoBrain as a real product, not a toy demo.

RepoBrain is an AI-native workspace for understanding, analyzing, improving, and changing one or more GitHub repositories from a third-person intelligence perspective.

The product is meant to feel like a codebase intelligence layer over a repo or a set of repos.

It must help a user:
- connect GitHub repositories
- index and understand the codebase
- ask deep questions about the codebase
- get grounded answers with citations
- inspect files and relevant code
- receive improvement recommendations
- propose and apply file changes
- create branch / commit / push flows safely

This is NOT a request to build a full Devin clone.
This IS a request to define a focused, product-worthy system with strong repo understanding, actionable analysis, and controlled change workflows.

---

## Core product framing

RepoBrain should be positioned conceptually as:

**"A third-person intelligence layer over your codebase."**

Not merely:
- chat with repo
- AI editor
- code search UI

The product must combine:
- codebase understanding
- architecture reasoning
- actionable improvement guidance
- grounded citations
- file-level inspection
- controlled edit/apply/commit/push workflows

---

## Critical requirements

You must produce a full package that is strong enough to guide a lower-cost agent team to implement the foundation with minimal ambiguity.

This means your output must be:
- concrete
- implementation-aware
- modular
- explicit about scope boundaries
- explicit about what v1 is and is not
- explicit about contracts between components
- explicit about phased execution
- explicit about acceptance criteria

Do not produce vague startup fluff.
Do not produce generic high-level architecture diagrams without implementation consequence.
Do not produce hand-wavy “future ideas” in place of product definition.

---

## Product intent

RepoBrain is primarily intended to solve these user jobs:

1. Understand my existing codebase better than a generic LLM can.
2. Ask architecture, dependency, and improvement questions about my repo.
3. Get answers grounded in the actual repo, with references.
4. Inspect the exact relevant files and code.
5. Move from insight to proposed change.
6. Safely apply changes and push them through Git workflows.
7. Eventually support multi-repo intelligence, but without making v1 bloated.

---

## Important strategic constraints

You must design for the full product vision, but structure execution in phases.

You must NOT recommend building the entire product in one shot.

You must instead:
- design the full product architecture so the foundation is not throwaway
- define a true v1 that already feels like a product
- define later phases cleanly
- make sure v1 does not paint the system into a corner

The philosophy is:

**Full vision, staged execution, no throwaway foundations.**

---

## What RepoBrain must eventually support

At the full vision level, assume the product may eventually include:

- GitHub auth and repo connection
- one or multiple repos per workspace
- indexing pipeline
- code + docs + config ingestion
- symbol-aware retrieval
- semantic + lexical + structural retrieval
- citations to files / symbols / lines where feasible
- repo-level Q&A
- file-scoped Q&A
- architecture summaries
- improvement opportunities
- technical debt analysis
- reuse / extraction opportunities
- code change suggestion
- diff preview
- controlled apply flow
- branch / commit / push
- PR draft generation later
- multi-repo reasoning later

But your job is to decide:
- what must be in v1
- what belongs in later phases
- what must be architected now even if not built immediately

---

## Technical orientation

Assume a modern web product with a likely stack such as:
- Next.js / TypeScript frontend
- API backend (Node/Nest/Fastify/Express or similar)
- Postgres
- Redis / background jobs if needed
- object storage if needed
- vector store or pgvector
- GitHub integration
- LLM provider abstraction
- indexing / retrieval pipeline

You may recommend a specific stack if justified, but be pragmatic.
Do not over-engineer.
Do not choose technologies that add complexity without strong payoff.

---

## Your required output

You MUST produce the package as a deterministic document with these exact sections and headings:

# 00_START_HERE
A crisp operator guide for the implementation team.
Explain in plain language:
- what RepoBrain is
- what must be built first
- what must not be built yet
- how to use the rest of the package
- what the implementation order is
- what the critical invariants are

# 01_PRODUCT_BRIEF
Define:
- target user
- core user jobs
- primary product promise
- key differentiators
- why this product is worth building
- what “third-person intelligence layer” means in practical terms
- anti-goals

# 02_VISION_AND_PHASE_STRATEGY
Define:
- full product vision
- phase model
- why phased execution is necessary
- what must be designed now vs built now
- phase 0 / 1 / 2 / 3 / 4 plan
- risks of building too much too early

# 03_V1_SCOPE
Define the real v1.
Be precise.
Include:
- in-scope features
- out-of-scope features
- user flows
- what makes v1 “product-worthy”
- what v1 must prove

# 04_SYSTEM_ARCHITECTURE
Define the major components.
At minimum cover:
- frontend app
- API/backend
- GitHub integration layer
- ingestion/indexing pipeline
- retrieval layer
- LLM orchestration layer
- change proposal/application layer
- persistence/data stores
- background jobs
- auth/workspace model
For each component include:
- purpose
- responsibilities
- inputs/outputs
- dependencies
- non-responsibilities

# 05_DOMAIN_MODEL
Define the core data/domain entities and relationships.
Be concrete.
Likely entities may include:
- User
- Workspace
- Repo
- RepoConnection
- RepoSnapshot or CommitSnapshot
- File
- Symbol
- SymbolRelation
- Chunk
- EmbeddingRecord
- Conversation
- Message
- Citation
- AnalysisArtifact
- SuggestedChange
- AppliedChange
- BranchAction
- IndexJob
- RetrievalTrace
You may adjust names, but you must produce a coherent domain model.

# 06_RETRIEVAL_AND_REASONING_DESIGN
Define how RepoBrain should answer questions well.
At minimum cover:
- semantic retrieval
- lexical retrieval
- structural retrieval
- symbol-aware retrieval
- repo summary context
- file-scoped context
- branch/commit awareness
- citation strategy
- failure handling when context is insufficient
- how to avoid generic answers
- how to keep answers grounded in the codebase

# 07_CHANGE_WORKFLOW_CONTRACT
This section is critical.
Define the exact contract for all write actions.
Separate clearly:
- propose
- preview
- approve
- apply
- branch
- commit
- push
Include safety requirements and UX expectations.
The system must never blur “suggested” and “applied”.

# 08_UI_AND_WORKSPACE_LAYOUT
Define the recommended product surface.
At minimum cover:
- information architecture
- primary screens
- workspace layout
- repo selector
- file tree
- code/file viewer
- chat/insights pane
- diff/change review pane
- navigation states
- empty states
- index status visibility
- error states
Describe what the user should feel and understand in the UI.

# 09_MODULE_BOUNDARIES_AND_INTERFACE_CONTRACTS
Define clear module boundaries for implementation agents.
For each major module define:
- what it owns
- what it may depend on
- what it must not mutate outside its boundary
- the interfaces it exposes
- the assumptions it may rely on

# 10_IMPLEMENTATION_PLAN
Provide a staged implementation plan suitable for an agent team.
Break work into workstreams and milestones.
Include sequencing.
Make it realistic.
Include:
- foundation work
- first usable path
- hard dependencies
- parallelizable work
- review checkpoints

# 11_ACCEPTANCE_CRITERIA
Define acceptance criteria for:
- architecture
- v1 product behavior
- retrieval quality
- citation quality
- safety of write flow
- UI clarity
- integration correctness
- deployability of foundation

# 12_RISKS_AND_FAILURE_MODES
Define:
- product risks
- technical risks
- retrieval risks
- UX risks
- scope risks
- data consistency risks
- GitHub integration risks
- how to detect and mitigate them

# 13_DECISION_LOG
List the key decisions made in the package and why.
This must be explicit so future agents do not drift.

# 14_BUILD_GUIDANCE_FOR_AGENT_TEAMS
Write direct instructions for lower-cost implementation agents.
Explain:
- how to read the package
- what they must treat as fixed
- where they may make local decisions
- when they must stop and escalate
- how to avoid architectural drift

---

## Output quality bar

The package must be:
- detailed enough to implement from
- concise enough to remain operable
- opinionated enough to reduce ambiguity
- structured enough for multi-agent work
- realistic enough that an experienced engineer would respect it

Avoid fluffy prose.
Prefer direct, controlled language.
Be explicit where uncertainty remains.
Do not pretend certainty where there is none.

---

## Additional instruction

Where useful, include:
- recommended API boundary examples
- suggested folder or service boundaries
- example state transitions
- example retrieval flow
- example write-flow sequence

But only where they reduce ambiguity.

---

## Final requirement

At the very end, include a section:

# 15_EXECUTIVE_SUMMARY_FOR_HUMAN_FOUNDER

This should summarize in compact form:
- what RepoBrain v1 actually is
- what to build first
- what to delay
- what makes it valuable
- what would most likely kill the project if done wrong

Now produce the full package.
Del 2 — Prompt till agentteamet i nästa led

Det här är prompten du ger till agentteamet när du har fått Opus-outputen.

Du klistrar då in både prompten nedan och Opus-dokumentet efter den.

You are an implementation agent team tasked with building the foundation of RepoBrain.

You are NOT here to redesign the product.
You are here to implement the product foundation according to the attached master package.

The attached package is the source of truth.

Your job is to:
- read it carefully
- preserve its architecture and scope boundaries
- implement in the intended order
- avoid drift
- avoid “helpful” re-interpretation of core concepts
- avoid building excluded features early
- produce concrete implementation outputs

---

## Operating mode

Treat the attached package as a contract, not inspiration.

You may make local implementation decisions only when:
- they do not conflict with the package
- they stay inside the module boundary you are working in
- they do not introduce new product scope
- they do not break future phases

If something important is underspecified, do NOT silently invent product behavior.
Instead:
1. make the smallest safe assumption
2. flag it explicitly
3. proceed only if it does not risk architecture drift

---

## Mission

Build the RepoBrain foundation so that the product can reach a true v1 with no throwaway core layers.

You must prioritize:
- clean foundation
- correct module boundaries
- correct data model implementation
- correct repo ingestion path
- correct retrieval baseline
- correct write-flow separation
- correct workspace UI shell

You must not prioritize:
- flashy extras
- speculative future features
- autonomous agent behavior
- unnecessary infra complexity
- premature optimization beyond obvious good engineering

---

## Required working style

When implementing, always reason in this order:

1. What section of the master package governs this work?
2. What exact module boundary applies?
3. What are the inputs/outputs for this module?
4. What must remain stable for later phases?
5. What is the smallest correct implementation that preserves the architecture?

---

## Deliverable format

You must work in explicit workstreams.

For each workstream you touch, provide:

### WORKSTREAM
Name of the workstream.

### GOAL
What this workstream is supposed to accomplish according to the package.

### RELEVANT PACKAGE SECTIONS
List the relevant sections from the master package.

### IMPLEMENTATION PLAN
Concrete implementation steps.

### FILES TO CREATE OR MODIFY
Be explicit.

### OUTPUT CONTRACT
What the module must expose or do when complete.

### RISKS / WATCHOUTS
What could go wrong if implemented carelessly.

### DONE CONDITION
How we know this part is complete enough for current phase.

---

## First task

Start by reading the attached master package and produce:

# IMPLEMENTATION_BOOTSTRAP

This section must include:

## 1. Recommended repository/app structure
Propose a concrete codebase structure for implementation, aligned with the package.

## 2. Workstream decomposition
Break the build into the minimum correct workstreams.

## 3. Dependency graph between workstreams
Show what depends on what.

## 4. Phase-1 implementation order
State exactly what should be built first, second, third, etc.

## 5. Non-negotiable invariants
List the things that must not drift.

## 6. Escalation triggers
List the situations where agents must stop and ask for review rather than improvise.

## 7. First executable milestone
Define the first milestone that should produce a real, testable vertical slice.

---

## Constraints

Do not:
- redesign the product strategy
- add speculative features
- collapse the write flow into a single unsafe action
- reduce citations to vague references
- flatten the domain model into generic blobs unless explicitly justified
- treat repo chat as the entire product
- build multi-repo complexity before the package says to
- build full IDE parity
- drift toward “Devin clone” scope

Do:
- preserve the “third-person intelligence layer” idea in practical implementation
- build for staged execution
- keep the foundation durable
- favor boring, dependable engineering over cleverness
- be explicit and implementation-oriented

---

## Important note

If the attached package contains both full product vision and staged v1 scope, you must implement against the staged scope while preserving compatibility with the larger vision.

That means:
- build for the future
- do not build the future yet

Now read the attached master package and produce the IMPLEMENTATION_BOOTSTRAP only.
Do not start coding yet.
Hur du använder detta i praktiken

Kör i den här ordningen:

1. Först Opus

Mata in prompten från Del 1.

Målet där är inte kod, utan ett riktigt styrpaket.

2. Läs resultatet snabbt manuellt

Kontrollera särskilt att dessa delar faktiskt blev skarpa:

v1-scope
datamodell
retrieval-design
write-flow contract
module boundaries
implementation plan
acceptance criteria

Om någon av de delarna känns fluffig, be Opus göra om just den sektionen.

3. Sedan agentteamet

Ge prompten från Del 2 plus hela Opus-dokumentet.

Första körningen ska bara ge dig:

repo/app-struktur
workstreams
beroendegraf
implementation order
invariants
första milestone

Inte kod ännu.

4. Först därefter låter du dem bygga

När bootstrapen ser bra ut kan du ge nästa instruktion, typ:

Proceed with Workstream 1 only.
Implement the smallest correct version that satisfies the package and the bootstrap.
Return:
- implementation summary
- files created/changed
- any assumptions made
- tests added
- unresolved issues
Min rekommendation

Det viktigaste här är att du inte låter agentteamet gå direkt från vision till bygge utan mellansteget där de först bryter ner allt enligt kontraktet.

Det är där mycket av kostnadsbesparingen och kvalitetsvinsten faktiskt uppstår.

Om du vill kan jag i nästa steg sätta ihop ett tredje promptpaket också, alltså:
review/checkpoint-prompts för när agentteamet byggt fas 1, så att du kan låta Opus göra arkitekturgranskning utan att behöva tänka ut granskningsprompts själv.