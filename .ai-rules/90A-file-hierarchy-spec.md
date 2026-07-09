---
description: "Specification for flat horizontal file hierarchy in .ai-rules"
globs: ".ai-rules/**/*.md"
alwaysApply: false
version: "3.1.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Engineering Specification: Flat File Hierarchy

<meta-instruction>
Use this file to maintain the `.ai-rules` ecosystem. The rule system is flat by design.
</meta-instruction>

## Hierarchy

```txt
.ai-rules/
  00-system-index.md
  01-core.md
  01A-decision-algorithm.md
  01B-ceremony-review-ratings.md
  ...horizontal sibling files...
```

<positive-directives>
- Use `00-system-index.md` as the only master router.
- Use horizontal splitting with numeric/letter prefixes when a normal domain exceeds the default 15-rule budget.
- Keep every rule file directly inside `.ai-rules/`.
- Reference sibling files with exact flat paths.
- Keep templates and specs flat too.
</positive-directives>

<absolute-constraints>
- DO NOT create `.ai-rules/core/`, `.ai-rules/boundaries/`, or any nested rule folder.
- DO NOT create a file that is not named in `00-system-index.md` or `MANIFEST.md`.
- DO NOT route through nested indexes.
- DO NOT optimize this folder for human browsing over machine routing.
- DO NOT remove content when merging; repackage horizontally instead.
</absolute-constraints>

<conditional-logic>
IF a normal domain file grows beyond the default rule budget:
THEN split horizontally as `02A-*`, `02B-*`, not into a subfolder.

IF a router, guard, guardrail, or anti-regression shard intentionally exceeds the default rule budget:
THEN declare `rule_budget: "guard-exception"` in frontmatter and keep the file directly routable and scannable.

IF a human wants a tree view:
THEN generate it externally from the flat manifest.
</conditional-logic>

<pre-flight-checklist>
1. [ ] Did I keep `.ai-rules` flat?
2. [ ] Did I update the master router for every new file?
3. [ ] Did I use horizontal splitting instead of nested folders?
</pre-flight-checklist>
