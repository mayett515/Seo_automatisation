// The dispatch table. This module is the mechanism, not a description of one:
// `routeJob` indexes this registry and invokes the binding it finds, so a lane
// that is absent here cannot run, and a lane that is present here runs the
// handler recorded next to it.
//
// It must stay free of module-scope side effects, which is why it imports the
// handler functions and never `handlers.ts` (that module builds adapters at
// import time). The shared adapters arrive as a context argument instead.

import { secondaryJobNames } from "@localseo/contracts";
import type { Job } from "bullmq";

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
import type { LaneWithRegisteredHandler, LaneWithoutRegisteredHandler } from "./lane-handler-registration.js";

/**
 * One handler plus the arguments it was bound with. `handlerIdentity` is what a
 * test compares; `run` is what the dispatcher calls. Both come out of `bind`,
 * from the same parameter, so the recorded identity and the invoked function
 * cannot drift apart.
 */
export type LaneBinding = {
  /**
   * The bound handler, exposed for identity comparison only. It is typed
   * `unknown` so it accepts a handler of any arity without a cast and cannot be
   * invoked through this field: calling it here would run a handler without the
   * dependencies it was bound with. `run` is the only callable member.
   */
  readonly handlerIdentity: unknown;
  readonly run: (job: Job) => Promise<Record<string, unknown>>;
};

// Both members come out of the same `handler` parameter with no cast between
// them, so the identity a test compares is the function `run` calls.
function bind<A extends readonly unknown[]>(
  handler: (job: Job, ...rest: A) => Promise<Record<string, unknown>>,
  ...rest: A
): LaneBinding {
  return { handlerIdentity: handler, run: (job) => handler(job, ...rest) };
}

/**
 * A lane's dispatch entry: the handler for its canonical job, plus the handlers
 * for any extra job names that share the same queue, keyed by job name.
 */
export type LaneRegistryEntry = {
  readonly primary: LaneBinding;
  readonly secondaries: Readonly<Record<string, LaneBinding>>;
};

/**
 * The registry shape is derived from `lanesWithRegisteredHandler`, so a lane listed
 * there without an entry, an entry on a lane not listed there, or a missing key
 * is a compile error rather than a runtime surprise.
 */
export type HandlerRegistry = { [K in LaneWithRegisteredHandler]: LaneRegistryEntry } & {
  [K in LaneWithoutRegisteredHandler]: null;
};

/** The shared adapters and settings the bound handlers were already given. */
export type HandlerRegistryContext = {
  readonly dbHandle: Parameters<typeof handleDeployJob>[1];
  readonly siteHosting: Parameters<typeof handleRollbackJob>[2];
  readonly objectStorage: Parameters<typeof handleDeployJob>[3] &
    Parameters<typeof handleMediaProcessingJob>[2] &
    Parameters<typeof handleCustomerReportHtmlRenderJob>[2];
  readonly crawler: Parameters<typeof handleWebsiteImportJob>[2];
  readonly reasoning: Parameters<typeof handlePageProposalJob>[2];
  readonly opportunityResearch: Parameters<typeof handleOpportunityResearchJob>[2];
  readonly serpScout: Parameters<typeof handleSerpScoutJob>[2];
  readonly releaseVerification: Parameters<typeof handleReleaseVerificationJob>[2]["verification"];
  readonly searchConsole: Parameters<typeof handleReleaseVerificationJob>[2]["searchConsole"];
  readonly tokenCipher: Parameters<typeof handleReleaseVerificationJob>[2]["tokenCipher"];
  readonly env: Parameters<typeof handleGscSyncJob>[2];
  readonly heartbeatIntervalMs: NonNullable<Parameters<typeof handleOpportunityResearchJob>[3]>["heartbeatIntervalMs"];
  readonly reasoningTimeoutMs: NonNullable<Parameters<typeof handlePageProposalJob>[4]>["reasoningTimeoutMs"];
};

const noSecondaries: Readonly<Record<string, LaneBinding>> = {};

export function createHandlerRegistry(ctx: HandlerRegistryContext): HandlerRegistry {
  const reasoningOptions = { reasoningTimeoutMs: ctx.reasoningTimeoutMs };

  return {
    "website-import": {
      primary: bind(handleWebsiteImportJob, ctx.dbHandle, ctx.crawler),
      secondaries: noSecondaries
    },
    "opportunity-scout": {
      primary: bind(handleOpportunityScoutJob, ctx.dbHandle, ctx.reasoning, ctx.objectStorage, reasoningOptions),
      secondaries: noSecondaries
    },
    "opportunity-research": {
      primary: bind(handleOpportunityResearchJob, ctx.dbHandle, ctx.opportunityResearch, {
        heartbeatIntervalMs: ctx.heartbeatIntervalMs
      }),
      secondaries: noSecondaries
    },
    "serp-scout": {
      primary: bind(handleSerpScoutJob, ctx.dbHandle, ctx.serpScout),
      secondaries: noSecondaries
    },
    "technical-audit": {
      primary: bind(handleTechnicalAuditJob, ctx.dbHandle, ctx.crawler),
      secondaries: noSecondaries
    },
    "page-generation": {
      primary: bind(handlePageProposalJob, ctx.dbHandle, ctx.reasoning, ctx.objectStorage, reasoningOptions),
      secondaries: {
        [secondaryJobNames.pageGeneration]: bind(
          handleSectionCopySuggestionJob,
          ctx.dbHandle,
          ctx.reasoning,
          ctx.objectStorage,
          reasoningOptions
        )
      }
    },
    "media-processing": {
      primary: bind(handleMediaProcessingJob, ctx.dbHandle, ctx.objectStorage),
      secondaries: noSecondaries
    },
    deploy: {
      primary: bind(handleDeployJob, ctx.dbHandle, ctx.siteHosting, ctx.objectStorage),
      secondaries: noSecondaries
    },
    rollback: {
      primary: bind(handleRollbackJob, ctx.dbHandle, ctx.siteHosting),
      secondaries: noSecondaries
    },
    "release-verification": {
      primary: bind(handleReleaseVerificationJob, ctx.dbHandle, {
        verification: ctx.releaseVerification,
        searchConsole: ctx.searchConsole,
        tokenCipher: ctx.tokenCipher
      }),
      secondaries: noSecondaries
    },
    "gsc-sync": {
      primary: bind(handleGscSyncJob, ctx.dbHandle, ctx.env),
      secondaries: noSecondaries
    },
    report: {
      primary: bind(
        handleCustomerReportGenerationJob,
        ctx.dbHandle,
        ctx.reasoning,
        ctx.objectStorage,
        reasoningOptions
      ),
      secondaries: {
        [secondaryJobNames.customerReportHtmlRender]: bind(
          handleCustomerReportHtmlRenderJob,
          ctx.dbHandle,
          ctx.objectStorage
        )
      }
    },
    "pre-audit": null,
    "local-analysis": null,
    "seo-qa": null,
    analytics: null,
    notifications: null
  };
}
