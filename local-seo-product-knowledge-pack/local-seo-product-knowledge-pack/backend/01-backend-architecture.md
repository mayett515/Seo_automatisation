---
title: "Backend Architecture"
version: "1.0.0"
layer: "backend"
---

# Backend Architecture

## NestJS Module

```text
LeadModule
PreAuditModule
ProjectModule
WebsiteImportModule
TemplateModule
ComponentModule
AreaServiceModule
OpportunityModule
PageProposalModule
ApprovalModule
DeploymentModule
GscModule
TrackingModule
AnalyticsModule
ReportModule
GamificationModule
NotificationModule
BillingModule
```

## API Principles

```text
- Every long-running task returns jobId.
- Frontend polls or subscribes to job state.
- Every deployable artifact is versioned.
- Every customer decision is auditable.
- Workers are idempotent where possible.
- Failures are explicit, not silent.
```

## Backend Flow

```mermaid
flowchart TD
  FE[Frontend] --> API[NestJS Controllers]
  API --> Services[Domain Services]
  Services --> DB[(Postgres)]
  Services --> Queue[(Redis Queue)]
  Queue --> Workers[Workers]
  Workers --> DB
  Workers --> External[Netlify/GSC/Analytics]
  Workers --> Notifications[Notifications]
```
