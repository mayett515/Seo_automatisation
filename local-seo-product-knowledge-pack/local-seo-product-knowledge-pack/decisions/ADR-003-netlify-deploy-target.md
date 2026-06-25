---
title: "ADR-003 Netlify Deploy Target"
status: "accepted"
---

# ADR-003 Netlify Deploy Target

## Entscheidung

Kundenwebsites und Subdomain-Seiten werden auf Netlify deployed.

## Grund

Netlify passt zu React/Vite, Preview Deploys, schnellen statischen Seiten, Routing und automatisierbaren Deployments.

## Konsequenz

- Staging Previews müssen noindex sein.
- Domain/Subdomain Mapping wird Teil des Deploy Workers.
- Sitemap wird nach Deploy aktualisiert.
