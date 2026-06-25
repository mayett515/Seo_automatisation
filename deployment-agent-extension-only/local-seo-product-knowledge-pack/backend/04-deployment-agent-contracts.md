---
title: "Deployment Agent Backend Contracts"
domain: "backend"
module: "deployment_agent"
version: "1.0.0"
stack: ["NestJS", "Postgres", "Redis Queue", "Netlify", "GSC"]
---

# Deployment Agent Backend Contracts

This file defines the backend entities, job contracts, and API endpoints for the Deployment Agent.

## Entities

```text
release_plans
- id
- project_id
- created_by_agent_id
- status: draft / ready / ready_with_warnings / blocked / approved_for_deploy / deploying / live / failed / rolled_back
- summary
- risk_level: low / medium / high
- blocker_count
- warning_count
- created_at
- approved_at
- deployed_at

release_plan_items
- id
- release_plan_id
- page_version_id
- target_url
- target_subdomain
- action: create / update / redirect / noindex / remove
- status

release_checks
- id
- release_plan_id
- scope: page / project / domain / sitemap / tracking / gsc
- check_key
- severity: info / warning / blocker
- result: passed / failed / skipped
- message
- evidence_json

release_notes
- id
- release_plan_id
- customer_summary
- technical_summary
- risks
- next_monitoring_window

rollback_points
- id
- project_id
- release_plan_id
- previous_deploy_id
- previous_sitemap_hash
- previous_routes_json
- created_at
```

## Preflight check list

```text
approval_check
notes_resolution_check
component_integrity_check
asset_integrity_check
seo_metadata_check
canonical_robots_check
schema_check
route_conflict_check
subdomain_dns_check
sitemap_readiness_check
tracking_readiness_check
staging_noindex_check
```

## Job contracts

```text
job: deployment_agent.preflight
input: { projectId, pageVersionIds[] }
output: { releasePlanId, status, blockerCount, warningCount }

job: deployment_agent.create_release_notes
input: { releasePlanId }
output: { releaseNotesId }

job: deploy_worker.execute_release
input: { releasePlanId }
output: { deploymentId, liveUrls[] }

job: verification_worker.verify_release
input: { releasePlanId, deploymentId }
output: { verificationStatus, checks[] }

job: rollback_worker.prepare
input: { releasePlanId }
output: { rollbackPointId }

job: rollback_worker.execute
input: { rollbackPointId }
output: { rollbackStatus }
```

## API endpoints

```text
POST   /projects/:projectId/releases/plan
GET    /projects/:projectId/releases
GET    /releases/:releasePlanId
POST   /releases/:releasePlanId/preflight
POST   /releases/:releasePlanId/approve-deploy
POST   /releases/:releasePlanId/deploy
GET    /releases/:releasePlanId/checks
GET    /releases/:releasePlanId/notes
POST   /releases/:releasePlanId/rollback/prepare
POST   /releases/:releasePlanId/rollback/execute
```

## Failure rules

```text
No approved version → BLOCKED
Unresolved required customer note → BLOCKED
Target route already used by another live page → BLOCKED
Live page accidentally set to noindex → BLOCKED
Staging page indexable → BLOCKED
Tracking missing → WARNING unless tracking is contractually required
GSC not connected → WARNING, not blocker
Sitemap submit failed → WARNING with retry job
Netlify build failed → FAILED with error evidence
Post-deploy HTTP error → ROLLBACK_RECOMMENDED
```

## Safety rule

Never mark a release as successful only because the Netlify deploy succeeded.
A successful release requires post-deploy verification.
