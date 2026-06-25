---
title: "Stack Decisions"
version: "1.0.0"
layer: "architecture"
---

# Stack Decisions

## Frontend

```text
React + TypeScript
TanStack Router für strukturierte Routen
TanStack Query für Server-State und Worker-Status
TanStack Form für Audit/Onboarding/Notizen/Freigaben
TanStack Table für Keywords, Bundles, Pages, Reports
TanStack Store optional für UI State
TanStack Virtual optional für große Tabellen
Mermaid für Architektur-/Reportdiagramme
MapLibre / D3 / React Flow für Dynamic Map
```

## Backend

```text
NestJS
PostgreSQL
Redis + BullMQ oder kompatible Queue
Object Storage für Screenshots, Assets, Builds, Reports
ClickHouse optional für Analytics Events
Vector DB optional für Content Similarity und Memory
```

## AI / Agenten

```text
Mastra Workflows für deterministische Prozesse
Mastra Agents für offene Analyse/Strategie/Content-Aufgaben
Research Agent
SEO Strategy Agent
Content Agent
Template/Layout Agent
SEO Analyst Agent
Report Agent
```

## Integrationen

```text
Netlify API für Deployments
Customer Domain/DNS für Subdomains
Google OAuth für Search Console Zugriff
Google Search Console API für Search Analytics, Sitemaps, URL Status
GA4/Plausible/Matomo/PostHog/Clarity optional für Website Analytics
Eigenes Event Tracking für Telefon/WhatsApp/Form/Scroll
```

## Datenstrategie

```text
Postgres = Produktdaten, Projekte, Pages, Approvals, Reports
Redis = Jobs, Worker State, Retrys
Object Storage = Crawls, HTML Snapshots, Assets, PDF Reports
ClickHouse = Event Analytics bei höherem Volumen
Vector DB = Similarity, Content Memory, Competitor Patterns optional
```
