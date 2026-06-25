---
description: "Official-doc refresh workflow for turning recurring stack mistakes into stack guardrails without editing the frozen TypeScript schema"
globs: "apps/**/*.{ts,tsx}, packages/**/*.{ts,tsx}, .ai-stack-rules/**/*.md, .ai-stack-findings/**/*.md, **/*review*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - ".ai-stack-rules/SOURCES.md"
priority_schema: "critical > strong > guideline"
---

# Official Doc Refresh

<meta-instruction>
Use this workflow after implementation reviews, external LLM reviews, recurring stack mistakes, or when a stack area feels under-specified. The goal is to check official framework/provider documentation, scan adjacent guidance for missing patterns, classify findings, and decide whether each lesson belongs in `.ai-stack-rules/` or only in `.ai-stack-findings/`.
</meta-instruction>

<positive-directives>
- Prefer official sources first: React, TanStack, NestJS, MDN, Google OAuth, TypeScript, typescript-eslint, and Microsoft/Azure API guidance.
- Categorize each finding by stack surface: TypeScript static safety, React render/hooks, TanStack Query/Router/Form/Table, Nest/Fastify runtime DI, OAuth/provider security, URL/Web API safety, REST/API semantics, async DB/workers, observability, testing, or smoke verification.
- When opening an official source, check the directly relevant page plus nearby official docs/sidebar headings for adjacent practices we may have missed.
- Record exploratory findings, copied review notes, and weaker/non-authoritative references in `.ai-stack-findings/`.
- Promote a finding into `.ai-stack-rules/` only when it is stable, repeatable, and would have prevented or caught a real issue in this project.
- Keep stack rules implementation-focused. Product behavior, SEO policy, approval gates, and reporting truth stay in `.ai-project-rules/`.
</positive-directives>

<absolute-constraints>
- DO NOT edit `.ai-rules/` from stack research.
- DO NOT treat blog posts, GitHub examples, or LLM output as authoritative unless they are only marked as inspiration.
- DO NOT add a rule just because a source says it is generally possible; add it only if it maps to our stack and failure mode.
- DO NOT override project product truth, tenant isolation, approval gates, or report-safety rules with generic framework advice.
</absolute-constraints>

<conditional-logic>
IF a review identifies a stack mistake:
THEN map it to one category, check the matching official source in `.ai-stack-rules/SOURCES.md`, scan nearby official guidance for adjacent risks, and either patch the relevant stack rule or write a finding note under `.ai-stack-findings/`.

IF a task opens a new stack surface that is not covered by the current stack rules:
THEN research the official docs for that surface and add a candidate note under `.ai-stack-findings/` before hardening new rules.

IF a source suggests a best practice but the project has not hit that failure mode yet:
THEN keep it in `.ai-stack-findings/` as a candidate; do not harden it into a rule yet.

IF a stack rule would affect product behavior:
THEN route through `.ai-project-rules/00-system-index.md` and let product truth decide behavior.

IF implementation changes follow the refreshed guidance:
THEN run `.ai-stack-rules/07-smoke-verification.md` before handoff.
</conditional-logic>

<pre-flight-checklist>
1. [ ] Did I use official docs before non-authoritative examples?
2. [ ] Did I check adjacent official guidance, not only the exact page matching the bug?
3. [ ] Did I categorize the finding by stack surface?
4. [ ] Did I avoid editing the frozen `.ai-rules/` schema?
5. [ ] Did I promote only stable, project-relevant lessons into `.ai-stack-rules/`?
</pre-flight-checklist>
