---
name: schema-to-codex
description: "Use this skill when the user has an approved schema or blueprint and wants to compile it into Codex-ready files: AGENTS.md, .agents/skills, .ai-rules, .codex/config.toml, subagents, hooks, prompts, and docs. Trigger on phrases like compile this schema, generate the files, make the Codex version, create the skills, create AGENTS.md, turn this into a patch, make a zip, export this schema."
---

# Schema to Codex

<skill_contract>

<purpose>
Compile an approved schema blueprint into Codex-ready files while preserving the user's YAML/XML/Markdown scheme.
</purpose>

<activation>
Use this skill when the user says:

- compile this schema
- generate the files
- make the Codex version
- create the skills
- create AGENTS.md
- turn this into a patch
- make a zip
- export this schema
- create copy-paste files
</activation>

<required_input>
Before generating files, confirm that the blueprint has been approved.

If no approved blueprint exists, route to `schema-architect`.
</required_input>

<output_layers>
Generate only the layers needed for the approved blueprint:

1. `AGENTS.md`
2. `.ai-rules/`
3. `.agents/skills/*/SKILL.md`
4. `.codex/config.toml`
5. `.codex/agents/*.toml`
6. `prompts/`
7. `docs/`
8. `scripts/`
</output_layers>

<file_format_contract>
Every generated `.ai-rules` file should use:

- YAML frontmatter
- XML gates for behavior
- Markdown headings and examples
- pre-flight checklist at bottom

Every generated Codex skill should use:

- Codex-native YAML frontmatter
- scheme-style XML body
- concise trigger-rich description
</file_format_contract>

<authority_model>
Do not duplicate full logic across files.

Use:

- `AGENTS.md` as router
- `SKILL.md` as workflow entry
- `.ai-rules` as deep shared rules
- `.codex` as Codex runtime config
</authority_model>

<absolute-constraints>
- DO NOT generate files before approval.
- DO NOT make `AGENTS.md` huge.
- DO NOT make skills generic.
- DO NOT bury hard constraints in prose.
- DO NOT exceed the default 15-rule budget unless a router, guard, guardrail, or anti-regression shard explicitly declares `rule_budget: "guard-exception"`.
- DO NOT generate nested active rule folders without explicit context-sharding reason.
</absolute-constraints>

<completion_contract>
After generating files, provide:

1. File tree
2. Import instructions
3. Verification commands
4. Test prompts
5. Git commit suggestion
</completion_contract>

</skill_contract>
