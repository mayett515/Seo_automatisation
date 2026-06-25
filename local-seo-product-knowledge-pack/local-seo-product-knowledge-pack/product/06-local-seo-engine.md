---
title: "Local SEO Engine"
version: "1.0.0"
layer: "product"
---

# Local SEO Engine

## Aufgabe

Die Engine findet lokale Chancen aus Kombinationen von Ort, Dienstleistung, Konkurrenz, Suchintention, Rankingstatus, Ertrag und Umsetzbarkeit.

## Matrizen

```text
Area Matrix:
- Orte
- Ortsteile
- Landkreise
- Radius
- Priorität
- Ausschlussgebiete

Service Matrix:
- Kernleistungen
- High-ticket Leistungen
- wiederkehrende Leistungen
- Notfallleistungen
- Cross-Sell Leistungen

Keyword Matrix:
- service + ort
- problem + ort
- notfall + ort
- markenlose Suchintention
- Wettbewerber-Kontext
```

## Schwierigkeitslogik

```mermaid
flowchart TD
  A[Ort + Service] --> B[Konkurrenten scannen]
  B --> C[Ranking Difficulty]
  B --> D[Content Gap]
  B --> E[Business Value]
  B --> F[Current Momentum]
  C --> G[Opportunity Score]
  D --> G
  E --> G
  F --> G
  G --> H{Typ}
  H -- Easy --> I[Quick Win]
  H -- Medium --> J[Aufbaugebiet]
  H -- Hard --> K[Langzeitplanung]
  H -- Boss --> L[Umgebung zuerst einnehmen]
```

## Taktik-Beispiel

```text
Dachau = schwieriger Ort / langfristiger Angriff.
Heimhausen = schneller Ort / kann schnell erledigt werden.
Strategie: Umgebung gewinnen, regionale Relevanz aufbauen, dann Dachau stärker drücken.
```

## Scoring Faktoren

```text
opportunity_score =
  search_intent_score
+ business_value_score
+ current_visibility_score
+ competitor_weakness_score
+ local_relevance_score
+ content_gap_score
+ execution_effort_inverse
```
