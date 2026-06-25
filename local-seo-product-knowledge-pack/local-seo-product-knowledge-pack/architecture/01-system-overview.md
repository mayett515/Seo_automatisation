---
title: "System Overview"
version: "1.0.0"
layer: "architecture"
---

# System Overview

## Hauptsysteme

```text
Frontend: React/TypeScript + TanStack
Backend: NestJS API
Workers: Queue-basierte Job-Verarbeitung
AI Agents: Mastra Workflows/Agents
Data: Postgres, Redis, Object Storage, optional ClickHouse/Vector DB
External: Netlify, Google Search Console, Google OAuth, Analytics Tools
```

## Systemdiagramm

```mermaid
flowchart TB
  subgraph Customer[Customer / Lead]
    C1[Website URL]
    C2[Services]
    C3[Questions]
    C4[Approvals]
    C5[Reports]
  end

  subgraph FE[React TypeScript Frontend]
    F1[Landing / Audit UI]
    F2[Project Dashboard]
    F3[Preview Mode]
    F4[Map Game]
    F5[Reports]
  end

  subgraph API[NestJS Backend]
    A1[Lead API]
    A2[Project API]
    A3[Template API]
    A4[Approval API]
    A5[Deploy API]
    A6[Tracking API]
    A7[Report API]
  end

  subgraph Workers[Worker Layer]
    W1[Pre-Audit]
    W2[Clone/Rebuild]
    W3[Competitor]
    W4[Opportunity]
    W5[Page Generator]
    W6[SEO QA]
    W7[Deploy]
    W8[GSC Sync]
    W9[Analytics Processor]
    W10[Report]
  end

  subgraph AI[Mastra Agents]
    M1[Research]
    M2[SEO Strategy]
    M3[Content]
    M4[Template/Layout]
    M5[SEO Analyst]
    M6[Report]
  end

  subgraph Data[Data Stores]
    D1[(Postgres)]
    D2[(Redis Queue)]
    D3[(Object Storage)]
    D4[(ClickHouse optional)]
    D5[(Vector DB optional)]
  end

  subgraph Ext[External]
    E1[Customer Website]
    E2[Netlify]
    E3[Google Search Console]
    E4[Google OAuth]
    E5[Analytics Tools]
  end

  Customer --> FE
  FE --> API
  API --> D1
  API --> D2
  D2 --> Workers
  Workers --> AI
  Workers --> Data
  Workers --> Ext
  API --> Ext
```

## Architekturprinzip

```text
Frontend macht Kontrolle sichtbar.
Backend orchestriert und schützt Business-Logik.
Workers machen schwere Arbeit asynchron.
AI Agents analysieren, schreiben, beraten.
Deploy/Tracking/Monitoring schließen den Loop.
```
