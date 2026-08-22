---
description: "Module decomposition, capability extraction, and stable-facade rules for the Local SEO modular monolith"
globs: "apps/api/src/modules/**/*.ts, apps/worker/src/**/*.ts, packages/**/*.{ts,tsx}, **/*architecture*.md"
alwaysApply: false
version: "1.1.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - ".ai-project-rules/02-stack-and-boundaries.md"
  - ".ai-project-rules/14-architecture-direction.md"
  - ".ai-project-rules/15-architecture-regression-guards.md"
  - "AGENTS.md"
  - "apps/api/AGENTS.md"
priority_schema: "critical > strong > guideline"
---

# Domain Execution Contract: Module Cohesion And Capability Extraction

<meta-instruction>
You have been routed here because the task decides whether a Local SEO application module should remain cohesive or extract focused capabilities. Apply the project-specific ownership and lifecycle criteria below without duplicating the generic file-splitting rules owned by the native layer (root `AGENTS.md`, boundaries section).
</meta-instruction>

## 1. Focused Best Practices

<positive-directives>
- Build a modular monolith first: one API process and one worker host sharing typed packages. Do not split into microservices yet.
- Use DDD-lite bounded contexts: Lead, Customer, Project, Website, Service, Area, Opportunity, PageProposal, PageVersion, MediaAsset, Approval, ReleasePlan, Deployment, GscSync, TrackingEvent, Report.
- Judge module cohesion by capability ownership and independent reasons to change.
- Record the extraction evidence before extracting: owning actor/permission, transaction root, lifecycle authority, external dependencies, and change cadence.
- Extract only a use case that is independently nameable and owns its own rules, errors, and tests.
- Keep the module's public entrypoint stable across an extraction: same injectable service class, constructor surface, public method signatures, routes, and permission decorators.
- Keep shared canonicalization, transaction ordering, row-lock order, and persistence invariants in exactly one internal owner per bounded context.
- Return one explicit review outcome: `keep_cohesive`, `extract_capability`, or `defer_pending_evidence`; file size alone cannot choose among them.
</positive-directives>

## 2. Hard Domain Prohibitions

<absolute-constraints>
- DO NOT introduce microservices before the modular monolith boundaries are proven insufficient.
- DO NOT split a Nest module solely because a review called it large or counted its lines.
- DO NOT keep unrelated use cases in one module solely to avoid adding files.
- DO NOT create a pass-through capability that owns no capability, policy, lifecycle, or dependency boundary.
- DO NOT duplicate transaction ordering or row-lock order across extracted capabilities.
</absolute-constraints>

## 3. Context-Dependent Trigger Gates

<conditional-logic>
IF a review, audit, or task claims a module is too large:
THEN inventory its capabilities, actors, transaction roots, lifecycle authorities, and reasons to change before proposing any split.

IF two or more of actor/permission, transaction root, lifecycle authority, external dependency set, or change cadence differ inside one module:
THEN mark the smaller side as an extraction candidate and document the differing ownership evidence; do not split automatically.

IF an extraction candidate is independently nameable, owns real policy, errors, and tests, and can preserve one owner for shared persistence and lock-order invariants:
THEN mark it eligible for extraction; eligibility alone does not choose the outcome.

IF an eligible extraction candidate materially improves cohesion, navigation, test isolation, or change isolation without increasing coordination cost:
THEN choose `extract_capability` and extract it behind the existing public entrypoint.

IF the extraction candidates share canonicalization, row-lock order, or persistence invariants:
THEN keep those invariants in one internal owner and let every capability call it.

IF the candidates share the same owner, lifecycle, dependencies, and reason to change:
THEN choose `keep_cohesive`, keep them together, and do not create a new file.

IF ownership evidence is complete but extraction eligibility or a material cohesion benefit is not demonstrated:
THEN choose `keep_cohesive` and leave the current boundary unchanged.

IF ownership evidence is incomplete:
THEN choose `defer_pending_evidence` and leave the current boundary unchanged until the missing evidence is available.

IF the extraction is behavior-preserving:
THEN keep routes, permission decorators, queue handoff, schemas, exception messages, transaction bodies, statement order, and lock order unchanged, and add a guard that pins each new delegation.

IF reviewing a completed extraction:
THEN verify the stable facade, one internal invariant owner, absence of pass-through capabilities, behavior tests, and moved regression guards.

IF reviewing a decision that kept the existing boundary:
THEN verify the `keep_cohesive` or `defer_pending_evidence` rationale and treat `keep_cohesive` as a valid successful audit result.
</conditional-logic>

## 4. Domain Anchoring & Examples

<context>
Generic file-splitting guidance lives in the native layer (root `AGENTS.md`, boundaries section); frozen detail remains readable in `.ai-rules/06-modular-architecture.md`, `.ai-rules/01C-readable-code-for-humans-and-ai.md`, and `.ai-rules/09-anti-regression.md`. This shard adds only the project's capability, actor/permission, transaction-root, lifecycle, and lock-order criteria for Nest modules.

Reference shape:

```text
reports.service.ts                    -> stable Nest-facing facade
report-generation.capability.ts      -> generation admission and draft persistence
report-review.capability.ts          -> review and artifact lifecycle
report-publication.capability.ts     -> publication, correction, and published reads
report-aggregate-store.ts            -> canonical persistence, aggregate locks, and artifact bytes
```

<example>

```ts
// Good: the stable facade delegates to a capability that owns a complete use case.
publish(...args: Parameters<ReportPublicationCapability["publish"]>) {
  return this.publication.publish(...args);
}
```

</example>

<example>

```ts
// Bad: the new injectable only forwards a call and owns no distinct boundary.
@Injectable()
class ReportPublicationForwarder {
  constructor(private readonly reports: ReportsService) {}

  publish(...args: Parameters<ReportsService["publish"]>) {
    return this.reports.publish(...args);
  }
}
```

</example>
</context>

## 5. Domain Post-Flight Verification

<pre-flight-checklist>
1. [ ] Did I name the capability, actor/permission, transaction root, and lifecycle this boundary owns?
2. [ ] Did I keep the public entrypoint, routes, and permission decorators unchanged?
3. [ ] Does exactly one internal owner still hold canonicalization, transaction ordering, and lock order?
4. [ ] Did I avoid splitting on size alone and avoid keeping unrelated use cases together?
5. [ ] Did the design remain a modular monolith unless a proven boundary requires otherwise?
6. [ ] Did I add or move the executable guard that pins each new delegation?
7. [ ] Did I return `keep_cohesive`, `extract_capability`, or `defer_pending_evidence` with concrete ownership evidence?
</pre-flight-checklist>
