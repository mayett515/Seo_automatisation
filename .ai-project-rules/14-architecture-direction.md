---
description: "Architecture direction for modular monolith, Clean Architecture, Hexagonal ports/adapters, DDD-lite bounded contexts, and system design"
globs: "src/**/*.{ts,tsx}, apps/**/*.{ts,tsx}, packages/**/*.{ts,tsx}, **/*architecture*.md, **/*boundary*.md, **/*port*.{ts,tsx}, **/*adapter*.{ts,tsx}, **/*schema*.{ts,tsx}"
alwaysApply: false
version: "1.0.1"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - ".ai-project-rules/01-product-source-of-truth.md"
  - ".ai-project-rules/02-stack-and-boundaries.md"
  - ".ai-project-rules/06-backend-workers-mastra.md"
  - ".ai-stealer-rules/03-architecture-decision-domains.md"
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/architecture/02-stack-decisions.md"
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/architecture/03-service-boundaries.md"
  - "C:\\total typescript\\Architecture_Karteikarten"
  - "C:\\total typescript\\Hexagonal_Architecture_Karteikarten"
  - "C:\\total typescript\\System_Design_101_Karteikarten"
priority_schema: "critical > strong > guideline"
---

# Domain Execution Contract: Architecture Direction

<meta-instruction>
You have been routed here because the task touches architecture style, dependency direction, module boundaries, ports/adapters, bounded contexts, composition roots, provider isolation, deployment topology, or whether logic belongs in core, adapter, worker, agent, API, or UI. Product-pack behavior still wins over architecture guidance when there is a conflict.
</meta-instruction>

## 1. Focused Best Practices

<positive-directives>
- Build a modular monolith first: one API process and one worker host sharing typed packages. Do not split into microservices yet.
- Apply the Clean Architecture dependency rule: dependencies point inward; core packages do not import frameworks, provider SDKs, queue clients, or UI libraries.
- Use Hexagonal Architecture for all external systems: site hosting, Search Console, crawler/import, analytics, object storage, AI/Mastra, tracking, sitemap, event publishing, verification, and rollback.
- Name ports by purpose, not vendor. Vendor names belong in adapter implementations, provider records, and deployment configuration.
- Use DDD-lite bounded contexts: Lead, Customer, Project, Website, Service, Area, Opportunity, PageProposal, PageVersion, Approval, ReleasePlan, Deployment, GscSync, TrackingEvent, Report.
- Keep Mastra agents/workflows in reasoning, orchestration, and proposal generation. Deterministic workers perform production mutations.
- Keep agent constraints outcome-based: allowed tool categories and denied production outcomes must travel with the run, including subagent delegation.
- Wire concrete adapters in process composition roots, not inside controllers, domain functions, agents, or random worker handlers.
- Use System Design guidance for AWS, Postgres, Redis, object storage, observability, security, retries, idempotency, and failure recovery.
- Before writing an ADR or shaping a new vertical slice, scan `.ai-stealer-rules/03-architecture-decision-domains.md` for cross-cutting concerns and quality attributes the user may not have named.
</positive-directives>

## 2. Hard Domain Prohibitions

<absolute-constraints>
- DO NOT let architecture guidance override product-pack behavior or deployment-extension behavior.
- DO NOT import NestJS, React, BullMQ, provider SDKs, or database clients into `packages/domain` or `packages/seo`.
- DO NOT name ports after vendors, for example `NetlifyPort` or `GscPort`.
- DO NOT put provider-specific field names in domain entities, for example `netlifySiteId`.
- DO NOT let Mastra agents call production side-effect ports directly.
- DO NOT let a child agent, tool runner, or workflow step widen the parent task's denied outcomes.
- DO NOT introduce an external provider without a purpose-named port, adapter, failure mode, and test/fake strategy.
- DO NOT hand-maintain duplicate shared enums, event names, or payload shapes without identifying the single source of truth.
- DO NOT introduce microservices before the modular monolith boundaries are proven insufficient.
</absolute-constraints>

## 3. Context-Dependent Trigger Gates

<conditional-logic>
IF the core needs something from the outside world:
THEN define a purpose-named driven port and keep provider details in an adapter.

IF a controller, route, scheduled job, queue consumer, or test drives a use case:
THEN treat it as a driving adapter and keep use-case/domain logic delivery-technology-neutral.

IF a shared request, response, event, enum, or job payload is introduced:
THEN decide whether Zod, Drizzle, a generated client, or a runtime object owns truth before duplicating it.

IF work is long-running or mutates production:
THEN route it through a BullMQ job and deterministic worker.

IF work is open-ended reasoning, strategy, SEO analysis, content proposal, or release evaluation:
THEN model it as a Mastra workflow/agent output that is schema-validated before any worker acts.

IF the work adds or widens an agent capability:
THEN define or update the agent constraint profile from ADR 0019 before implementation.

IF the task is an ADR, new slice, major refactor, provider integration, production mutation, public endpoint, or tenant-data boundary:
THEN scan `.ai-stealer-rules/03-architecture-decision-domains.md` before finalizing the design.
</conditional-logic>

## 4. Domain Anchoring & Examples

<context>
Port inventory:

```text
SiteHostingPort        -> Netlify adapter
SearchConsolePort      -> Google Search Console OAuth/API adapter
CrawlerPort            -> website import/crawl adapter
AnalyticsPort          -> analytics provider or internal analytics adapter
ObjectStoragePort      -> S3/object storage adapter
MediaAssetStoragePort -> S3/filesystem binary media adapter
AiReasoningPort        -> Mastra workflow/agent adapter
TrackingPort           -> event ingestion adapter
EventPublisherPort     -> domain event publisher adapter
VerificationPort       -> post-deploy verification adapter
SitemapPort            -> sitemap publication adapter
RollbackPort           -> rollback prepare/execute adapter
```

Layering:

```text
delivery adapters -> use cases -> domain core -> purpose-named ports <- provider adapters
```

<example>
```ts
// Good: purpose-named port with vendor-specific adapter outside the core.
export interface SiteHostingPort {
  deployRelease(input: DeployReleaseInput): Promise<DeployReleaseResult>;
}
export class NetlifySiteHostingAdapter implements SiteHostingPort {}
```
</example>

<example>
```ts
// Bad: vendor leaks into the port and domain entity.
export interface NetlifyPort {}
const mainWebsite = { netlifySiteId: "..." };
```
</example>
</context>

## 5. Domain Post-Flight Verification

<pre-flight-checklist>
1. [ ] Did product truth stay above architecture guidance for behavior decisions?
2. [ ] Did core packages stay free of framework, provider, queue, UI, and database-client imports?
3. [ ] Are external systems behind purpose-named ports with adapters and failure modes?
4. [ ] Did agents stay in reasoning while deterministic workers own production mutations?
5. [ ] Did new agent capabilities follow ADR 0019's constraint-profile policy?
6. [ ] Did each shared enum, event, and payload shape have a declared source of truth?
7. [ ] Did the design remain a modular monolith unless a proven boundary requires otherwise?
8. [ ] Did I scan architecture decision domains for relevant cross-cutting concerns?
</pre-flight-checklist>
