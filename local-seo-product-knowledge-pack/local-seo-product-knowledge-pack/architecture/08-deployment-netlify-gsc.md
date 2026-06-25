---
title: "Deployment, Netlify and GSC"
version: "1.0.0"
layer: "deployment"
---

# Deployment, Netlify and GSC

## Deployment Flow

```mermaid
sequenceDiagram
  participant C as Kunde
  participant FE as Frontend
  participant API as NestJS API
  participant W as Deploy Worker
  participant N as Netlify
  participant G as Google Search Console
  participant DB as Postgres

  C->>FE: Version freigeben
  FE->>API: approvePageVersion(versionId)
  API->>DB: Approval speichern
  API->>W: deployApprovedVersion
  W->>DB: Approved Version laden
  W->>W: Build erzeugen
  W->>N: Deploy auf Netlify
  N-->>W: Deploy Status / Live URL
  W->>W: Sitemap aktualisieren
  W->>G: Sitemap submit / sync
  W->>DB: Deployment speichern
  FE-->>C: Live Status anzeigen
```

## Deployment Regeln

<absolute-constraints>
- Keine nicht freigegebene Version deployen.
- Keine Staging URLs indexierbar lassen.
- Keine alten URLs ohne Redirect vergessen.
- Keine Sitemap mit Draft/noindex Seiten füllen.
- Keine Canonicals auf Preview Domains setzen.
</absolute-constraints>

## Netlify Struktur

```text
main website:
kunde.de

local subdomains:
dachau.kunde.de
petershausen.kunde.de

staging:
project-id--preview.netlify.app = noindex
```
