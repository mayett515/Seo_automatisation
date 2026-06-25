---
title: "Worker Architecture"
version: "1.0.0"
layer: "backend-workers"
---

# Worker Architecture

## Queue Topology

```mermaid
flowchart TB
  API[NestJS API] --> Q1[queue:pre-audit]
  API --> Q2[queue:website-import]
  API --> Q3[queue:local-analysis]
  API --> Q4[queue:page-generation]
  API --> Q5[queue:seo-qa]
  API --> Q6[queue:deploy]
  API --> Q7[queue:gsc-sync]
  API --> Q8[queue:analytics]
  API --> Q9[queue:report]
  API --> Q10[queue:notifications]

  Q1 --> W1[Pre-Audit Worker]
  Q2 --> W2[Clone/Rebuild Worker]
  Q3 --> W3[Competitor + Opportunity Worker]
  Q4 --> W4[Page/Subdomain Generator]
  Q5 --> W5[SEO QA Worker]
  Q6 --> W6[Netlify Deploy Worker]
  Q7 --> W7[GSC Sync Worker]
  Q8 --> W8[Analytics Processor]
  Q9 --> W9[Report Worker]
  Q10 --> W10[Notification Worker]
```

## Worker Responsibilities

```text
Pre-Audit Worker:
- scannt Lead Website, Services, Konkurrenz, Orte
- erzeugt Potenzialbericht

Clone/Rebuild Worker:
- crawlt eigene Website des Kunden
- extrahiert Layout/Assets/Content
- erzeugt React/Vite Projekt
- verbessert UX/SEO/Performance

Competitor + Opportunity Worker:
- scannt schwere/einfache Konkurrenten
- findet easy/hard Orte
- baut Ort-Service-Matrix

Page Generator:
- wählt Template/Components
- erzeugt Page JSON und Versionen
- verarbeitet Kundennotizen

SEO QA Worker:
- prüft Technik, Similarity, Canonicals, Sitemap, noindex, Qualität

Deploy Worker:
- baut approved Versionen
- pushed Netlify
- setzt Domain/Subdomain/Routing

GSC Sync Worker:
- holt Queries, Pages, Clicks, Impressions, CTR, Position

Analytics Processor:
- verarbeitet page_view, scroll, CTA, phone, whatsapp, forms

Report Worker:
- erstellt Lagebericht, Map, Bundles, Empfehlungen
```
