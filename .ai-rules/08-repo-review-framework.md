---
description: "Framework for evaluating real repositories with the schema"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Repo Review Framework

<meta-instruction>
Use this file when analyzing real open-source repos. Review the target responsibility, not your imagined ideal application.
</meta-instruction>

<positive-directives>
- Start with a real repo/file surface and a condensed original shape.
- Identify the target responsibility before proposing changes.
- Show the key win as one type, function, or boundary change.
- Separate direct local refactor from schema-native repo design when useful.
- Rate schema strength against the target responsibility.
</positive-directives>

## Review format

```txt
1. Repo/file
2. Original shape
3. Honest read
4. Target responsibility
5. Schema version
6. Key win
7. Boundary/OOP decision
8. File split decision
9. Rating
10. Verdict
```

<absolute-constraints>
- DO NOT invent a richer domain than the file has.
- DO NOT imply the whole file must be rewritten when only one seam was reviewed.
- DO NOT ignore that a sample/tutorial optimizes for teaching.
- DO NOT overfit one repo’s style into universal rules.
- DO NOT cite extension lenses without showing the actual code improvement.
</absolute-constraints>

<pre-flight-checklist>
1. [ ] Did I clearly name the target seam?
2. [ ] Did I preserve repo conventions?
3. [ ] Did I include a restraint verdict when appropriate?
</pre-flight-checklist>
