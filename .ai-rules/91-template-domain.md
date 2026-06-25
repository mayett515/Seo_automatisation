---
description: "Template for generating flat domain rule files"
globs: ".ai-rules/*.md"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Template: Domain Rule File

<meta-instruction>
Copy this structure when generating a new flat sibling rule file.
</meta-instruction>

```markdown
---
description: "Strict rules for [DOMAIN]"
globs: "[GLOBS]"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# [DOMAIN]

<meta-instruction>
[Why this file is loaded.]
</meta-instruction>

<positive-directives>
- [Rule 1]
- [Rule 2]
</positive-directives>

<absolute-constraints>
- DO NOT [ban 1].
- DO NOT [ban 2].
</absolute-constraints>

<context>
<example>
// Good: [why]
```ts
[code]
```
</example>

<example>
// Bad: [why]
```ts
[code]
```
</example>
</context>

<pre-flight-checklist>
1. [ ] [check]
</pre-flight-checklist>
```

<absolute-constraints>
- DO NOT create nested template folders.
- DO NOT omit YAML frontmatter.
- DO NOT exceed the rule ceiling.
</absolute-constraints>

<pre-flight-checklist>
1. [ ] Is the new file flat?
2. [ ] Is it routed from `00-system-index.md`?
</pre-flight-checklist>
