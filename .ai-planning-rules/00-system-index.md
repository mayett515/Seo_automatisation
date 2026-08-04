---
description: "Planning, schema factory, context sharding, and Markdown generation router"
globs: "**/*.{md,json,mmd,toml,yml,yaml}"
alwaysApply: false
version: "1.2.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Planning Rules Router

<meta-instruction>
Use this router when the task designs hidden rule folders, creates schema-shaped Markdown files, updates product knowledge packs, maps app directory structure, or applies planner mode before implementation.
</meta-instruction>

<routing-logic>
IF the task asks for architecture planning, folder layout, hidden shards, or schema blueprinting:
THEN load `.ai-planning-rules/01-planner-mode.md`.

IF the task creates or edits project-specific rule files:
THEN use `.ai-schema-factory/schema-files/ai_rules_template_bundle/` as the template reference.

IF the task creates a new hidden rule folder:
THEN check `.ai-schema-factory/schema-files/CONTEXT SHARDING/ADVANCED-CONTEXT-SHARDING.md`.
</routing-logic>

<positive-directives>
- Use planner mode before generating multi-file rule systems.
- Keep hidden rule folders flat and purpose-specific.
- Keep frozen references separate from editable project rules.
- Treat `C:\Scheme\pragmatic_typescript_v3_ai_rules_bundle_complete\pragmatic_typescript_v3_ai_rules_bundle_flat\.ai-rules\` as generic TypeScript authoring authority and the project `.ai-rules/` folder as its active consumer copy.
- Use YAML for metadata, XML for behavior gates, and Markdown for human structure.
- Require explicit approval before compiling large rule-file blueprints.
- Mark a cohesive normal-domain file retained above the 15-rule review threshold with `rule_budget: "cohesion-retained"` and record its rationale in `<context>`.
</positive-directives>

<absolute-constraints>
- DO NOT generate a hidden-folder rule system before a blueprint is approved.
- DO NOT create deep nested active rule folders.
- DO NOT split, delete, or combine rules solely to force a file below the default 15-rule review threshold; review cohesion and routing first.
- DO NOT edit frozen reference folders for project-specific behavior.
- DO NOT duplicate the TypeScript schema into other shards.
</absolute-constraints>

<pre-flight-checklist>
1. [ ] Did I identify whether this is planning, schema generation, or normal coding?
2. [ ] Did I preserve frozen references as references only?
3. [ ] Did I avoid compiling files before approval when planner mode applies?
</pre-flight-checklist>
