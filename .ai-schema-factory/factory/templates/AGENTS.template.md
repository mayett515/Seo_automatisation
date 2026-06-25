# AGENTS.md

This repository uses a project-specific AI Operating System.

## Entry points

Primary router:

- `.ai-rules/00-system-index.md`

Skills:

- `.agents/skills/[SKILL-NAME]/SKILL.md`

Optional Codex config:

- `.codex/config.toml`

## Router

Use `[SKILL-NAME]` when the user asks for:

- [TRIGGER PHRASES]

## Hard rules

- Do not edit files without understanding project conventions.
- Do not ignore `.ai-rules/`.
- Do not run destructive commands without approval.
- Do not invent architecture decisions.
- Do not commit or push unless explicitly asked.

## Project commands

Install:

```bash
[INSTALL COMMAND]
```

Test:

```bash
[TEST COMMAND]
```

Build:

```bash
[BUILD COMMAND]
```

Lint:

```bash
[LINT COMMAND]
```
