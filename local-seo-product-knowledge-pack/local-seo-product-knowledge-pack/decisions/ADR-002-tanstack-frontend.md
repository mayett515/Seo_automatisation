---
title: "ADR-002 TanStack Frontend"
status: "accepted"
---

# ADR-002 TanStack Frontend

## Entscheidung

React/TypeScript mit TanStack Router, Query, Form, Table und optional Store/Virtual.

## Grund

Das Produkt braucht viele Routen, Server-State, Worker-Status, Tabellen, Formulare, Freigaben und UI-State. TanStack passt zum Kontrollzentrum-Gefühl.

## Konsequenz

- Worker-Status über Query polling/subscription.
- Opportunities/Bundles/Keywords über Table.
- Notes/Approvals über Form.
- Mission-Control-Routen über Router.
