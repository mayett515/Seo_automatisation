---
description: "Specification for generating AI rule files in this ecosystem"
globs: ".ai-rules/**/*.md"
alwaysApply: false
version: "3.2.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Engineering Specification: Schema Generation

<meta-instruction>
Use this file when generating or editing AI rule files. Optimize rule files for LLM routing and attention, not for human folder browsing.
</meta-instruction>

## Format matrix

| Syntax | Purpose | Treatment |
|---|---|---|
| YAML frontmatter | metadata, globs, protocols | immutable schema memory |
| XML body tags | constraints, logic gates | hard operational fences |
| Markdown prose | examples, navigation | section anchors |

<positive-directives>
- Put YAML at the top of every `.ai-rules` file.
- Put routing/meta logic near the top.
- Put the pre-flight checklist block at the bottom.
- Use XML tags for behavioral control.
- Use one good and one bad example in implementation/domain rule files when practical.
- Use concrete routing conditions, seam descriptions, incident reports, or executable guard references in router, index, guard, guardrail, and anti-regression files.
- Treat 15 atomic directives and constraints as the normal-domain review threshold, not an automatic ceiling.
</positive-directives>

<absolute-constraints>
- DO NOT split a cohesive rule file solely because it exceeds the default review threshold.
- DO NOT omit, delete, or combine independent rules merely to reduce the count.
- DO NOT combine multiple prohibitions into one compound bullet.
- DO NOT omit YAML frontmatter from `.ai-rules` files.
- DO NOT generate nested `.ai-rules` folders.
- DO NOT create orphan rule files not routed from `00-system-index.md`.
</absolute-constraints>

<conditional-logic>
IF a normal domain file exceeds the default review threshold:
THEN inspect duplication, cohesion, routing precision, and attention density before choosing a structure.

IF that review finds independently coherent and directly routable concerns:
THEN split them horizontally into flat sibling files.

IF splitting would fragment rules that must be reasoned about together:
THEN keep the cohesive file intact, declare `rule_budget: "cohesion-retained"`, and record the rationale in `<context>`.

IF a router, guard, guardrail, or anti-regression shard remains intentionally larger because splitting would weaken enforcement:
THEN declare `rule_budget: "guard-exception"` in frontmatter and keep it scannable.
</conditional-logic>

<pre-flight-checklist>
1. [ ] Does every generated rule file have YAML frontmatter?
2. [ ] Is the rule file directly routable from the index?
3. [ ] Did I preserve U-shaped attention flow and review cohesion before any count-driven split?
</pre-flight-checklist>
