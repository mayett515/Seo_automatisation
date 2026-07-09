---
description: "Template for anti-regression rule files"
globs: ".ai-rules/*.md"
alwaysApply: false
version: "3.1.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Template: Anti-Regression Rule File

<meta-instruction>
Use this template for historical bug and architecture drift prevention.
</meta-instruction>

```markdown
---
description: "Anti-regression gates for [DOMAIN]"
globs: "[GLOBS]"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
rule_budget: "default"
anti_regression_mode: "via-negativa"
---

# Anti-Regression: [DOMAIN]

<meta-instruction>
This file records historical failures and bans recreating them.
</meta-instruction>

<incident-reports>
- Incident [ID]: [past bug or architecture failure].
</incident-reports>

<!-- Optional only when anti_regression_mode: "hybrid-boundary". -->
<positive-directives>
- ALWAYS preserve [required architecture seam or source-of-truth behavior].
</positive-directives>

<!-- Hybrid boundary shards may use concrete seam descriptions instead of incident reports when executable guards pin the seams. -->
<context>
- Seam [ID]: [source-of-truth boundary], pinned by [test or executable guard].
</context>

<absolute-constraints>
- REGRESSION BAN [ID]: DO NOT [specific banned action].
</absolute-constraints>

<conditional-logic>
IF touching [system]:
THEN verify [previous fix] remains intact.
</conditional-logic>

<pre-flight-checklist>
1. [ ] Did I avoid all regression bans?
</pre-flight-checklist>
```

<absolute-constraints>
- DO NOT add positive directives to an anti-regression file unless it is explicitly marked with `anti_regression_mode: "hybrid-boundary"`.
- DO NOT exceed the default 15-rule budget unless the file declares `rule_budget: "guard-exception"` and remains scannable.
- DO NOT describe incidents vaguely.
- DO NOT merge multiple regression bans into one bullet.
</absolute-constraints>

<pre-flight-checklist>
1. [ ] Is every ban tied to an incident?
2. [ ] Is the file flat and routed?
</pre-flight-checklist>
