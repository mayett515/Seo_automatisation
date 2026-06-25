---
description: "Casebook for parsers, UI components, tooling, and framework code"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Casebook: Parsers, UI, Tooling, Frameworks

<meta-instruction>
Use this file for medium-strength schema applications: parser boundaries, UI component policies, tooling config resolvers, and framework wiring.
</meta-instruction>

## Parser/codegen findings

- **Bluesky / ATProto:** unknown protocol records should become validated internal variants before persistence.
- **Payload JSON validation:** JSON validation plan separated required, invalid input, schema validation, and empty allowed paths.
- **Excalidraw clipboard:** clipboard classification became mixed content, Excalidraw elements, or plain text.
- **Prisma examples:** generated types are source-of-truth boundaries; do not over-refactor tutorials.

## UI/component findings

- **Ant Design Upload:** key win was `BeforeUploadDecision`, not a full lifecycle rewrite.
- **Dify Agent node:** model/tool display derivations can become nearby pure helpers.
- **VS Code QuickInput sample:** `ResourceGroupSelection` made workflow branch honest.
- **React Hook Form example:** already good; maybe only tighten types.

## Tooling/framework findings

- **Vitest:** snapshot update mode is a policy seam inside config resolver.
- **Astro:** plugin application policy can be named without rewriting create-vite.
- **Playwright:** worker precedence and web server normalization are policy seams.
- **Monaco:** provider registration table can reveal feature matrix.

<positive-directives>
- For parsers, classify external content explicitly when fallback matters.
- For UI, extract hidden display/state policies nearby, not globally.
- For tooling, keep procedural resolvers and extract only policy seams.
</positive-directives>

<absolute-constraints>
- DO NOT build state machines for stable UI components unless lifecycle rules grow.
- DO NOT split tutorial examples unless reuse or testing earns it.
- DO NOT replace framework registration glue with fake services.
</absolute-constraints>

<pre-flight-checklist>
1. [ ] Is this a parser, UI, or tooling seam?
2. [ ] Is the improvement local and proportionate?
3. [ ] Did I avoid turning confirmation cases into rewrites?
</pre-flight-checklist>
