---
title: "Forecast and Renewal Loop"
version: "1.0.0"
layer: "product-growth"
---

# Forecast and Renewal Loop

## Idee

Wenn genug historische Daten vorhanden sind, zeigt das Tool vor einem Update eine konservative Wirkungsschätzung. Nach dem Report wird die tatsächliche Performance verglichen.

## Saubere Version

```text
Raw Prediction intern: +18 % Sichtbarkeit
Customer Range sichtbar: +8–14 %
Actual später: +19 %
Report: Update performed above expectation
```

## Flow

```mermaid
flowchart TD
  A[SEO Analyst findet Chance] --> B[Prediction Model]
  B --> C[Raw Prediction]
  C --> D[Confidence Adjustment]
  D --> E[Conservative Visible Range]
  E --> F[Kunde klickt Update]
  F --> G[Worker deployt Änderung]
  G --> H[Measurement Window]
  H --> I[Report: Expected vs Actual]
  I --> J{Outcome}
  J -- Exceeded --> K[Trust Moment]
  J -- Met --> L[Keep going]
  J -- Early --> M[Weiter beobachten]
  J -- Underperformed --> N[Analyst schlägt Korrektur vor]
```

## Ergebnis-Kategorien

```text
Exceeded expectation
Met expectation
Too early to judge
Underperformed
Failed / needs correction
```

## Regel

Konservativ schätzen ist gut. Fake senken oder manipulieren ist nicht erlaubt.
