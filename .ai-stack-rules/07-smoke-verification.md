---
description: "Runtime smoke-verification guardrails after backend, worker, database, and frontend route changes"
globs: "apps/**/*.{ts,tsx}, packages/**/*.{ts,tsx}, **/*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - ".ai-stack-rules/04-nest-fastify-runtime-di.md"
  - ".ai-stack-rules/03-tanstack-query-router.md"
priority_schema: "critical > strong > guideline"
---

# Smoke Verification

<positive-directives>
- After Nest route/provider changes, start the API and hit `/health` plus the changed route.
- After frontend route changes, start Vite and request the changed route.
- After worker changes, run the worker in dry-run mode or process a typed fixture where feasible.
- After DB schema changes, generate migrations and inspect whether SQL is additive or destructive.
- Always run `typecheck`, `build`, and `git diff --check` before handoff.
</positive-directives>

<absolute-constraints>
- DO NOT treat a passing `tsc` result as proof that Nest dependency injection works at runtime.
- DO NOT hand off runtime-sensitive changes without at least one changed-route smoke check when local execution is feasible.
</absolute-constraints>
