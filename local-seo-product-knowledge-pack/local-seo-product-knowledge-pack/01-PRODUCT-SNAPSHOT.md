---
title: "Product Snapshot"
version: "1.0.0"
purpose: "Eine kompakte, vollständige Produktzusammenfassung."
---

# Product Snapshot

## Ein-Satz-Beschreibung

Eine Local-SEO-Plattform, die eine bestehende Kundenwebsite importiert, verbessert, regionale SEO-Chancen findet, lokale Seiten/Subdomains mit kontrollierbaren Templates erzeugt, Netlify deployed, Google/Website-Daten auswertet und dem Kunden ein spielerisches, kontrolliertes Wachstumserlebnis gibt.

## Hauptnutzer

- Kleinunternehmer
- Handwerker
- Gebäudeservice-Unternehmen
- Reinigung / Hausmeisterservice
- Dachdecker / Spengler
- Entrümpelung / Umzug / Schädlingsbekämpfung
- Ärzte / Zahnärzte / Physio
- Anwälte / Steuerberater / Makler
- Agenturen als White-Label-Kunden

## Produktphasen

```text
Phase 0: Lead Capture + Potenzialbericht
Phase 1: Auftrag + Onboarding
Phase 2: Main Website Rebuild
Phase 3: Local SEO Seiten/Subdomains
Phase 4: Monitoring + Reports
Phase 5: Gamified Expansion + Renewals
```

## Kernfunktionalität

1. Website-URL und Dienstleistungen erfassen.
2. Kurze Fragen stellen: Region, Auftragswert, Kapazität, Zielgebiete, wichtigste Leistungen.
3. Website, Konkurrenz, Orte, Services und Potenzial scannen.
4. 2–3 Monats- und 6-Monats-Potenzialbericht erzeugen.
5. Eigene Kundenwebsite crawlen und als React/Netlify-Projekt rekonstruieren.
6. Design, Mobile UX, CTAs, Technik, SEO und Performance verbessern.
7. Component-/Template-Vorschläge erstellen.
8. Kunde kommentiert Components im Preview Mode.
9. Notizen werden zu Instructions für Worker.
10. Kunde segnet konkrete Versionen ab.
11. Worker generiert Subdomain-/Landingpage-Versionen.
12. Netlify Deploy, Sitemap, Routing, GSC Monitoring.
13. SEO Analyst Agent berichtet ehrlich: Siege, Momentum, Probleme, Chancen.
14. Kunde sammelt Platz-1-Keywords, baut Orte aus, erstellt Bundles.
15. Tracking/Experimente zeigen, welche Änderungen Besucher länger halten und Leads erzeugen.

## Gewünschtes Kundengefühl

```text
Ich sehe meine Google-Welt.
Ich sehe leichte und schwere Orte.
Ich sehe, wo ich schon gewinne.
Ich sehe, wo ich taktisch weiter spreaden sollte.
Ich sehe Konkurrenten, die vor mir stehen.
Ich sehe Bundles, die gut klingen und Sinn machen.
Ich entscheide, was live geht.
```

## Tech Stack, auf den wir uns festgelegt oder empfohlen haben

```text
Frontend:
- React
- TypeScript
- TanStack Router
- TanStack Query
- TanStack Form
- TanStack Table
- TanStack Store optional
- TanStack Virtual optional
- Mermaid für Diagramme
- MapLibre / D3 / React Flow optional für Dynamic Map

Backend:
- NestJS
- PostgreSQL
- Redis + BullMQ oder vergleichbare Queue
- Object Storage für Snapshots/Assets
- ClickHouse optional für Event Analytics
- Vector DB optional für Similarity/Content Memory

AI / Worker:
- Mastra für Agents und Workflows
- Research Agent
- SEO Strategy Agent
- Content Agent
- Template/Layout Agent
- SEO Analyst Agent
- Report Agent

Deploy / Integrationen:
- Netlify
- Google Search Console API
- Google OAuth
- GA4/Plausible/Matomo/PostHog/Clarity optional
- eigenes Event Tracking
```

## Must-have Prinzip

Automation im Hintergrund, Kontrolle im Vordergrund.
