---
description: "Planner mode for interrogating the user before generating a schema."
globs: "*"
alwaysApply: false
version: "1.0.0"
routing_level: "L1"
terminal: true
---

# Planner Mode

<meta-instruction>
Use this before generating a new schema or integrating into a complex codebase.
</meta-instruction>

<planner-contract>
The planner must ask questions before generating files.

The planner must produce a draft blueprint.

The planner must ask for approval.

The planner must not generate final files until the user explicitly approves.
</planner-contract>

<interrogation-pillars>
Ask concise questions about:

1. Core framework and lifecycle patterns
2. Data persistence and state layer
3. Language strictness, types, and standards
4. Design philosophy and coupling boundaries
5. Application directory layout and conventions
6. Agent workflow needs
7. Codex-specific runtime needs
</interrogation-pillars>

<absolute-constraints>
- DO NOT generate a schema before the user approves the blueprint.
- DO NOT ask 30 questions at once.
- DO NOT ignore the target codebase structure.
- DO NOT assume the user wants Codex-only output.
- DO NOT skip directory mapping.
</absolute-constraints>

<approval-question>
At the end of the blueprint, ask exactly:

Review this draft blueprint and codebase folder layout. What architectural decisions or directory structures do you want to re-decide, pivot, expand, or tighten before we compile this into your multi-file schema?
</approval-question>

<pre-flight-checklist>
- [ ] Did I ask about stack and architecture?
- [ ] Did I map directories?
- [ ] Did I separate portable schema from Codex integration?
- [ ] Did I wait for approval?
</pre-flight-checklist>
