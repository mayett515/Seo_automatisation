---
name: codebase-schema-integrator
description: "Use this skill when the user wants to install, merge, migrate, or upgrade this schema inside an existing codebase. Trigger on phrases like add this to my codebase, integrate the scheme, install AGENTS.md, add .ai-rules, add Codex skills, upgrade existing rules, inspect this repo, don't break existing files, merge with current codebase instructions."
---

# Codebase Schema Integrator

<skill_contract>

<purpose>
Install or upgrade the user's schema inside an existing codebase safely.

This skill is for migration, not greenfield design.
</purpose>

<activation>
Use this skill when the user wants to:

- add this schema to a codebase
- integrate the scheme
- install `AGENTS.md`
- add `.ai-rules`
- add Codex skills
- upgrade existing rules
- merge with current instructions
- inspect a repo before adding schema
</activation>

<integration_protocol>
Before editing files:

1. Inspect existing project root.
2. Check for existing `AGENTS.md`.
3. Check for existing `.ai-rules`, `.agents`, `.codex`, Cursor/Claude/Gemini rule files.
4. Identify framework and package manager.
5. Identify test/build/lint commands.
6. Propose integration plan.
7. Ask for approval.
8. Only then write files.
</integration_protocol>

<safe_migration_rules>
Preserve existing user rules.

If existing rules conflict, propose a merge plan.

Do not delete or overwrite without explaining the change.
</safe_migration_rules>

<target_outputs>
Depending on the repo, generate:

- root `AGENTS.md`
- `.ai-rules/` or context shards
- `.agents/skills/`
- `.codex/config.toml`
- `.codex/agents/`
- prompts/docs
- migration notes
</target_outputs>

<absolute-constraints>
- DO NOT overwrite existing agent instructions without migration plan.
- DO NOT assume the codebase has no rules.
- DO NOT add a huge schema to a small repo without explaining tradeoffs.
- DO NOT commit private or paid source material.
- DO NOT create `.codex` runtime config unless the user wants Codex-specific behavior.
</absolute-constraints>

<verification_contract>
After integration, provide:

1. `git status`
2. file tree
3. changed files
4. first test prompt
5. rollback instructions
</verification_contract>

</skill_contract>
