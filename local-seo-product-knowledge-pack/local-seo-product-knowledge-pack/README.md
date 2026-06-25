---
title: "Local SEO Product Knowledge Pack"
version: "1.0.0"
audience: ["human", "llm", "founder", "engineer", "designer", "product-manager"]
purpose: "Gesamtes Produktwissen aus der Konversation strukturiert, lesbar und prüfbar machen."
status: "source-of-truth-draft"
---

# Local SEO Product Knowledge Pack

Dieses Paket beschreibt das komplette Produkt, wie es in der Konversation entstanden ist: eine Local-SEO-Automation für Firmen/Kleinunternehmer, die Websites importiert, verbessert, lokal erweitert, Chancen findet, Reports erzeugt und dem Kunden die Kontrolle gibt.

## Was dieses Produkt ist

Eine **automatisierte Local-SEO-Agentur-Maschine** mit spielerischem UX-Layer:

1. Interessent gibt Website, Dienstleistungen und kurze Antworten ein.
2. Pre-Audit Worker scannt Website, Leistungen, Konkurrenz und Gebiete.
3. Der Interessent bekommt einen Potenzialbericht für 2–3 Monate und 6 Monate inklusive Umsatz-/Lead-Schätzung.
4. Bei Auftrag wird die eigene Kundenwebsite importiert, als moderne React/Netlify-Version rekonstruiert und verbessert.
5. Das System erzeugt lokale Seiten/Subdomains auf Basis eigener Components und Templates.
6. Der Kunde sieht Preview, kann Components wechseln, Notizen schreiben und konkrete Versionen freigeben.
7. Worker deployen auf Netlify, aktualisieren Sitemap und starten Monitoring.
8. Google Search Console, Website Analytics und Conversion Events fließen ins Dashboard.
9. Ein SEO Analyst Agent erklärt Fortschritte, Probleme, Chancen und schlägt Updates vor.
10. Der Kunde sammelt Platz-1-Keywords, baut Gebiete aus, erstellt Bundles und entscheidet über neue Angriffe.

## Wie AI dieses Paket lesen soll

Beginne mit:

1. `00-AI-INGESTION-GUIDE.md`
2. `01-PRODUCT-SNAPSHOT.md`
3. `02-DIAGRAM-CATALOG.md`
4. `architecture/01-system-overview.md`
5. `product/01-end-to-end-product.md`
6. `ux/01-customer-experience.md`
7. `diagrams/00-diagram-index.md`
8. `data/manifest.json`

## Ordnerstruktur

```text
local-seo-product-knowledge-pack/
├── README.md
├── 00-AI-INGESTION-GUIDE.md
├── 01-PRODUCT-SNAPSHOT.md
├── 02-DIAGRAM-CATALOG.md
├── architecture/
├── product/
├── ux/
├── backend/
├── frontend/
├── data/
├── diagrams/
├── decisions/
├── prompts/
├── sources/
└── roadmap/
```

## Grundprinzip

Das Produkt darf nicht wie eine Blackbox wirken. Es soll sich anfühlen wie:

> Ein SEO-Analyst sitzt neben dir, zeigt Chancen und Probleme, baut Vorschläge als Preview vor — und du entscheidest, was live geht.

## Wichtige Begriffe

- **Lead / Interessent:** Noch kein Kunde. Er bekommt erst einen Potenzialbericht.
- **Kunde / Projekt:** Auftrag wurde gestartet.
- **Main Website Rebuild:** Eigene Kundenwebsite wird technisch neu gebaut und verbessert.
- **Subdomain / Local Page:** Regionale Seiten für Orte, Dienstleistungen und Suchintentionen.
- **Component Template:** Vorgeprüfte UI-Bausteine, aus denen Seiten generiert werden.
- **Preview Mode:** Kunde sieht Seite wie live, kommentiert Components und gibt Version frei.
- **SEO Analyst Agent:** Berater im UI, der ehrlich gute und schlechte Signale erklärt.
- **Bundle:** Gruppe von Keywords/Seiten/Orten/Services mit Durchschnittswerten.
- **Map Game:** Dynamische Karte, in der Orte gewonnen, aufgebaut oder strategisch angegriffen werden.
