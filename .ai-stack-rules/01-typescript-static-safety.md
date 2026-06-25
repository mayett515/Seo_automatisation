---
description: "TypeScript static-safety guardrails for strict typing, typed linting, and maintainable async code"
globs: "apps/**/*.{ts,tsx}, packages/**/*.{ts,tsx}, **/*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - ".ai-rules/00-system-index.md"
  - "https://typescript-eslint.io/getting-started/typed-linting/"
priority_schema: "critical > strong > guideline"
---

# TypeScript Static Safety

<positive-directives>
- Keep `strict` TypeScript assumptions intact; validate external input/output with Zod before treating data as trusted.
- Prefer local narrowed variables after null/undefined guards instead of repeatedly accessing optional members.
- Keep async DB code readable: use explicit branches when a ternary hides multiple awaits or query builders.
- Use parameter properties consistently when the runtime supports them; use explicit injection decorators when runtime metadata is unreliable.
- Add typed linting later for `recommendedTypeChecked` rules where project cost is acceptable.
</positive-directives>

<absolute-constraints>
- DO NOT duplicate shared DTOs, enums, or provider response shapes outside their source-of-truth schema.
- DO NOT use type assertions to skip validation at trust boundaries.
- DO NOT hide runtime risks behind code that merely typechecks.
</absolute-constraints>
