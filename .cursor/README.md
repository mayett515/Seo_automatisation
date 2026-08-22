# Cursor project configuration

Cursor and Codex share the repository's root and nested `AGENTS.md` files plus `.agents/skills/`.

This directory contains only Cursor-native pieces:

- `rules/*.mdc`: deterministic glob attachment for narrow file classes
- `agents/*.md`: isolated Cursor subagents
- `hooks.json` and `hooks/*`: Cursor lifecycle policy and edit feedback

The hooks use Cursor's JSON-stdio payload and tool names. Do not replace them with `.codex/hooks.json`.
