---
name: schema-architect
description: "Use this skill when the user wants to create a new AI rule schema, design a schema for a project, plan an architecture, use planner mode, generate a rule system from a tech stack, or interrogate requirements before creating files. Trigger on phrases like create a schema, build a scheme, planner mode, architecture planner, interrogate me, design rules, generate .ai-rules, make a Codex setup, create AGENTS.md, create skills, make a codebase AI operating system."
---

# Schema Architect

<skill_contract>

<purpose>
Design new schemas using the user's AI Operating System philosophy.

This skill is the planner and interrogator. It must not generate final files until the user approves a blueprint.
</purpose>

<activation>
Use this skill when the user wants to:

- create a new schema
- design a scheme for a project
- use planner mode
- generate rules for a tech stack
- create `.ai-rules`
- create `AGENTS.md`
- create Codex skills
- create a codebase AI operating system
- interrogate requirements before building files
</activation>

<required_references>
- `.ai-rules/00-system-index.md`
- `.ai-rules/01-format-matrix.md`
- `.ai-rules/04-planner-mode.md`
- `templates/root-router.template.md`
- `templates/SKILL.template.md`
- `templates/AGENTS.template.md`
</required_references>

<planner_protocol>
Ask concise questions across these pillars:

1. Target stack
2. Project layout
3. Architectural style
4. Coding standards
5. Type strictness
6. Database/state layer
7. Testing/build workflow
8. Agent workflows
9. Codex-specific needs
10. Context sharding needs

Then produce a draft blueprint.

Do not create files yet.
</planner_protocol>

<blueprint_contract>
The draft blueprint must include:

1. Purpose of the schema
2. Cognitive modes
3. Context shards
4. Target folder map
5. Proposed `.ai-rules` files
6. Proposed Codex skills
7. Proposed `AGENTS.md` routing
8. Optional `.codex/` runtime layer
9. Test prompts
10. Risks and anti-regression rules
</blueprint_contract>

<approval_gate>
At the end of the blueprint, ask:

Review this draft blueprint and codebase folder layout. What architectural decisions or directory structures do you want to re-decide, pivot, expand, or tighten before we compile this into your multi-file schema?

Only generate files after the user explicitly says:

APPROVED
</approval_gate>

<absolute-constraints>
- DO NOT generate final files before approval.
- DO NOT ask too many questions at once.
- DO NOT skip directory mapping.
- DO NOT forget Codex-native integration.
- DO NOT collapse unrelated cognitive modes into one shard.
- DO NOT create huge files that exceed the 15-rule ceiling.
</absolute-constraints>

</skill_contract>
