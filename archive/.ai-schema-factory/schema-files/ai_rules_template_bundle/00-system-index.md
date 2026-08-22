---
version: "2.1.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: ["mcp-filesystem"]
last_updated: "2026-06-12"
priority_schema: "critical > strong > guideline"
---

# Master System Architecture & Execution Contract

<meta-instruction>
You are operating under strict execution constraints. This document is a compiled ruleset and a systemic router. Before writing any code, you MUST evaluate the user prompt against the `<routing-logic>` block below.
</meta-instruction>

## 1. System Routing Protocol Stack

<routing-logic>
IF the task touches UI components, React hooks, styles, layout, or views:
THEN you MUST explicitly reference, read, and comply with: `.ai-rules/01-frontend.md`.

IF the task touches database queries, migrations, Prisma/SQL schemas, or API routes:
THEN you MUST explicitly reference, read, and comply with: `.ai-rules/02-database.md`.

IF the task involves refactoring existing stable code, fixing recurring bugs, or modifying core business logic:
THEN you MUST explicitly reference, read, and comply with: `.ai-rules/04-anti-regression.md`.
</routing-logic>

## 2. Global Default Behaviors

<positive-directives>
- We are using [INSERT GLOBAL ARCHITECTURE].
- All repository file names and folder structures MUST follow: [INSERT CONVENTION].
- Keep core framework modules abstract and lean; enforce strict decoupling.
</positive-directives>

## 3. Global Hard Constraints

<absolute-constraints>
- UNDER NO CIRCUMSTANCES should you use [INSERT GLOBAL BAN].
- SILENT FAILURES ARE BANNED. Empty `catch` blocks or fake success returns are strictly forbidden.
- DO NOT cross-contaminate architectural layers.
</absolute-constraints>

## 4. Global Conditional Logic Gates

<conditional-logic>
IF you encounter a conflict between a referenced sub-rule file and this master document:
THEN this Master System Contract takes absolute precedence. 

IF a user prompt explicitly requests a pattern banned by a referenced file:
THEN halt code generation immediately, state the exact constraint violation, and request explicit override confirmation.
</conditional-logic>

## 5. Master Pre-Flight Verification

<pre-flight-checklist>
Before concluding your execution, you must internally run this verification pass:
1. [ ] Did I identify the correct technical domain and look up the required reference files inside `.ai-rules/`?
2. [ ] Have I cross-checked my output against the specific referenced sub-rule file constraints?
3. [ ] Have I completely avoided all global `<absolute-constraints>` listed in this master document?
4. [ ] Did I let myself reason step-by-step in natural language before outputting structured code files?
</pre-flight-checklist>
