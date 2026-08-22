---
description: "Fastify schema, validation, and serialization rules when the project already uses Zod contracts"
globs: "apps/api/src/**/*.{ts,tsx}, packages/contracts/src/**/*.{ts,tsx}, **/*schema*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/"
  - ".ai-rules/00-system-index.md"
priority_schema: "critical > strong > guideline"
---

# Schemas And Serialization

<positive-directives>
- Let Zod contracts own external API input/output types unless a route intentionally uses Fastify JSON schema for serialization performance.
- Avoid duplicating schemas between Zod and Fastify JSON schema without a single source-of-truth derivation.
- Parse request bodies, params, query, and shared responses at trust boundaries.
- Use Fastify serialization only when its performance/contract benefit outweighs schema duplication risk.
</positive-directives>

<absolute-constraints>
- DO NOT hand-maintain the same request/response contract in both Zod and Fastify schemas.
- DO NOT skip Zod parsing just because Fastify has a runtime schema somewhere else.
- DO NOT expose unvalidated provider/API payloads directly as route responses.
</absolute-constraints>

<conditional-logic>
IF Fastify schema/serialization is introduced:
THEN define which schema owns truth and how the other representation is derived.
</conditional-logic>
