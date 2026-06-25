---
description: "Operational guide for the flat .ai-rules bundle"
globs: ".ai-rules/**/*.md"
alwaysApply: true
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: ["mcp-filesystem"]
priority_schema: "critical > strong > guideline"
---

# SYSTEM PROMPT & DIRECTORY GUIDE FOR LLM

<meta-instruction>
You are operating inside a flat AI rules ecosystem. Read `00-system-index.md` first, then load any directly referenced rule files required by the task. Do not assume nested folders exist.
</meta-instruction>

## Bundle shape

All active rule files live directly inside `.ai-rules/`.

```txt
.ai-rules/
  00-system-index.md
  01-core.md
  02-type-strategy.md
  03-functional-core.md
  04-procedural-shell.md
  05-boundary-ladder.md
  ...horizontal sibling files...
```

## Execution protocol

<positive-directives>
- You MUST start from `00-system-index.md` before applying any domain rule.
- You MUST treat this bundle as a TypeScript architecture system, not a generic style guide.
- You MUST route by task shape: type strategy, functional core, shell, boundary, modular architecture, review, or anti-regression.
- You MUST prefer the smallest honest boundary that preserves meaning.
</positive-directives>

<absolute-constraints>
- DO NOT invent nested rule-folder paths.
- DO NOT apply every rule file to every task.
- DO NOT flatten away domain meaning when selecting files.
- DO NOT treat examples as mandatory implementation templates.
</absolute-constraints>

<context>
The strongest stable rule is: name the policy, keep the procedure, choose the smallest honest boundary.
</context>

<pre-flight-checklist>
1. [ ] Did I load `00-system-index.md` first?
2. [ ] Did I select only the relevant sibling rule files?
3. [ ] Did I avoid creating folder ceremony in application source code?
</pre-flight-checklist>
