---
description: "Master router for [PROJECT NAME]."
globs: "*"
alwaysApply: true
version: "1.0.0"
priority_schema: "critical > strong > guideline"
routing_level: "L0"
terminal: false
---

# [Project] Master Router

<meta-instruction>
You are operating inside [PROJECT NAME]. Route by user intent and codebase area.
</meta-instruction>

<routing-logic>
IF the task touches [DOMAIN]:
THEN load `[RULE FILE]`.

IF the task asks for [SKILL MODE]:
THEN use `[SKILL FILE]`.
</routing-logic>

<absolute-constraints>
- DO NOT [ban].
- DO NOT [ban].
</absolute-constraints>

<positive-directives>
- ALWAYS [positive behavior].
- ALWAYS [positive behavior].
</positive-directives>

<pre-flight-checklist>
- [ ] Did I route correctly?
- [ ] Did I load the relevant files?
</pre-flight-checklist>
