# Schema Factory Workflow

## 1. Create a new schema

```text
$schema-architect

I want to create a new Codex-ready schema for [purpose].
Use planner mode.
Ask me questions first.
Do not generate files until I approve the blueprint.
```

## 2. Approve the blueprint

After the planner proposes a blueprint, reply:

```text
APPROVED
```

or tell it what to change.

## 3. Compile files

```text
$schema-to-codex

Compile the approved blueprint into files.
Preserve my YAML/XML/Markdown scheme.
```

## 4. Integrate into a codebase

Open the target codebase, then run:

```text
$codebase-schema-integrator

Inspect this repo.
Design an integration plan.
Do not edit files yet.
```

## 5. Audit

```text
$schema-auditor

Audit this schema and tell me what is wrong.
```

## Important mental model

```text
Your scheme = portable cognitive architecture
Codex skills = task mode entry points
AGENTS.md = always-on router
.codex = Codex runtime config
```
