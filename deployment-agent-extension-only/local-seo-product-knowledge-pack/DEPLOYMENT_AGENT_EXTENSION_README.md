---
title: "Deployment Agent Extension"
package_type: "additive_extension"
target_pack: "local-seo-product-knowledge-pack"
version: "1.0.0"
contains_only: "deployment_agent"
import_mode: "unzip into the same parent folder as the existing product knowledge pack"
---

# Deployment Agent Extension

This ZIP is an additive extension for the existing `local-seo-product-knowledge-pack`.
It intentionally contains only Deployment Agent knowledge and does not overwrite the original product pack indexes.

## Import behavior

Unzip this archive into the same location as the existing product pack. It will add new files under:

```text
local-seo-product-knowledge-pack/
  product/13-deployment-agent.md
  architecture/10-deployment-agent-architecture.md
  backend/04-deployment-agent-contracts.md
  frontend/04-deployment-agent-customer-ux.md
  prompts/deployment-agent-prompt.md
  decisions/ADR-006-deployment-agent-release-manager.md
  diagrams/21-deployment-agent-release-flow.mmd
  diagrams/22-deployment-agent-state-machine.mmd
  diagrams/23-post-deploy-verification-flow.mmd
  diagrams/24-deployment-agent-sequence.mmd
  data/deployment-agent-manifest.json
```

## Read order for an AI

1. `product/13-deployment-agent.md`
2. `architecture/10-deployment-agent-architecture.md`
3. `backend/04-deployment-agent-contracts.md`
4. `frontend/04-deployment-agent-customer-ux.md`
5. `prompts/deployment-agent-prompt.md`
6. `decisions/ADR-006-deployment-agent-release-manager.md`
7. `diagrams/*.mmd`
8. `data/deployment-agent-manifest.json`

## Core idea

The Deployment Agent is the release manager of the Local SEO machine.
It does not replace customer control.
It checks approved changes, explains risk, creates a release plan, triggers deterministic workers, verifies the live result, prepares rollback, and writes understandable release notes.
