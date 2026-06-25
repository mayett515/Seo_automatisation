# Uploaded Schema Summary

The uploaded schema pack contains these important ideas:

## Core format matrix

- YAML frontmatter for metadata and environment memory.
- XML tags for behavior gates, constraints, routing, and execution contracts.
- Markdown for human structure, examples, and documentation.

## Structural rules

- Flat routing is preferred over deeply nested active rule folders.
- `00-system-index.md` acts as master router.
- Level 2 terminal leaves must not route downward.
- One file should not contain more than 15 atomic behavioral rules inside constraint blocks.
- Split horizontally when a domain becomes too large.

## Planner mode

Planner mode should:

1. Ask structured questions first.
2. Produce a draft blueprint.
3. Show codebase directory mapping.
4. Ask what to re-decide or tighten.
5. Generate files only after explicit approval.

## Context sharding

Separate cognitive modes into separate hidden folders when needed:

- routine coding
- planner mode
- refactoring/migrations
- frontend/backend/devops
- specialized tooling

## Codex adaptation

Codex-native files should act as the tool adapter layer:

- `AGENTS.md` = always-on router
- `.agents/skills/*/SKILL.md` = reusable workflows
- `.codex/config.toml` = runtime config
- `.codex/agents/*.toml` = spawnable worker agents
