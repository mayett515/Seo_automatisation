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
6. GSC sync and customer-safe reports.

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
GSC / Tracking / Analytics
Report
Gamification
Notification
Billing
```

## Non-Negotiables

- AI suggests, customer approves, deterministic workers execute.
- Frontend never calls workers directly.
- Agents never deploy production directly.
- Zod owns external input contracts.
- Drizzle owns persistence contracts.
- Customer reports do not use GSC impressions, CTR, average position, or weak opportunity signals as success proof.

