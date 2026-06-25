---
description: "Anti-regression bans for pragmatic TypeScript architecture drift"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Anti-Regression Contract

<meta-instruction>
Use this file when modifying stable architecture or after a schema rule has prevented a bug. This file is Via Negativa: it primarily bans known drift.
</meta-instruction>

<incident-reports>
- Incident AR-001: Giant service methods mixed validation, policy, DB, payment, email, and logging until no rule was testable.
- Incident AR-002: Classes were introduced around pure functions solely to look architectural.
- Incident AR-003: File splits created navigation ceremony before concepts were clear.
- Incident AR-004: Framework registration glue was over-refactored into fake services.
- Incident AR-005: Generated/protocol data leaked into persistence without validation/classification.
- Incident AR-006: AI rule files were placed in nested folders that were not routed from the master index.
</incident-reports>

<absolute-constraints>
- REGRESSION BAN AR-001: DO NOT mix policy decisions and side effects inside one growing method when the policy has business meaning.
- REGRESSION BAN AR-002: DO NOT create classes for pure validators, mappers, parsers, or calculators.
- REGRESSION BAN AR-003: DO NOT split source files before density, reuse, testing, or ownership earns it.
- REGRESSION BAN AR-004: DO NOT refactor framework registration into services unless ownership or lifecycle exists.
- REGRESSION BAN AR-005: DO NOT persist raw external/protocol data without validation or classification when the shape is untrusted.
- REGRESSION BAN AR-006: DO NOT create nested `.ai-rules` folders; use flat horizontal sibling files.
</absolute-constraints>

<conditional-logic>
IF a refactor introduces a new boundary:
THEN you MUST state what capability, lifecycle, or dependency it owns.

IF a refactor introduces a new file:
THEN you MUST state which concept would be lost if the file were merged back.

IF a refactor introduces a new type union:
THEN you MUST state which hidden states or magic values it replaces.
</conditional-logic>

<pre-flight-checklist>
1. [ ] Did I reintroduce a banned architecture drift?
2. [ ] Did every new boundary own something real?
3. [ ] Did every new type/file reveal meaning?
</pre-flight-checklist>
