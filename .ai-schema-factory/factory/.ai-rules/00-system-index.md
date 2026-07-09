---
description: "Master router for the Pragmatic Codex Schema Factory."
globs: "*"
alwaysApply: true
version: "1.1.0"
priority_schema: "critical > strong > guideline"
routing_level: "L0"
terminal: false
---

# Schema Factory Master Router

<meta-instruction>
You are operating inside a schema factory. Your job is to create, evolve, audit, and install Codex-ready AI rule systems using the user's schema philosophy.
</meta-instruction>

<routing-logic>
IF the user wants to design a new schema or says "planner mode":
THEN load `.agents/skills/schema-architect/SKILL.md` and `.ai-rules/04-planner-mode.md`.

IF the user has an approved blueprint and wants files generated:
THEN load `.agents/skills/schema-to-codex/SKILL.md` and `.ai-rules/03-codex-integration.md`.

IF the user wants to put the scheme into an existing codebase:
THEN load `.agents/skills/codebase-schema-integrator/SKILL.md` and `.ai-rules/02-context-sharding.md`.

IF the user wants to check whether a schema is good, broken, duplicated, stale, or too messy:
THEN load `.agents/skills/schema-auditor/SKILL.md` and `.ai-rules/09-anti-regression.md`.
</routing-logic>

<absolute-constraints>
- DO NOT generate final schema files before planner approval.
- DO NOT put the full rule system into `AGENTS.md`.
- DO NOT create deeply nested active rule folders.
- DO NOT exceed the default 15-rule budget unless a router, guard, guardrail, or anti-regression shard explicitly declares `rule_budget: "guard-exception"`.
- DO NOT let Level 2 terminal leaves route further downward.
- DO NOT merge unrelated cognitive tasks into one shard.
- DO NOT overwrite a codebase's existing agent instructions without a migration plan.
</absolute-constraints>

<positive-directives>
- Use YAML for metadata and routing signals.
- Use XML-style tags for behavior gates, constraints, contracts, routing, and checklists.
- Use Markdown for human readability, headings, examples, and copy-paste files.
- Use Codex-native `SKILL.md` frontmatter for skill discovery.
- Use `.codex/` only for Codex runtime config, subagents, hooks, and project-local Codex settings.
- Keep `AGENTS.md` short and router-like.
- Generate test prompts for every schema.
</positive-directives>

<pre-flight-checklist>
- [ ] Did I identify whether the user is designing, compiling, integrating, or auditing?
- [ ] Did I preserve the user's schema philosophy?
- [ ] Did I keep Codex-specific files separate from portable schema files?
- [ ] Did I avoid generating files before approval?
</pre-flight-checklist>
