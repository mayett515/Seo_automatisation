---
title: "Deployment Agent"
domain: "product"
module: "deployment_agent"
status: "extension"
version: "1.0.0"
priority: "critical"
---

# Deployment Agent

The Deployment Agent is a controlled release manager for customer-approved SEO changes.
It exists because the product deploys real customer assets: main websites, subdomains, landing pages, templates, tracking scripts, sitemap changes, and Google Search Console monitoring.

## Product role

The agent sits between customer approval and technical deployment.
It makes the customer feel safe and in control.
It prevents the platform from feeling like a black-box auto-deployer.

```text
AI suggests.
Customer approves.
Deployment Agent checks and explains.
Deploy Worker executes.
Verification Worker proves it is live and healthy.
Report Agent explains impact later.
```

## What it is not

```text
It is not a free-running autonomous deployer.
It is not allowed to bypass approval.
It is not the system that writes page content.
It is not the Netlify API wrapper itself.
```

## Customer-facing concept

The customer sees a release card before anything goes live:

```text
Deployment ready

New pages:
- dachau.customer.de/flachdachsanierung
- heimhausen.customer.de/dachreparatur
- petershausen.customer.de/spengler

Changes:
- Premium hero template
- Stronger local FAQ
- WhatsApp CTA moved higher
- Local gallery block added
- Sitemap entry prepared
- Tracking events active

Risk:
Dachau is a hard market. First signals may take 30–60 days.
Heimhausen is easier. First signals may appear earlier.

Recommendation:
Deploy Heimhausen now.
Deploy Dachau as a strategic attack with monitoring.

Actions:
[Approve Deploy] [Preview Again] [Hold Dachau] [Add Note]
```

## Responsibilities

1. Verify that a concrete page version has customer approval.
2. Verify that customer notes are resolved, accepted, or explicitly ignored.
3. Verify component completeness before release.
4. Verify meta title, description, canonical, robots, schema, CTAs, images, and tracking hooks.
5. Verify subdomain and route availability.
6. Verify staging is noindex and live is indexable when intended.
7. Produce a release plan and release notes.
8. Trigger deterministic deploy workers.
9. Run post-deploy verification.
10. Prepare rollback if a deployment is unhealthy.

## Product value

The Deployment Agent turns deployment into a trust moment.
The customer does not just click “publish”.
The customer sees what will happen, why it matters, what risk exists, and what will be measured next.

## Integration with the game UX

In the gamified SEO map, each “attack” or “spread” becomes a release mission.
The Deployment Agent is the checkpoint before a mission goes live.

```text
Dachau attack selected
→ customer approves preview
→ Deployment Agent checks release
→ deploy goes live
→ map state changes to “attack running”
→ Search Console / analytics monitoring begins
→ weekly report says what happened
```

## Trust language

Use professional, calm language:

```text
This release is ready.
I checked the page version, tracking, sitemap, route, and monitoring setup.
There are two warnings, but no blockers.
You can deploy now or hold Dachau for another revision.
```

Do not use hype-only language:

```text
Everything is perfect.
This will definitely rank.
Deploying now will guarantee leads.
```
