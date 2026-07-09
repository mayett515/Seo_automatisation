---
name: schema-auditor
description: "Use this skill when the user wants to inspect, audit, debug, clean, compare, or improve an existing AI schema, .ai-rules folder, AGENTS.md, Codex skills, or .codex config. Trigger on phrases like audit my schema, check if this is good, find duplicate rules, find broken routing, inspect my AGENTS.md, is this Codex setup correct, why is the agent not following rules, clean this up."
---

# Schema Auditor

<skill_contract>

<purpose>
Audit an existing schema for structural, routing, formatting, and behavioral problems.
</purpose>

<activation>
Use this skill when the user asks to:

- audit a schema
- check if rules are good
- inspect `AGENTS.md`
- inspect `.ai-rules`
- inspect Codex skills
- find broken routing
- find duplication
- find context bloat
- find bad triggers
- clean up schema files
- explain why the agent is not following rules
</activation>

<audit_dimensions>
Inspect:

1. Root router quality
2. Skill trigger clarity
3. Format matrix compliance
4. Default 15-rule budget and explicit exception markers
5. terminal leaf compliance
6. duplicate authority
7. context shard boundaries
8. Codex native layer correctness
9. stale patch files
10. missing test prompts
</audit_dimensions>

<report_contract>
The audit report must include:

1. Overall verdict
2. Critical issues
3. Medium issues
4. Nice-to-have improvements
5. Files to change
6. Exact next commands
7. Whether the user can safely start using it
</report_contract>

<absolute-constraints>
- DO NOT say "everything is fine" without checking file structure.
- DO NOT recommend rewriting the whole system for small issues.
- DO NOT ignore stale patches, duplicate folders, or empty files.
- DO NOT confuse visual ugliness with functional brokenness.
- DO NOT suggest hooks/subagents unless there is a real use case.
</absolute-constraints>

</skill_contract>
