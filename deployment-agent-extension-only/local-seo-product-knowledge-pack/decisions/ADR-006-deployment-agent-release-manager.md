---
title: "ADR-006: Deployment Agent as Release Manager"
domain: "decision"
status: "accepted"
date: "2026-06-23"
module: "deployment_agent"
---

# ADR-006: Deployment Agent as Release Manager

## Context

The platform creates and updates customer websites, local landing pages, subdomains, tracking scripts, sitemaps, and monitoring configuration.
A raw deployment pipeline is not enough because the customer must remain in control and the system must avoid silent or unsafe releases.

## Decision

Introduce a Deployment Agent as a release manager layer between customer approval and deterministic deployment workers.

## Rationale

The Deployment Agent increases trust by making each release explicit:

```text
what will go live
why it should go live
which risks exist
which checks passed
which warnings remain
what will be measured next
```

## Consequences

Positive:

```text
Better customer confidence
Clear release notes
Safer subdomain deployment
Better rollback readiness
Cleaner separation between agent reasoning and worker execution
```

Tradeoffs:

```text
More backend entities
More UI states
More preflight checks
Slightly slower deploy flow
```

## Non-goals

The Deployment Agent does not replace the Approval System.
The Deployment Agent does not generate content.
The Deployment Agent does not directly call Netlify without a worker.
The Deployment Agent does not guarantee SEO results.
