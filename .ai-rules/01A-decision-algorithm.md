---
description: "Decision algorithm for applying the v3 schema"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Decision Algorithm

<meta-instruction>
Use this file whenever deciding whether to refactor, how far to refactor, or which schema lens applies.
</meta-instruction>

<positive-directives>
- First identify the exact target responsibility.
- Then classify data, decisions, effects, and boundary ownership.
- Then check whether an extension lens reveals a sharper shape.
- Then decide whether the repo needs a direct local refactor or a schema-native comparison.
- Then rate the result against the target responsibility.
</positive-directives>

## Operational sequence

```txt
1. What is the code trying to mean?
2. Is that meaning explicit in types/functions?
3. Which parts are side effects?
4. What already owns the dependencies?
5. Which smallest boundary is honest?
6. Would a lens reveal meaning or add ceremony?
7. Should we change the file, or merely confirm it is already good?
```

<conditional-logic>
IF the file is already pure, small, and obvious:
THEN prefer confirmation over refactor.

IF hidden policy appears inside conditionals, ternaries, framework callbacks, or magic values:
THEN name the policy using a type and/or pure function.

IF the repo already has an infrastructure layer for validation, HTTP, credentials, logging, or generated clients:
THEN use that existing layer instead of creating a local duplicate.
</conditional-logic>

<absolute-constraints>
- DO NOT rate the schema against an entire large file when only one seam was analyzed.
- DO NOT create a schema-native file split for a tiny utility.
- DO NOT ignore existing repo conventions.
- DO NOT introduce new abstractions before naming the hidden concept.
</absolute-constraints>

<pre-flight-checklist>
1. [ ] Did I state the target responsibility?
2. [ ] Did I avoid whole-file overclaims?
3. [ ] Did I compare direct and schema-native designs when useful?
</pre-flight-checklist>
