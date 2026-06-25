---
title: "ADR-001 Controlled Automation"
status: "accepted"
---

# ADR-001 Controlled Automation

## Entscheidung

Das Produkt automatisiert Analyse, Generierung, Deploy und Reporting, aber produktive Änderungen gehen erst nach Kundenfreigabe live.

## Grund

Kunden müssen sich in Kontrolle fühlen. SEO-Änderungen betreffen Marke, Texte, Domain und Sichtbarkeit.

## Konsequenz

- Preview Mode ist Pflicht.
- Approval ist versioniert.
- Deploy Worker nimmt nur approved Versionen.
- Agenten beraten, aber entscheiden nicht für den Kunden.
