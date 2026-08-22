---
description: "Rules for translating the user's schema into Codex-native layers."
globs: "*"
alwaysApply: false
version: "1.0.0"
routing_level: "L1"
terminal: true
---

# Codex Integration

<meta-instruction>
Use this when compiling a schema into Codex-ready project files.
</meta-instruction>

<layer-map>
Portable schema layer:
- `.ai-rules/`
- hidden context shards
- machine-readable routing maps
- templates
- prompt cards

Codex native layer:
- `AGENTS.md`
- `.agents/skills/*/SKILL.md`
- `.codex/config.toml`
- `.codex/agents/*.toml`
- optional hooks
</layer-map>

<absolute-constraints>
- DO NOT confuse Codex skills with Codex subagents.
- DO NOT put subagent instructions into `SKILL.md` when a `.codex/agents/*.toml` worker is needed.
- DO NOT create project-local `.codex/` config unless the user wants Codex-specific behavior.
- DO NOT rely on implicit skill activation for critical tasks; include explicit prompt examples.
- DO NOT create huge skill descriptions that obscure trigger phrases.
</absolute-constraints>

<positive-directives>
- Put natural user trigger phrases in each skill description.
- Keep `AGENTS.md` concise and router-like.
- Put shared deep logic in `.ai-rules/`, not duplicated across skills.
- Use skills for workflows.
- Use subagents for separate worker roles.
- Use hooks only after real usage reveals repetitive automation needs.
</positive-directives>

<pre-flight-checklist>
- [ ] Does every skill have a clear name and description?
- [ ] Does every skill include real user trigger phrases?
- [ ] Does `AGENTS.md` route instead of becoming huge?
- [ ] Are Codex-specific runtime files isolated in `.codex/`?
</pre-flight-checklist>
