/**
 * Security audit specialist — 4 parallel agents focused on authentication,
 * authorization, data protection, and dependency security.
 * Adapted from DeepWiki's audit_generator.py.
 */

import { runSpecialists, type SpecialistConfig, type SpecialistResult } from "./executor";

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const AUTH_PROMPT = `You are an authentication security specialist. Analyze code for authentication vulnerabilities and weaknesses.

Inspect for:
1. Weak or missing session management
2. Insecure password storage (plaintext, weak hashing)
3. Missing multi-factor authentication hooks
4. JWT/token misuse (no expiry, weak secrets, algorithm confusion)
5. Default or hardcoded credentials
6. Missing rate limiting on auth endpoints
7. Insecure "remember me" or persistent login implementations
8. OAuth/OIDC misconfiguration

For each finding report:
- **Severity**: Critical / High / Medium / Low
- **File**: Exact file path
- **Pattern**: What the vulnerable code looks like
- **Risk**: What could go wrong
- **Fix**: How to remediate`;

const AUTHZ_PROMPT = `You are an authorization security specialist. Analyze code for authorization vulnerabilities.

Inspect for:
1. Missing authorization checks on endpoints or operations
2. Broken object-level authorization (BOLA/IDOR)
3. Privilege escalation paths
4. Insecure direct object references
5. Role/permission check bypasses
6. Missing ownership verification
7. Horizontal privilege escalation (user A accessing user B's data)
8. Admin-only routes accessible to regular users

For each finding report:
- **Severity**: Critical / High / Medium / Low
- **File**: Exact file path
- **Pattern**: What the vulnerable code looks like
- **Risk**: What could go wrong
- **Fix**: How to remediate`;

const DATA_PROTECTION_PROMPT = `You are a data protection specialist. Analyze code for data exposure and protection issues.

Inspect for:
1. Hardcoded secrets: API keys, passwords, tokens in source code
2. Sensitive data in logs (passwords, tokens, PII)
3. Unencrypted sensitive data at rest or in transit
4. Overly verbose error messages leaking internals
5. SQL/NoSQL injection: unsafe query construction
6. Path traversal: unsafe file path handling
7. Insecure deserialization (unsafe eval, pickle, JSON with reviver)
8. Missing input sanitization for XSS/injection
9. CORS misconfiguration allowing unauthorized origins
10. Missing security headers (CSP, HSTS, X-Frame-Options)

For each finding report:
- **Severity**: Critical / High / Medium / Low
- **File**: Exact file path
- **Pattern**: What the vulnerable code looks like
- **Risk**: What could go wrong
- **Fix**: How to remediate`;

const DEPENDENCY_PROMPT = `You are a dependency security specialist. Analyze the project's dependency configuration.

Inspect for:
1. Dependency pinning: are versions locked or using floating ranges?
2. Exposed secrets in config files (should be environment variables)
3. Insecure defaults: permissive CORS, disabled CSRF, debug mode flags
4. Docker security: running as root, exposed ports, secrets in Dockerfile
5. CI/CD security: secrets in pipeline configs, overly permissive permissions
6. Environment variable handling: are secrets properly externalized?
7. Development-only packages included in production builds
8. Lock file integrity: is package-lock.json / yarn.lock committed?

For each finding report:
- **Severity**: Critical / High / Medium / Low
- **File**: Exact file path
- **Pattern**: What the issue looks like
- **Risk**: What could go wrong
- **Fix**: How to remediate`;

const COORDINATOR_PROMPT = `You are a senior security consultant creating a comprehensive security audit report. You receive findings from 4 specialist analysts (Authentication, Authorization, Data Protection, Dependency Security).

Create a well-structured audit report:

## Security Audit Report

### Executive Summary
Overall security posture: Good / Needs Improvement / Critical Issues Found
Key statistics: findings by severity

### Critical Findings
(Must-fix issues that pose immediate risk — list each with file, description, fix)

### Security Assessment

#### Authentication
(Findings from the authentication specialist)

#### Authorization
(Findings from the authorization specialist)

#### Data Protection
(Findings from the data protection specialist)

#### Dependency & Configuration Security
(Findings from the dependency specialist)

### Findings by Severity
- **Critical**: (count) — immediate action required
- **High**: (count) — fix in next sprint
- **Medium**: (count) — plan for remediation
- **Low**: (count) — address when convenient

### Recommendations
Prioritized action list (most critical first).

### Positive Observations
Security practices that are well-implemented.

Every finding must reference an actual file and pattern from the specialist reports. Do not invent findings.`;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SecurityAuditResult {
  specialists: SpecialistResult[];
  synthesis: string;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runSecurityAudit(repoConnectionId: string): Promise<SecurityAuditResult> {
  const specialists: SpecialistConfig[] = [
    {
      role: "Authentication",
      prompt: AUTH_PROMPT,
      domainFilter: "authentication login session token password jwt oauth",
      contextBudget: 8000,
    },
    {
      role: "Authorization",
      prompt: AUTHZ_PROMPT,
      domainFilter: "authorization permission role middleware guard protect",
      contextBudget: 8000,
    },
    {
      role: "Data Protection",
      prompt: DATA_PROTECTION_PROMPT,
      domainFilter: "encryption sanitize validate input secret api key database query",
      contextBudget: 8000,
    },
    {
      role: "Dependency Security",
      prompt: DEPENDENCY_PROMPT,
      domainFilter: "package.json dependencies config environment docker deployment",
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
