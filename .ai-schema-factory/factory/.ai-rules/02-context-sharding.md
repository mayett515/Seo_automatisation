---
description: "Context sharding rules for separating cognitive tasks into isolated hidden folders."
globs: "*"
alwaysApply: false
version: "1.0.0"
routing_level: "L1"
terminal: true
---

# Context Sharding

<meta-instruction>
Use this file when a repo or task has multiple cognitive modes that should not bleed into each other.
</meta-instruction>

<context>
Context sharding means splitting rule environments by cognitive task, objective stack, or operational mode.

Examples:

- `.ai-rules/` for normal project rules
- `.ai-planner-rules/` for architecture planning
- `.refactor-rules/` for large migrations
- `.ai-rules-frontend/` for frontend
- `.ai-rules-backend/` for backend
- `.ai-rules-devops/` for infrastructure
</context>

<absolute-constraints>
- DO NOT put unrelated cognitive tasks in one giant rule folder.
- DO NOT create hidden shards without a root router that explains when to use them.
- DO NOT create deep nested active rule folders inside a shard.
- DO NOT route from terminal leaves into deeper files.
- DO NOT activate refactor/migration rules during routine coding unless explicitly requested.
</absolute-constraints>

<positive-directives>
- Use the root `AGENTS.md` or `00-system-index.md` as a traffic cop.
- Route by task intent, not only by file extension.
- Keep each shard flat.
- Give every shard a purpose and activation gate.
- Document bridge rules when two shards must cooperate.
</positive-directives>

<pre-flight-checklist>
- [ ] Does each shard have a clear cognitive purpose?
- [ ] Is there one master router?
- [ ] Are unrelated rules isolated?
- [ ] Can Codex infer the correct shard from the user's task?
</pre-flight-checklist>
