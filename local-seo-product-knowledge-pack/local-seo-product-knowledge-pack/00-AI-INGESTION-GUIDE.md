---
title: "AI Ingestion Guide"
version: "1.0.0"
purpose: "LLMs sollen dieses Produktwissen schnell, korrekt und ohne Kontextverlust aufnehmen."
format_strategy: "YAML metadata + XML logic + Markdown prose + Mermaid diagrams + JSON manifests"
---

# AI Ingestion Guide

<meta-instruction>
Du liest ein Produkt-Knowledge-Pack. Deine Aufgabe ist nicht sofort Code zu schreiben, sondern erst das Produktmodell zu verstehen. Behandle dieses Paket als Kontextgrundlage für spätere Planung, Architektur, Coding, Pitch, UI/UX, Roadmap und Agent-Design.
</meta-instruction>

<reading-order>
1. Lies `01-PRODUCT-SNAPSHOT.md` für die Kurzfassung.
2. Lies `product/01-end-to-end-product.md` für den kompletten Produktloop.
3. Lies `architecture/01-system-overview.md` für technische Architektur.
4. Lies `ux/01-customer-experience.md` für das Kundengefühl.
5. Lies `diagrams/00-diagram-index.md` und relevante `.mmd` Dateien für visuelle Logik.
6. Nutze `data/manifest.json`, wenn du maschinenlesbare Struktur brauchst.
</reading-order>

<absolute-constraints>
- Das Produkt ist keine Blackhat-SEO-Maschine.
- Das Produkt klont keine Wettbewerber-Websites.
- Das Produkt importiert und verbessert die eigene Website des Kunden.
- Der Kunde muss kontrollieren, was live geht.
- Preview und Approval kommen vor Deploy.
- Reports dürfen nicht immer alles positiv darstellen.
- Schlechte Signale müssen ehrlich als Warnung, Beobachtung oder Ausbauchance erklärt werden.
- Forecasts dürfen konservativ sein, aber nicht fake.
- Analytics und Session Tracking müssen datenschutzbewusst konzipiert werden.
- Das Produkt soll spaßig wirken, aber geschäftlich seriös bleiben.
</absolute-constraints>

<interpretation-hints>
Wenn der Nutzer später nach "das Produkt" fragt, meint er die gesamte Plattform: Pre-Sales Potentialbericht, Website-Rebuild, Component-Preview, Subdomain-Generator, SEO Analyst, Dynamic Map, Bundles, Reports, Tracking, Experimente, Netlify Deployment, GSC/Analytics Monitoring und AI Worker/Agents.
</interpretation-hints>

## Wissensquellen im Paket

- `sources/kundenreport_seo_martines_v4.pdf` ist der Beispiel-Outcome-Report.
- `sources/schema_reference/` enthält die vom Nutzer hochgeladenen AI-Schema-Regeln und Formatvorlagen.
- Dieses Paket übersetzt die Konversation in eine strukturierte Produkt-/Architektur-Wissensbasis.

## Wenn du dieses Paket weiterentwickelst

Nutze bevorzugt:

- knappe YAML Frontmatter für Metadaten,
- XML-Blöcke für harte Regeln und Prozessgates,
- Markdown für Erklärungen,
- Mermaid für Diagramme,
- JSON für maschinenlesbare Produktmodelle.
