---
title: "Gamification, Dynamic Map and Bundles"
version: "1.0.0"
layer: "product-ux"
---

# Gamification, Dynamic Map and Bundles

## Idee

Der Kunde soll Spaß daran haben, Platz-1-Keywords, Top-3-Gebiete, neue Orte und überholte Konkurrenten zu sammeln. Das Spielgefühl ist wie eine strategische Expansion Map, aber visuell seriös und business-orientiert.

## Dynamic Map

```mermaid
flowchart TD
  A[SEO Map] --> B[Orte]
  B --> C[Status Farbe]
  C --> D[Gewonnen]
  C --> E[Stark]
  C --> F[Angriff läuft]
  C --> G[Schwerer Markt]
  C --> H[Nicht gestartet]
  B --> I[Ort anklicken]
  I --> J[Ort Dashboard]
  J --> K[Einwohner / Häuser / Service-Markt]
  J --> L[Keywords]
  J --> M[Konkurrenten]
  J --> N[Bundles]
  J --> O[Aktion starten]
```

## Gebietstaktik

```text
Dachau = Boss-Level / langfristiger Plan
Heimhausen = einfacher schneller Gewinn
Taktik = erst Umgebung einnehmen, dann Dachau stärker angreifen
```

## Achievements

```text
🏆 Platz-1-Sammler
🔥 Dachau-Angriff gestartet
🗺️ Neuer Ort erschlossen
⚔️ Konkurrent überholt
💰 High-Ticket-Keyword gewonnen
📈 Momentum erkannt
🧠 Smart Update freigegeben
```

## Bundles

Ein Bundle ist eine frei oder automatisch gruppierte Menge aus Keywords, Orten, Services oder Seiten. Der Kunde kann z. B. nur Dachdecker-Keywords bündeln, damit der Durchschnitt besser und sinnvoller ist als ein Gesamtmix aller Leistungen.

```text
Bundle: Dach & Spengler
Ø Position: Top 5
Platz-1-Keywords: 5
Top-3-Keywords: 15
Status: Gewinner-Bundle
```

## Bundle Builder Flow

```mermaid
flowchart TD
  A[Kunde markiert Keywords/Orte/Services] --> B[Bundle erstellen]
  B --> C[System berechnet Durchschnittswerte]
  C --> D[Ø Position]
  C --> E[Ø Impressions]
  C --> F[Ø CTR]
  C --> G[Ø Potenzial]
  C --> H[Estimated Revenue]
  D --> I[Bundle Card]
  E --> I
  F --> I
  G --> I
  H --> I
  I --> J[Angriff starten / beobachten / ausbauen]
```

## Automatische Good Bundles

Das System soll positive, sinnvolle Bundles vorschlagen und schlechte Durchschnitte nicht prominent machen.

```text
Score 85–100: Gewinner-Bundle
Score 70–84: Momentum-Bundle
Score 55–69: Ausbauchance
Score <55: intern behalten, nicht prominent zeigen
```

## Seriöser Rahmen

<absolute-constraints>
- Keine kindische Spielzeug-Optik.
- Keine manipulative Suchtmechanik.
- Keine fake Erfolge.
- Keine falschen Garantien.
- Business-Nutzen bleibt immer sichtbar.
</absolute-constraints>
