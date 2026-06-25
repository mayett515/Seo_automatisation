---
title: "API Surface"
version: "1.0.0"
layer: "backend-api"
---

# API Surface

## Lead / Pre-Sales

```text
POST   /leads
POST   /leads/:id/website
POST   /leads/:id/services
POST   /leads/:id/questions
POST   /leads/:id/start-pre-audit
GET    /leads/:id/pre-audit-status
GET    /leads/:id/potential-report
POST   /leads/:id/convert-to-customer
```

## Project / Website

```text
POST   /projects
GET    /projects/:id
PATCH  /projects/:id/settings
POST   /projects/:id/import-website
GET    /projects/:id/import-status
GET    /projects/:id/main-preview
POST   /projects/:id/approve-main-website
```

## Templates / Components

```text
GET    /component-templates
GET    /page-templates
POST   /projects/:id/select-template
PATCH  /component-instances/:id
POST   /component-instances/:id/change-template
POST   /component-instances/:id/notes
```

## Opportunities / Pages

```text
POST   /projects/:id/discover-opportunities
GET    /projects/:id/opportunities
POST   /opportunities/:id/approve
POST   /opportunities/:id/reject
GET    /projects/:id/page-proposals
POST   /page-proposals/:id/generate-version
POST   /page-versions/:id/approve
POST   /page-versions/:id/deploy
```

## GSC / Analytics / Reports

```text
GET    /gsc/connect
GET    /gsc/callback
POST   /projects/:id/gsc/sync
GET    /projects/:id/gsc/performance
POST   /track
GET    /projects/:id/analytics
POST   /projects/:id/reports/generate
GET    /projects/:id/reports
GET    /reports/:id/download
```
