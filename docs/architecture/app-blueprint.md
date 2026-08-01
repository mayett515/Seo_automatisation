# Local SEO Platform Blueprint

## Runtime

```text
Frontend control panel: Netlify
Customer websites/previews: Netlify
API: AWS ECS Fargate + NestJS Fastify
Workers: AWS ECS Fargate + BullMQ + Mastra host
Data: RDS Postgres, ElastiCache Redis, S3
Auth: Better Auth
Analytics MVP: own anonymous tracking events
```

## MVP Path

1. Lead capture and pre-audit.
2. Project setup and website import.
3. AI Opportunity Scout using website, GSC, tracking, SERP, competitor, and field evidence.
4. Opportunity Explorer with evidence, risk, confidence, and next actions.
5. Page brief or page proposal from an operator-selected, non-rejected service-location opportunity with valid evidence.
6. Component-constrained preview, notes, and approval.
7. Deployment Agent release plan.
8. Netlify deploy, sitemap, tracking injector, verification.
9. GSC OAuth/API sync, then customer-safe reports and next opportunity.

## MVP Product Loop

```text
website import / GSC / tracking / SERP / competitor / field evidence
-> AI Opportunity Scout
-> Opportunity Explorer
-> page brief / proposal
-> component-constrained preview and notes
-> approval
-> release preflight
-> deploy and verify
-> report and next opportunity
```

The MVP should make AI-assisted local SEO opportunity discovery visible before automation feels magical. The customer/operator should see nearby places, service-location gaps, competitor observations, evidence tiers, confidence, warnings, and the next controlled action.

Website import is the evidence-gathering entry point for new projects. The implemented baseline imports the customer's own site and extracts route, content, brand, service, and area facts for later workflows. Mapping those facts into a dedicated controlled noindex rebuild preview remains the Website Understanding follow-up; the implemented Page Proposal and Page Studio lane already creates controlled previews from operator-selected opportunity evidence.

Reference: [Agent-First MVP Roadmap](agent-first-mvp-roadmap.md).

## Full Platform Modules

```text
Auth
Lead / PreAudit
Customer / Project
WebsiteImport
Template / Component
AreaService / Opportunity
PageProposal / Approval
Release / Deployment
GSC OAuth/API Sync / Tracking / Analytics
Report
Gamification
Notification
Billing
```

## Frontend Product Shape

```text
Control-panel UI:
  @localseo/ui owns reusable app-shell, status, evidence, workflow, data-display,
  map-frame, timeline, preview-control, and form components.

Customer-page registry:
  @localseo/page-registry owns deployable customer-site section schemas,
  editor metadata, validation, SEO fact derivation, and deterministic static
  rendering. The implemented set includes the Local SEO service-area skeleton
  plus ImageText; richer grids, maps, galleries, and proof sections remain additive.
```

Reference: [Frontend UI And Page Registry Architecture](frontend-ui-and-page-registry.md).

Reference: [Website Import And Rebuild Preview Architecture](website-import-rebuild-preview.md).

Reference: [Page Studio Layout-Zone Editor](page-studio-layout-zone-editor.md).

## Architecture Direction

```text
Style: modular monolith first, no microservices yet
Dependency rule: dependencies point inward
Pattern: Hexagonal ports and adapters for external providers
Core: packages/domain and packages/seo stay framework-free
Composition: one composition root per process wires adapters into use cases
```

## Bounded Contexts

```text
Lead, Customer, Project, Website, Service, Area, Opportunity,
PageProposal, PageVersion, Approval, ReleasePlan, Deployment,
MediaAsset, GscSync, TrackingEvent, Report
```

## Port Inventory

```text
SiteHostingPort        -> Netlify adapter
SearchConsolePort      -> Google Search Console OAuth/API adapter
CrawlerPort            -> website import/crawl adapter
AnalyticsPort          -> analytics provider or internal analytics adapter
ObjectStoragePort      -> S3/object storage adapter
MediaAssetStoragePort  -> S3/filesystem binary media adapter
MediaAssetCleanupStoragePort -> bounded S3/filesystem private-byte cleanup adapter
AiReasoningPort        -> Mastra workflow/agent adapter
TrackingPort           -> event ingestion adapter
EventPublisherPort     -> domain event publisher adapter
VerificationPort       -> post-deploy verification adapter
SitemapPort            -> sitemap publication adapter
RollbackPort           -> rollback prepare/execute adapter
```

## Implementation Checkpoint

The MVP control path is implemented through Opportunity Scout, Page Proposal, Page Studio, media-aware preview, approval, release planning, deploy, verification, rollback, safe-work recovery, and bounded physical media cleanup. The next product milestone is customer-safe Report and Next Action. ADR 0021 now fixes the digest-bound snapshot/provenance/publication/action architecture, while runtime reporting still has only schema/task/event vocabulary, a skeletal `reports` table, safety guards, and a frontend placeholder. Implementation starts with contracts, canonicalization, the core aggregate, and a deterministic fact-only publication path.

## Non-Negotiables

- AI suggests, a persisted human actor approves, and deterministic workers execute.
- Frontend never calls workers directly.
- Agents never deploy production directly.
- Agents scout, reason, classify, draft, and explain from evidence; they do not approve, deploy, roll back, or mutate providers.
- Website import is read-only evidence gathering; rebuild output is a controlled preview, not arbitrary cloning.
- AI Opportunity Scout output persists evidence-backed opportunities only. Explicit operator actions may monitor/reject them or queue a Page Proposal; Scout output never publishes by itself.
- Zod owns external input and output contracts.
- Drizzle owns persistence contracts.
- Ports are named by purpose; vendor names live in adapters, provider records, and deployment configuration.
- Control-panel UI components and deployable customer-page components stay separate.
- PageJson stores opaque project-owned media references, never raw media URLs or storage keys; untrusted uploads become selectable only after deterministic worker normalization.
- Each shared enum, event, and payload type has exactly one declared source of truth.
- Customer reports do not use GSC impressions, CTR, average position, or weak opportunity signals as success proof.
- Automated GSC OAuth/API sync is the only product path for Search Console data; if GSC is not connected, GSC-dependent workflows wait for connection.

## Stealer Workflow Checkpoints

Use the "A Good Artist Steals" workflow before architecture-significant vertical slices: Deployment Agent, GSC sync, website import/rebuild, TanStack-heavy frontend surfaces, reporting, tenancy/auth, CI/CD, observability, and failure recovery. Skip it for small obvious fixes and do not use it to reopen locked product decisions.
