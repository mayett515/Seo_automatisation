import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { secondaryJobNames } from "@localseo/contracts";

import { createHandlerRegistry, type HandlerRegistryContext } from "./handler-registry.js";
import { handleCustomerReportGenerationJob } from "./handlers/customer-report.js";
import { handleCustomerReportHtmlRenderJob } from "./handlers/customer-report-html.js";
import { handleDeployJob } from "./handlers/deploy.js";
import { handleGscSyncJob } from "./handlers/gsc-sync.js";
import { handleMediaProcessingJob } from "./handlers/media-processing.js";
import { handleOpportunityResearchJob } from "./handlers/opportunity-research.js";
import { handleOpportunityScoutJob } from "./handlers/opportunity-scout.js";
import { handlePageProposalJob } from "./handlers/page-proposal.js";
import { handleReleaseVerificationJob } from "./handlers/release-verification.js";
import { handleRollbackJob } from "./handlers/rollback.js";
import { handleSectionCopySuggestionJob } from "./handlers/section-copy-suggestion.js";
import { handleSerpScoutJob } from "./handlers/serp-scout.js";
import { handleTechnicalAuditJob } from "./handlers/technical-audit.js";
import { handleWebsiteImportJob } from "./handlers/website-import.js";
import { executableLaneNames } from "./lane-executability.js";

// The registry only records adapters; nothing here calls a handler, so a stub
// context is enough to observe which handler each lane is bound to.
const stub = undefined as unknown as never;

function context(): HandlerRegistryContext {
  return {
    dbHandle: undefined,
    siteHosting: stub,
    objectStorage: stub,
    crawler: stub,
    reasoning: stub,
    opportunityResearch: stub,
    serpScout: stub,
    releaseVerification: stub,
    searchConsole: undefined,
    tokenCipher: undefined,
    env: stub,
    heartbeatIntervalMs: 1_000,
    reasoningTimeoutMs: 2_000
  };
}

const expectedPrimaries = {
  "website-import": handleWebsiteImportJob,
  "opportunity-scout": handleOpportunityScoutJob,
  "opportunity-research": handleOpportunityResearchJob,
  "serp-scout": handleSerpScoutJob,
  "technical-audit": handleTechnicalAuditJob,
  "page-generation": handlePageProposalJob,
  "media-processing": handleMediaProcessingJob,
  deploy: handleDeployJob,
  rollback: handleRollbackJob,
  "release-verification": handleReleaseVerificationJob,
  "gsc-sync": handleGscSyncJob,
  report: handleCustomerReportGenerationJob
} as const satisfies Record<(typeof executableLaneNames)[number], unknown>;

const unhandledLanes = ["pre-audit", "local-analysis", "seo-qa", "analytics", "notifications"] as const;

void describe("createHandlerRegistry", () => {
  void it("binds every executable lane to its own handler", () => {
    const registry = createHandlerRegistry(context());

    for (const lane of executableLaneNames) {
      assert.equal(registry[lane].primary.handler, expectedPrimaries[lane], `${lane} is bound to the wrong handler`);
    }
  });

  void it("binds the secondary job names that share a lane with a primary", () => {
    const registry = createHandlerRegistry(context());

    assert.equal(
      registry["page-generation"].secondaries[secondaryJobNames.pageGeneration]?.handler,
      handleSectionCopySuggestionJob
    );
    assert.equal(
      registry.report.secondaries[secondaryJobNames.customerReportHtmlRender]?.handler,
      handleCustomerReportHtmlRenderJob
    );
  });

  void it("carries no secondary bindings on lanes that have none", () => {
    const registry = createHandlerRegistry(context());

    for (const lane of executableLaneNames) {
      if (lane === "page-generation" || lane === "report") continue;
      assert.deepEqual(Object.keys(registry[lane].secondaries), [], `${lane} has an unexpected secondary binding`);
    }
  });

  void it("records null for every lane with no registered handler", () => {
    const registry = createHandlerRegistry(context());

    for (const lane of unhandledLanes) {
      assert.equal(registry[lane], null, `${lane} unexpectedly has a registry entry`);
    }
  });

  void it("covers every registered queue and nothing else", () => {
    const registry = createHandlerRegistry(context());

    assert.equal(Object.keys(registry).length, executableLaneNames.length + unhandledLanes.length);
    assert.equal(Object.keys(registry).length, 17);
  });
});
