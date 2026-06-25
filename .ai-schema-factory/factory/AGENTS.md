# AGENTS.md

This repository is a Pragmatic Codex Schema Factory.

Its job is to help the user create, evolve, audit, and install Codex-ready schemas based on the user's existing AI Operating System scheme.

## Always-on entrypoint

Before creating or modifying schemas, route through:

- `.ai-rules/00-system-index.md`

Available skills:

- `.agents/skills/schema-architect/SKILL.md`
- `.agents/skills/schema-to-codex/SKILL.md`
- `.agents/skills/codebase-schema-integrator/SKILL.md`
- `.agents/skills/schema-auditor/SKILL.md`

## Core schema philosophy

The user's scheme is based on:

- flat routing
- YAML metadata
- XML behavior gates
- Markdown structure
- 15-rule ceiling
- terminal leaf files
- context sharding
- planner mode before generation
- anti-regression via negative constraints

## Router

Use `schema-architect` when the user wants to create a new schema from scratch or design a schema for a new purpose.

Use `schema-to-codex` when the user already has an approved schema/blueprint and wants Codex files generated.

Use `codebase-schema-integrator` when the user wants to install or upgrade a schema inside an existing codebase.

Use `schema-auditor` when the user wants to inspect an existing schema for problems, duplication, drift, or bad routing.

## Hard behavior rules

- Do not generate final files before planner approval.
- Do not create deep nested active rule folders.
- Do not exceed 15 atomic rules inside one XML constraint block.
- Do not duplicate a rule across multiple authority files unless it is intentionally mirrored.
- Do not confuse Codex skills with Codex subagents.
- Do not put all logic into `AGENTS.md`; keep `AGENTS.md` as a router.
- Do not erase an existing codebase schema without producing a migration plan first.

## Output preference

When generating a schema, produce:

1. Folder map
2. Routing logic
3. File list
4. Skill list
5. Codex integration layer
6. Copy-paste files or patch ZIP
7. Verification commands
8. Test prompts
