---
description: "Template for repository review outputs"
globs: ".ai-rules/*.md"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Template: Repo Review

<meta-instruction>
Use this template when producing a repo stress-test review.
</meta-instruction>

```markdown
# Repo Review: [REPO] / [FILE]

## 1. Original shape
[Condensed code]

## 2. Honest read
[What is already good?]

## 3. Target responsibility
[Exact seam]

## 4. Schema version
[Minimal code]

## 5. Key win
[One type/function/boundary]

## 6. Boundary and file split
[Class/module/handler decision]

## 7. Rating
Original: [x]/10
Our schema: [y]/10
Over-refactored: [z]/10

## 8. Verdict
[What to do and what not to do]
```

<absolute-constraints>
- DO NOT invent a richer domain than the file has.
- DO NOT imply a whole-file rewrite when reviewing one seam.
- DO NOT omit the key win.
</absolute-constraints>

<pre-flight-checklist>
1. [ ] Did I name the target responsibility?
2. [ ] Did I provide a fair rating?
3. [ ] Did I include restraint when warranted?
</pre-flight-checklist>
