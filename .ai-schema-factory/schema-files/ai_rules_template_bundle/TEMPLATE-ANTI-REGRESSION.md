---
description: "Strict prohibition gates preventing the reintroduction of historical bugs for [DOMAIN]"
globs: "[INSERT RELEVANT GLOBS]"
alwaysApply: false
version: "1.0.0"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Anti-Regression Contract: [DOMAIN]

<meta-instruction>
You have been routed here because you are modifying stable systems or fixing bugs. This document contains hard logit-level bans on historical anti-patterns specific to this codebase.
</meta-instruction>

## 1. Historical Context (The "Why")

<incident-reports>
- Incident [ID]: [DESCRIBE THE PAST BUG OR ARCHITECTURAL FAILURE].
- Incident [ID]: [DESCRIBE ANOTHER PAST BUG].
</incident-reports>

## 2. Hard Regression Bans (The "Via Negativa")

<absolute-constraints>
- REGRESSION BAN [ID]: DO NOT [EXPLICITLY BAN THE ACTION THAT CAUSED INCIDENT 1].
- REGRESSION BAN [ID]: DO NOT [EXPLICITLY BAN THE ACTION THAT CAUSED INCIDENT 2].
- [ADD NEW BANS HERE AS BUGS ARE RESOLVED]
</absolute-constraints>

## 3. Anti-Regression Conditional Gates

<conditional-logic>
IF you are altering an existing function that touches [SYSTEM]:
THEN you MUST explicitly verify that [PREVIOUS FIX] remains intact.
</conditional-logic>

## 4. Post-Flight Regression Verification

<pre-flight-checklist>
Before finalizing the refactor or bug fix, explicitly verify:
1. [ ] Did I accidentally reintroduce any pattern listed in `<absolute-constraints>`?
2. [ ] Did I bypass any established architectural boundaries?
</pre-flight-checklist>
