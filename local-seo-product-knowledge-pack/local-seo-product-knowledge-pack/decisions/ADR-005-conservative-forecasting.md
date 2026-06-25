---
title: "ADR-005 Conservative Forecasting"
status: "accepted-later"
---

# ADR-005 Conservative Forecasting

## Entscheidung

Später, wenn genug Daten existieren, zeigt das Produkt konservative Vorhersagebereiche vor Updates und vergleicht sie mit tatsächlichen Ergebnissen.

## Grund

Underpromise/overdeliver stärkt Vertrauen, solange es ehrlich und nicht manipulativ ist.

## Konsequenz

- raw_prediction intern
- visible_prediction_range extern
- confidence sichtbar
- actual outcome ehrlich klassifizieren
