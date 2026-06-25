---
title: "Diagram Catalog"
version: "1.0.0"
purpose: "Welche Diagrammtypen für Software-Architektur und dieses Produkt nützlich sind."
---

# Diagram Catalog

Dieses Produkt profitiert von mehreren Diagrammarten. Die Dateien liegen zusätzlich als `.mmd` unter `diagrams/`.

## Architekturdiagramme

| Diagrammtyp | Wofür | Datei |
|---|---|---|
| C4 Context | Produkt im Umfeld von Kunden, Google, Netlify, Analytics | `diagrams/01-c4-context.mmd` |
| C4 Container | Frontend, Backend, Workers, DBs, externe APIs | `diagrams/02-c4-container.mmd` |
| Component Architecture | Interne Module im Frontend/Backend | `architecture/01-system-overview.md` |
| Deployment Flow | Netlify, Domain, Sitemap, GSC | `diagrams/15-deployment-flow.mmd` |
| Queue Topology | Worker und Job-Flows | `diagrams/14-queue-topology.mmd` |

## Prozessdiagramme

| Diagrammtyp | Wofür | Datei |
|---|---|---|
| Flowchart | End-to-End Produktlogik | `diagrams/03-end-to-end-flow.mmd` |
| Sequence Diagram | Interaktionen Kunde/API/Worker/Netlify/GSC | `diagrams/04-website-rebuild-sequence.mmd` |
| State Machine | Approval, Page Versioning, Report States | `diagrams/08-approval-state-machine.mmd` |
| Decision Tree | Subdomain vs Unterseite, easy vs hard place | `diagrams/11-competitor-difficulty-strategy.mmd` |

## Daten-/Domänendiagramme

| Diagrammtyp | Wofür | Datei |
|---|---|---|
| ERD | Entities, Projekte, Pages, Bundles, Reports | `diagrams/13-data-model-erd.mmd` |
| Data Flow | GSC/Analytics/Events zu Dashboard/Analyst | `diagrams/16-analytics-funnel.mmd` |
| Event Storming | Domain Events von Lead bis Renewal | `product/02-domain-events.md` |

## UX-/Produktdiagramme

| Diagrammtyp | Wofür | Datei |
|---|---|---|
| User Journey | Was Kunde vor/nach Auftrag erlebt | `ux/01-customer-experience.md` |
| Service Blueprint | Frontstage/Backstage/Worker | `ux/02-service-blueprint.md` |
| Gamification Loop | Map, Keywords, Bundles, Gegner | `diagrams/10-gamification-map-loop.mmd` |
| Experiment Loop | Änderungen messen, Besucher länger halten | `diagrams/12-tracking-experiment-loop.mmd` |
| Report Decision Loop | Report als Entscheidungssystem | `diagrams/09-report-decision-loop.mmd` |

## Empfehlung

Für AI-Inspektion zuerst Diagrammindex lesen, danach `.mmd` Dateien einzeln öffnen. Für menschliches Verständnis die Markdown-Dokumente lesen, weil sie Diagramme erklären.
