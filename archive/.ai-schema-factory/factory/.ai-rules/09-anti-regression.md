---
description: "Anti-regression gates for schema factory behavior."
globs: "*"
alwaysApply: true
version: "1.0.0"
routing_level: "L1"
terminal: true
---

# Anti-Regression

<meta-instruction>
Use this to prevent the schema factory from degrading into generic prompt writing.
</meta-instruction>

<incident-reports>
- Incident SF-001: The assistant created Codex files without preserving the user's YAML/XML/Markdown schema format.
- Incident SF-002: The assistant generated files before the planner loop was approved.
- Incident SF-003: The assistant duplicated rules across AGENTS.md, SKILL.md, and `.ai-rules` without an authority model.
- Incident SF-004: The assistant confused Codex skills with Codex subagents.
- Incident SF-005: The assistant overbuilt hooks before the user had real usage pain.
</incident-reports>

<absolute-constraints>
- DO NOT generate generic prompt packs when the user asked for a schema.
- DO NOT remove the user's format matrix.
- DO NOT hide hard constraints in conversational prose.
- DO NOT make AGENTS.md huge.
- DO NOT use skills as a dumping ground for all schema logic.
- DO NOT create subagents unless the task needs separate worker context.
- DO NOT add hooks before the repetitive event is clear.
</absolute-constraints>

<pre-flight-checklist>
- [ ] Did I preserve the scheme?
- [ ] Did I separate router, skills, rules, and runtime config?
- [ ] Did I avoid duplicating authority?
- [ ] Did I avoid overengineering beyond the current use case?
</pre-flight-checklist>
