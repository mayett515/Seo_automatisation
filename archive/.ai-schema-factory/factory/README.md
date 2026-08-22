# Pragmatic Codex Schema Factory

This project converts your existing schema philosophy into reusable Codex-ready rule systems.

It exists for one reason:

> Create `.ai-rules`, `AGENTS.md`, Codex skills, and optional `.codex/` config locally from your own schema, without rebuilding everything in the web app.

## What this factory builds

For any target codebase or learning/coding purpose, this factory can generate:

```text
AGENTS.md
.ai-rules/
.agents/skills/
.codex/
docs/
prompts/
```

## Core idea

Your original scheme defines the deeper rule architecture:

```text
YAML frontmatter = metadata / routing signals
XML tags = behavior gates / constraints / contracts
Markdown = human-readable structure / examples
Flat routing = less attention dilution
Terminal leaves = no recursive rule traps
Context shards = separate cognitive tasks into separate hidden folders
Planner mode = interrogate first, generate after approval
```

Codex adds native runtime layers:

```text
AGENTS.md = always-on project guidance
.agents/skills/*/SKILL.md = reusable task modes
.codex/config.toml = project Codex runtime config
.codex/agents/*.toml = spawnable Codex subagents
```

This factory combines both:

```text
Codex-native shell
+
your schema inside
```

## Main skills

```text
$schema-architect
= ask planner questions and design a new schema

$schema-to-codex
= compile approved schema into AGENTS.md + skills + .ai-rules

$codebase-schema-integrator
= install or upgrade schema inside an existing repo safely

$schema-auditor
= inspect an existing schema and find drift, duplication, missing routing, or broken triggers
```

## Start

```powershell
codex
```

Then:

```text
$schema-architect

I want to create a Codex-ready schema for a TypeScript monorepo.
Use planner mode.
Interrogate me first.
Do not generate files until I approve the blueprint.
```

## Install into an existing codebase

Open the target codebase in Codex, then use:

```text
$codebase-schema-integrator

Inspect this repo.
Design a schema integration plan.
Do not edit files yet.
Show me where AGENTS.md, .ai-rules, skills, and .codex config should go.
```

## Golden rule

Do not generate a schema before the planner loop is approved.

Planner first. Blueprint second. Files third.
