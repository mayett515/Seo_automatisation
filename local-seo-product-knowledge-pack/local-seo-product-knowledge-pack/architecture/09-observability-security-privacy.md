---
title: "Observability, Security and Privacy"
version: "1.0.0"
layer: "security"
---

# Observability, Security and Privacy

## Observability

```text
- Worker job status
- worker retries / failures
- deploy status
- sitemap update status
- GSC sync status
- tracking event ingestion
- report generation status
- agent observation logs
- customer approval logs
```

## Security

```text
- Google OAuth tokens encrypted at rest
- project-level authorization
- tenant isolation
- audit logs for approvals/deploys
- signed or scoped preview URLs if needed
- no direct worker access from frontend
```

## Privacy / Tracking

```text
MVP:
- anonymous events
- no session replay by default
- no sensitive form contents
- IP anonymization or no IP storage
- explicit opt-in for advanced tracking

Optional later:
- PostHog / Clarity / Hotjar with masking and consent
```

## Tracking Prohibitions

<absolute-constraints>
- Keine Formularinhalte speichern.
- Keine Namen/E-Mails/Telefonnummern aus Inputs aufnehmen.
- Keine Session Replays ohne Consent aktivieren.
- Keine Kundendaten projektübergreifend vermischen.
- Keine stillen Tracking-Fehler als Erfolg melden.
</absolute-constraints>
