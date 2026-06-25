---
title: "AI Agent Architecture"
version: "1.0.0"
layer: "ai"
---

# AI Agent Architecture

## Mastra Modell

Deterministische Prozessketten sind Workflows. Offene Analyse-/Beratungsaufgaben sind Agents.

## Agents

```text
Research Agent:
- findet SERP-/Wettbewerber-/Branchenmuster

SEO Strategy Agent:
- bewertet Orte, Services, Keywords, Konkurrenz

Content Agent:
- schreibt lokale Texte, FAQs, Meta Titles, CTAs

Template/Layout Agent:
- wählt Components und Layoutvarianten

SEO Analyst Agent:
- erklärt Daten, speichert Beobachtungen, schlägt Aktionen vor

Report Agent:
- erstellt Lageberichte, Kundenreports, catchy Copy
```

## Agent-Tool Map

```mermaid
flowchart LR
  A[Research Agent] --> T1[search tool]
  A --> T2[competitor snapshot tool]
  B[SEO Strategy Agent] --> T3[gsc performance tool]
  B --> T4[opportunity scorer]
  C[Content Agent] --> T5[page json tool]
  C --> T6[content memory]
  D[Template Agent] --> T7[component library]
  E[SEO Analyst Agent] --> T8[analytics query]
  E --> T9[observation writer]
  F[Report Agent] --> T10[pdf/report renderer]
```

## Agent Safety

<absolute-constraints>
- Agents dürfen keine Deploys ohne Approval triggern.
- Agents dürfen keine Kundenentscheidung vortäuschen.
- Agents dürfen keine Google-Rankings garantieren.
- Agents dürfen Wettbewerber nicht kopieren.
- Agents müssen Unsicherheit/Confidence sichtbar machen.
</absolute-constraints>
