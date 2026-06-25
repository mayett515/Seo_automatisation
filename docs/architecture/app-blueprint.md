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
3. Preview, notes, and approval.
4. Deployment Agent release plan.
5. Netlify deploy, sitemap, tracking injector, verification.
6. GSC OAuth/API sync, then customer-safe reports.

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
GscSync, TrackingEvent, Report
```

## Port Inventory

```text
SiteHostingPort        -> Netlify adapter
SearchConsolePort      -> Google Search Console OAuth/API adapter
CrawlerPort            -> website import/crawl adapter
AnalyticsPort          -> analytics provider or internal analytics adapter
ObjectStoragePort      -> S3/object storage adapter
AiReasoningPort        -> Mastra workflow/agent adapter
TrackingPort           -> event ingestion adapter
EventPublisherPort     -> domain event publisher adapter
VerificationPort       -> post-deploy verification adapter
SitemapPort            -> sitemap publication adapter
RollbackPort           -> rollback prepare/execute adapter
```

## Non-Negotiables

- AI suggests, customer approves, deterministic workers execute.
- Frontend never calls workers directly.
- Agents never deploy production directly.
- Zod owns external input and output contracts.
- Drizzle owns persistence contracts.
- Ports are named by purpose; vendor names live in adapters, provider records, and deployment configuration.
- Each shared enum, event, and payload type has exactly one declared source of truth.
- Customer reports do not use GSC impressions, CTR, average position, or weak opportunity signals as success proof.
- Automated GSC OAuth/API sync is the only product path for Search Console data; if GSC is not connected, GSC-dependent workflows wait for connection.

## Stealer Workflow Checkpoints

Use the "A Good Artist Steals" workflow before architecture-significant vertical slices: Deployment Agent, GSC sync, website import/rebuild, TanStack-heavy frontend surfaces, reporting, tenancy/auth, CI/CD, observability, and failure recovery. Skip it for small obvious fixes and do not use it to reopen locked product decisions.
