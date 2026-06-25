---
description: "Format matrix for YAML, XML, Markdown, and Codex-native shells."
globs: "*"
alwaysApply: true
version: "1.0.0"
routing_level: "L1"
terminal: true
---

# Format Matrix

<meta-instruction>
Use this file whenever generating or auditing schema files. It defines which format should carry which kind of meaning.
</meta-instruction>

<format-matrix>
YAML frontmatter:
- metadata
- names
- descriptions
- routing scope
- version
- terminal status
- priority hints

XML-style tags:
- behavior gates
- hard constraints
- contracts
- routing logic
- conditional logic
- anti-regression rules
- pre-flight checklists

Markdown:
- headings
- explanations
- examples
- copy-paste blocks
- human-readable documentation

Codex native files:
- `AGENTS.md` for always-on project guidance
- `.agents/skills/*/SKILL.md` for skills
- `.codex/config.toml` for Codex runtime config
- `.codex/agents/*.toml` for spawnable Codex subagents
</format-matrix>

<absolute-constraints>
- DO NOT use XML tags for large data payloads.
- DO NOT bury hard rules in casual prose.
- DO NOT create massive YAML data blocks for behavior logic.
- DO NOT make `AGENTS.md` the full operating system.
- DO NOT duplicate the same rule in multiple files without naming which file is authoritative.
</absolute-constraints>

<pre-flight-checklist>
- [ ] Is metadata in YAML?
- [ ] Are hard behavior rules in XML gates?
- [ ] Are examples in Markdown?
- [ ] Are Codex runtime controls in `.codex/`?
</pre-flight-checklist>
