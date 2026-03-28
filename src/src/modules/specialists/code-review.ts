/**
 * Code review specialist — 4 parallel agents: Security, Architecture,
 * Performance, Code Style. Returns a structured review with per-category
 * findings, adapted from DeepWiki's code_review.py.
 */

import { runSpecialists, type SpecialistConfig, type SpecialistResult } from "./executor";

// ---------------------------------------------------------------------------
// Prompts (adapted from DeepWiki code_review_prompts.py)
// ---------------------------------------------------------------------------

const SECURITY_PROMPT = `You are a security specialist performing a code review. Your job is to analyze code for security vulnerabilities.

Focus on:
1. Injection vulnerabilities (SQL, command, XSS, etc.)
2. Authentication and authorization issues
3. Sensitive data exposure (hardcoded secrets, tokens in code)
4. Insecure dependencies or configurations
5. Missing input validation or sanitization
6. CSRF, CORS misconfigurations
7. Insecure cryptographic practices
8. Path traversal vulnerabilities

For each finding, report:
- File path
- Severity: Critical / Major / Minor
- Description of the vulnerability
- Recommended fix

If no security issues are found, state that explicitly and note any good security practices observed.
Only report issues based on evidence in the code. Do not speculate.`;

const ARCHITECTURE_PROMPT = `You are an architecture specialist performing a code review. Analyze the code for architectural quality.

Focus on:
1. Separation of concerns — are responsibilities clearly divided?
2. Dependency management — are there circular dependencies or tight coupling?
3. API design — are interfaces clean and consistent?
4. Error handling patterns — is error handling comprehensive and consistent?
5. Code organization — are files and modules logically structured?
6. Scalability concerns — are there patterns that would break at scale?
7. Design pattern usage — are patterns used appropriately?

For each finding, report:
- File path(s)
- Severity: Major / Minor / Info
- Description of the issue
- Recommendation for improvement

If the architecture is solid, say so and highlight the good patterns.`;

const PERFORMANCE_PROMPT = `You are a performance specialist performing a code review. Analyze the code for performance issues.

Focus on:
1. N+1 query patterns or excessive database calls
2. Missing caching opportunities
3. Unnecessary memory allocations or copies
4. Blocking operations in async contexts
5. Inefficient algorithms or data structures
6. Missing pagination for large data sets
7. Resource leaks (unclosed connections, file handles)
8. Excessive logging or serialization in hot paths

For each finding, report:
- File path
- Severity: Critical / Major / Minor
- Description of the performance concern
- Estimated impact: high / medium / low
- Recommended optimization

Be practical — only report issues that would have measurable impact.`;

const STYLE_PROMPT = `You are a code style and quality specialist performing a code review. Analyze code against the project's own conventions.

Focus on:
1. Naming conventions — are they consistent across the codebase?
2. Code formatting — is it consistent?
3. Documentation — are public APIs documented? Are complex algorithms explained?
4. Dead code — are there unused imports, variables, or functions?
5. Code duplication — are there patterns that should be extracted?
6. Type safety — are types used consistently?
7. Error messages — are they helpful for debugging?
8. Magic numbers or strings — should they be constants?

For each finding, report:
- File path
- Severity: Minor / Info
- Description
- Suggestion

Focus on patterns, not individual lines. If the style is consistent, say so.`;

const COORDINATOR_PROMPT = `You are a senior code review coordinator. You receive findings from 4 specialist reviewers (Security, Architecture, Performance, Style). Synthesize their findings into a single, well-organized code review report.

Output a severity-ranked review with the following structure:

## Code Review Report

### Critical Issues
(Security vulnerabilities, data loss risks, breaking changes)

### Major Issues
(Architecture problems, significant performance issues, maintainability concerns)

### Minor Issues
(Style inconsistencies, minor performance improvements, suggestions)

### Positive Observations
(Good patterns found, well-implemented features)

### Summary
(Overall assessment with actionable next steps)

For each finding, include:
- **File**: The file path where the issue was found
- **Severity**: Critical / Major / Minor / Info
- **Description**: What the issue is
- **Recommendation**: How to fix it

Be specific. Reference actual file paths and code patterns from the specialist findings.
Do not invent issues that were not reported by specialists.`;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CodeReviewResult {
  specialists: SpecialistResult[];
  synthesis: string;
  /** ISO timestamp when the review was generated */
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runCodeReview(repoConnectionId: string): Promise<CodeReviewResult> {
  const specialists: SpecialistConfig[] = [
    {
      role: "Security",
      prompt: SECURITY_PROMPT,
      domainFilter: "security authentication authorization validation input",
      contextBudget: 8000,
    },
    {
      role: "Architecture",
      prompt: ARCHITECTURE_PROMPT,
      domainFilter: "architecture structure patterns design modules",
      contextBudget: 8000,
    },
    {
      role: "Performance",
      prompt: PERFORMANCE_PROMPT,
      domainFilter: "performance caching async database queries optimization",
      contextBudget: 8000,
    },
    {
      role: "Code Style",
      prompt: STYLE_PROMPT,
      domainFilter: "naming conventions types documentation exports",
      contextBudget: 8000,
    },
  ];

  const { specialists: results, synthesis } = await runSpecialists(
    repoConnectionId,
    specialists,
    COORDINATOR_PROMPT,
  );

  return { specialists: results, synthesis, generatedAt: new Date().toISOString() };
}
