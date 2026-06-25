---
title: "Deployment Agent Customer UX"
domain: "frontend"
module: "deployment_agent"
version: "1.0.0"
stack: ["React", "TypeScript", "TanStack Router", "TanStack Query", "TanStack Form", "TanStack Table"]
---

# Deployment Agent Customer UX

The Deployment Agent UI makes publishing feel controlled, safe, and exciting.
The customer sees what is about to go live and can decide what to deploy, hold, or revise.

## Route placement

```text
/projects/:projectId/releases
/projects/:projectId/releases/:releasePlanId
/projects/:projectId/releases/:releasePlanId/checks
/projects/:projectId/releases/:releasePlanId/notes
/projects/:projectId/releases/:releasePlanId/rollback
```

## Main screens

```text
Release Queue
Shows all ready, blocked, deploying, live, and rolled-back releases.

Release Detail
Shows release summary, pages, subdomains, risk, warnings, blockers, and actions.

Preflight Checks
Shows checks grouped as passed, warning, blocker, skipped.

Release Notes Preview
Shows customer-friendly summary before deploy and after deploy.

Rollback Panel
Only visible when rollback exists or is recommended.
```

## Customer control actions

```text
[Approve Deploy]
[Preview Again]
[Hold Selected Pages]
[Add Note]
[Regenerate Release Plan]
[Deploy Easier Orte First]
[Prepare Rollback]
[Rollback]
```

## UX copy examples

```text
Deployment ready
I checked 14 release items. There are no blockers and 2 warnings.
Dachau is a harder market, so the first ranking impact may take longer.
Heimhausen is a quicker opportunity and should show signals faster.
```

```text
Blocked release
This release should not go live yet.
The Dachau page is approved, but one required customer note is still unresolved and the target route conflicts with an existing live page.
```

```text
Live and healthy
The release is live. All checked URLs return 200, the sitemap was updated, and tracking is active.
Monitoring starts now.
```

## TanStack usage

```text
TanStack Router
- Release routes and nested release detail screens.

TanStack Query
- Poll release status, preflight checks, deploy status, verification status.

TanStack Form
- Customer note, deploy approval, hold-page reasons, rollback confirmation.

TanStack Table
- Release items, checks, live URLs, warnings, blockers.
```

## Release detail layout

```text
Header:
- Release name
- Status
- Risk level
- Primary action

Left:
- Pages/subdomains in this release
- What changed
- Strategy context: quick win / boss-level / spread route

Right:
- Deployment Agent recommendation
- Blockers
- Warnings
- Customer actions

Bottom:
- Preflight timeline
- Deployment timeline
- Verification timeline
```

## Emotional tone

The UI should feel like a mission-control release gate.
It should be confident but honest.
It should never say that rankings are guaranteed.
