import {
  AesGcmTokenCipher,
  DuckDuckGoHtmlSearchAdapter,
  FileSystemObjectStorageAdapter,
  GoogleSearchConsoleAdapter,
  HttpWebsiteCrawlerAdapter,
  HttpReleaseVerificationAdapter,
  MockReasoningAdapter,
  MockSerpScoutAdapter,
  NetlifySiteHostingAdapter,
  NotConfiguredReasoningAdapter,
  NotConfiguredSiteHostingAdapter,
  OpenCodeGoReasoningAdapter,
  PlaywrightBrowserRuntimeVerifier,
  type CrawlerPort,
  type AiReasoningPort,
  type MediaAssetCleanupStoragePort,
  type MediaAssetStoragePort,
  type ImmutableArtifactStoragePort,
  S3ObjectStorageAdapter,
  type ObjectStoragePort,
  type SearchConsolePort,
  type SerpScoutPort,
  type SiteHostingPort,
  type VerificationPort
} from "@localseo/adapters";
import {
  DirectDeepSeekOpportunityResearchModel,
  MastraOpportunityResearchAdapter,
  MockOpportunityResearchModel,
  NotConfiguredOpportunityResearchModel,
  createOpportunityResearchWorkflowRuntime,
  type OpportunityResearchModelPort,
  type OpportunityResearchPort,
  type OpportunityResearchWorkflowRuntime,
  type PublicWebSearchPort
} from "@localseo/ai";
import { parseAppEnv, type AppEnv } from "@localseo/config";
import { createDatabaseClient } from "@localseo/db";
import { queueJobNames, queueNames, secondaryJobLanes, type QueueName } from "@localseo/contracts";
import { UnrecoverableError, type Job } from "bullmq";
import {
  MediaProcessingConfigurationError,
  MediaProcessingEvidenceError,
  parseMediaProcessingJobData
} from "./handlers/media-processing.js";
import {
  DeployConfigurationError,
  DeployEvidenceError,
  ManualReconciliationRequiredError,
  ProviderDeployTerminalStatusError,
  reconcilePendingDeployments
} from "./handlers/deploy.js";
import { isTerminalGscSyncFailure } from "./handlers/gsc-sync.js";
import { CustomerReportConfigurationError, CustomerReportEvidenceError } from "./handlers/customer-report.js";
import {
  CustomerReportHtmlConfigurationError,
  CustomerReportHtmlEvidenceError,
  parseCustomerReportHtmlRenderJobData
} from "./handlers/customer-report-html.js";
import {
  OpportunityScoutConfigurationError,
  OpportunityScoutEvidenceError,
  OpportunityScoutWorkflowError
} from "./handlers/opportunity-scout.js";
import {
  createOpportunityResearchProviderAttemptGuard,
  OpportunityResearchConfigurationError,
  OpportunityResearchEvidenceError,
  OpportunityResearchQaError,
  parseOpportunityResearchJobData
} from "./handlers/opportunity-research.js";
import {
  PageProposalConfigurationError,
  PageProposalEvidenceError,
  PageProposalWorkflowError
} from "./handlers/page-proposal.js";
import {
  SectionCopySuggestionConfigurationError,
  SectionCopySuggestionEvidenceError,
  SectionCopySuggestionWorkflowError
} from "./handlers/section-copy-suggestion.js";
import {
  reconcilePendingRollbacks,
  RollbackConfigurationError,
  RollbackEvidenceError,
  RollbackProviderFailedError
} from "./handlers/rollback.js";
import {
  parseReleaseVerificationJobData,
  ReleaseVerificationConfigurationError,
  ReleaseVerificationEvidenceError
} from "./handlers/release-verification.js";
import { SerpScoutConfigurationError, SerpScoutEvidenceError, SerpScoutTerminalError } from "./handlers/serp-scout.js";
import { TechnicalAuditConfigurationError, TechnicalAuditEvidenceError } from "./handlers/technical-audit.js";
import { WebsiteImportConfigurationError, WebsiteImportEvidenceError } from "./handlers/website-import.js";
import { createHandlerRegistry } from "./handler-registry.js";
import {
  isFinalJobAttempt,
  markJobRunCompleted,
  markJobRunFailed,
  markJobRunRetrying,
  markJobRunRunning
} from "./job-run.js";
import {
  emptyWorkRecoveryScanResult,
  scanStaleWork,
  type WorkRecoveryQueues,
  type WorkRecoveryScanResult
} from "./work-recovery.js";
import {
  emptyMediaStorageCleanupResult,
  scanMediaStorageCleanup,
  type MediaStorageCleanupResult
} from "./media-storage-cleanup.js";
import { PersistedDuckDuckGoPublicWebSearch } from "./public-web-search.js";
import {
  emptyOpportunityResearchScheduleResult,
  scanDueOpportunityResearch,
  type OpportunityResearchScheduleResult
} from "./opportunity-research-scheduler.js";

const env = parseAppEnv(process.env);
const sharedDbHandle = env.DATABASE_URL ? createDatabaseClient(env.DATABASE_URL) : undefined;
const sharedMastraWorkflowRuntime = createOpportunityResearchWorkflowRuntime(env.MASTRA_WORKFLOW_DATABASE_URL);
const sharedObjectStorage = createObjectStorageAdapter();
const sharedSiteHosting = createSiteHostingAdapter(env.NETLIFY_AUTH_TOKEN, sharedObjectStorage);
const sharedCrawler = createCrawlerAdapter(sharedObjectStorage);
const sharedReasoning = createReasoningAdapter(env);
const sharedPublicWebSearch = createPublicWebSearchAdapter(sharedDbHandle?.db, env);
const sharedOpportunityResearch = createOpportunityResearchAdapter(
  env,
  sharedPublicWebSearch,
  sharedMastraWorkflowRuntime,
  sharedDbHandle?.db
);
const sharedSerpScout = createSerpScoutAdapter();
const sharedReleaseVerification = createReleaseVerificationAdapter(env);
const sharedSearchConsole = createSearchConsoleAdapter(env);
const sharedTokenCipher = env.GSC_TOKEN_ENCRYPTION_KEY
  ? new AesGcmTokenCipher(env.GSC_TOKEN_ENCRYPTION_KEY)
  : undefined;

// Built once, from the shared adapters above. `routeJob` reads this table and
// nothing else, so the lane list in `lane-handler-registration.ts` describes the
// dispatch that actually happens.
const handlerRegistry = createHandlerRegistry({
  dbHandle: sharedDbHandle,
  siteHosting: sharedSiteHosting,
  objectStorage: sharedObjectStorage,
  crawler: sharedCrawler,
  reasoning: sharedReasoning,
  opportunityResearch: sharedOpportunityResearch,
  serpScout: sharedSerpScout,
  releaseVerification: sharedReleaseVerification,
  searchConsole: sharedSearchConsole,
  tokenCipher: sharedTokenCipher,
  env,
  heartbeatIntervalMs: env.OPPORTUNITY_RESEARCH_HEARTBEAT_MS,
  reasoningTimeoutMs: env.AI_REASONING_TIMEOUT_MS
});

export async function handleJob(job: Job): Promise<Record<string, unknown>> {
  await markJobRunRunning(sharedDbHandle?.db, job);

  try {
    const result = await routeJob(job);
    await markJobRunCompleted(sharedDbHandle?.db, job);
    return result;
  } catch (error) {
    const terminalWorkerError = isTerminalWorkerError(error);

    if (isFinalJobAttempt(job) || terminalWorkerError) {
      await markJobRunFailed(sharedDbHandle?.db, job, error);
    } else {
      await markJobRunRetrying(sharedDbHandle?.db, job, error);
    }

    throw toWorkerRethrowError(error);
  }
}

export async function closeWorkerResources(): Promise<void> {
  await sharedMastraWorkflowRuntime?.close();
  await sharedDbHandle?.close();
}

export async function initializeWorkerResources(): Promise<void> {
  await sharedMastraWorkflowRuntime?.initialize();
}

export async function reconcileDeployments(): Promise<Record<string, unknown>> {
  if (!sharedDbHandle) {
    return {
      checked: 0,
      succeeded: 0,
      pending: 0,
      failed: 0
    };
  }

  return reconcilePendingDeployments({
    db: sharedDbHandle.db,
    siteHosting: sharedSiteHosting
  });
}

export async function reconcileRollbacks(): Promise<Record<string, unknown>> {
  if (!sharedDbHandle) {
    return {
      checked: 0,
      succeeded: 0,
      pending: 0,
      manualRequired: 0,
      staleNoop: 0
    };
  }

  return reconcilePendingRollbacks({
    db: sharedDbHandle.db,
    siteHosting: sharedSiteHosting
  });
}

export async function recoverStaleWork(queues: WorkRecoveryQueues): Promise<WorkRecoveryScanResult> {
  if (!sharedDbHandle) {
    return emptyWorkRecoveryScanResult();
  }

  return scanStaleWork({
    db: sharedDbHandle.db,
    queues,
    staleAfterMs: env.WORK_RECOVERY_STALE_AFTER_MS,
    maxRecoveryCount: env.WORK_RECOVERY_MAX_COUNT,
    batchSize: env.WORK_RECOVERY_BATCH_SIZE
  });
}

export async function scheduleOpportunityResearch(
  queue: WorkRecoveryQueues["opportunity-research"]
): Promise<OpportunityResearchScheduleResult> {
  if (!sharedDbHandle) return emptyOpportunityResearchScheduleResult();
  return scanDueOpportunityResearch({
    db: sharedDbHandle.db,
    queue,
    batchSize: env.WORK_RECOVERY_BATCH_SIZE
  });
}

export async function cleanMediaStorage(): Promise<MediaStorageCleanupResult> {
  if (!sharedDbHandle) {
    return emptyMediaStorageCleanupResult();
  }

  return scanMediaStorageCleanup({
    db: sharedDbHandle.db,
    storage: sharedObjectStorage,
    claimStaleAfterMs: env.MEDIA_CLEANUP_CLAIM_STALE_AFTER_MS,
    maxAttempts: env.MEDIA_CLEANUP_MAX_ATTEMPTS,
    batchSize: env.MEDIA_CLEANUP_BATCH_SIZE
  });
}

// Both routing failures carry their dynamic parts as fields rather than in the
// message, so the message stays stable for grouping and a caller reads the data
// instead of parsing a string. Neither can be fixed by running the same job
// again, which is why both are terminal.

/** No lane owns this queue name or job name. */
export class UnknownWorkerJobError extends Error {
  readonly code = "UNKNOWN_WORKER_JOB";
  readonly queueName: string;
  readonly jobName: string;

  constructor(queueName: string, jobName: string) {
    super("Worker job resolves to no registered queue lane");
    this.name = "UnknownWorkerJobError";
    this.queueName = queueName;
    this.jobName = jobName;
  }
}

/** The lane is registered in `queueNames` and its registry entry is null. */
export class LaneHandlerMissingError extends Error {
  readonly code = "LANE_HANDLER_MISSING";
  readonly lane: QueueName;
  readonly jobName: string;

  constructor(lane: QueueName, jobName: string) {
    super("Registered queue has no handler");
    this.name = "LaneHandlerMissingError";
    this.lane = lane;
    this.jobName = jobName;
  }
}

// Job name -> lane, for jobs that arrive without a lane-shaped queue name. Both
// the canonical job name of every lane and the secondary job names resolve here.
const laneByJobName: Readonly<Record<string, QueueName>> = {
  ...Object.fromEntries(queueNames.map((lane) => [queueJobNames[lane], lane] as const)),
  ...secondaryJobLanes
};

function isQueueName(value: string): value is QueueName {
  return (queueNames as readonly string[]).includes(value);
}

/**
 * Resolve the lane a job belongs to. The queue name wins when it is a
 * registered lane; otherwise the job name is looked up. This proves only which
 * lane owns the job, never that the lane can run it.
 */
function resolveLane(job: Pick<Job, "queueName" | "name">): QueueName | undefined {
  if (isQueueName(job.queueName)) {
    return job.queueName;
  }
  return laneByJobName[job.name];
}

export async function routeJob(job: Job): Promise<Record<string, unknown>> {
  const lane = resolveLane(job);

  if (lane === undefined) {
    throw new UnknownWorkerJobError(job.queueName, job.name);
  }

  const entry = handlerRegistry[lane];

  if (entry === null) {
    throw new LaneHandlerMissingError(lane, job.name);
  }

  return (entry.secondaries[job.name] ?? entry.primary).run(job);
}

export { classifyOpportunitySignals, parseGscSyncJobData } from "./handlers/gsc-sync.js";
export { parseOpportunityScoutJobData } from "./handlers/opportunity-scout.js";
export { parseOpportunityResearchJobData };
export { parsePageProposalJobData } from "./handlers/page-proposal.js";
export { parseSectionCopySuggestionJobData } from "./handlers/section-copy-suggestion.js";
export { parseMediaProcessingJobData };
export { parseSerpScoutJobData } from "./handlers/serp-scout.js";
export { parseTechnicalAuditJobData } from "./handlers/technical-audit.js";
export { parseWebsiteImportJobData } from "./handlers/website-import.js";
export { parseReleaseVerificationJobData };
export { parseCustomerReportGenerationJobData } from "./handlers/customer-report.js";
export { parseCustomerReportHtmlRenderJobData };

export function isTerminalWorkerError(error: unknown): boolean {
  return (
    // Routing failures: the queue/job pair or the null registry entry is the
    // same on every attempt, so a retry can only repeat the failure.
    error instanceof UnknownWorkerJobError ||
    error instanceof LaneHandlerMissingError ||
    error instanceof DeployConfigurationError ||
    error instanceof DeployEvidenceError ||
    error instanceof ProviderDeployTerminalStatusError ||
    error instanceof RollbackConfigurationError ||
    error instanceof RollbackEvidenceError ||
    error instanceof RollbackProviderFailedError ||
    error instanceof ManualReconciliationRequiredError ||
    error instanceof WebsiteImportConfigurationError ||
    error instanceof WebsiteImportEvidenceError ||
    error instanceof OpportunityScoutConfigurationError ||
    error instanceof OpportunityScoutEvidenceError ||
    error instanceof OpportunityScoutWorkflowError ||
    error instanceof OpportunityResearchConfigurationError ||
    error instanceof OpportunityResearchEvidenceError ||
    error instanceof OpportunityResearchQaError ||
    error instanceof PageProposalConfigurationError ||
    error instanceof PageProposalEvidenceError ||
    error instanceof PageProposalWorkflowError ||
    error instanceof SectionCopySuggestionConfigurationError ||
    error instanceof SectionCopySuggestionEvidenceError ||
    error instanceof SectionCopySuggestionWorkflowError ||
    error instanceof MediaProcessingConfigurationError ||
    error instanceof MediaProcessingEvidenceError ||
    error instanceof SerpScoutConfigurationError ||
    error instanceof SerpScoutEvidenceError ||
    error instanceof SerpScoutTerminalError ||
    error instanceof TechnicalAuditConfigurationError ||
    error instanceof TechnicalAuditEvidenceError ||
    error instanceof ReleaseVerificationConfigurationError ||
    error instanceof ReleaseVerificationEvidenceError ||
    error instanceof CustomerReportConfigurationError ||
    error instanceof CustomerReportEvidenceError ||
    error instanceof CustomerReportHtmlConfigurationError ||
    error instanceof CustomerReportHtmlEvidenceError ||
    isTerminalGscSyncFailure(error)
  );
}

export function toWorkerRethrowError(error: unknown): unknown {
  if (!isTerminalWorkerError(error)) {
    return error;
  }

  return new UnrecoverableError(normalizeWorkerErrorMessage(error));
}

function normalizeWorkerErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "terminal_worker_failure";
}

function createSiteHostingAdapter(
  netlifyAuthToken: string | undefined,
  objectStorage: ObjectStoragePort
): SiteHostingPort {
  return netlifyAuthToken
    ? new NetlifySiteHostingAdapter({
        authToken: netlifyAuthToken,
        objectStorage
      })
    : new NotConfiguredSiteHostingAdapter();
}

export function createObjectStorageAdapter(
  input: Pick<AppEnv, "NODE_ENV" | "S3_BUCKET" | "AWS_REGION" | "LOCAL_OBJECT_STORAGE_DIR"> = env
): ObjectStoragePort & MediaAssetStoragePort & MediaAssetCleanupStoragePort & ImmutableArtifactStoragePort {
  if (input.NODE_ENV === "production") {
    if (!input.S3_BUCKET) {
      throw new Error("Production worker storage requires S3_BUCKET.");
    }

    return new S3ObjectStorageAdapter({
      bucket: input.S3_BUCKET,
      region: input.AWS_REGION
    });
  }

  return new FileSystemObjectStorageAdapter(input.LOCAL_OBJECT_STORAGE_DIR);
}

function createCrawlerAdapter(objectStorage: ObjectStoragePort): CrawlerPort {
  return new HttpWebsiteCrawlerAdapter(objectStorage);
}

export function createReasoningAdapter(
  input: Pick<
    AppEnv,
    | "AI_REASONING_PROVIDER"
    | "AI_REASONING_MODEL"
    | "AI_REASONING_OPENCODE_GO_API_KEY"
    | "AI_REASONING_OPENCODE_GO_ENDPOINT"
  >
): AiReasoningPort {
  switch (input.AI_REASONING_PROVIDER) {
    case "mock":
      return new MockReasoningAdapter();
    case "opencode_go":
      if (!input.AI_REASONING_OPENCODE_GO_API_KEY) {
        return new NotConfiguredReasoningAdapter("AI_REASONING_OPENCODE_GO_API_KEY is required.");
      }
      return new OpenCodeGoReasoningAdapter({
        apiKey: input.AI_REASONING_OPENCODE_GO_API_KEY,
        model: input.AI_REASONING_MODEL,
        endpoint: input.AI_REASONING_OPENCODE_GO_ENDPOINT
      });
  }
}

function createSerpScoutAdapter(): SerpScoutPort {
  // ADR 0015: paid SERP APIs are rejected for MVP. Fabricated snapshots stay
  // labeled provider "mock" and cannot satisfy customer-safe ranking proof.
  return new MockSerpScoutAdapter();
}

export function createOpportunityResearchAdapter(
  input: Pick<
    AppEnv,
    | "OPPORTUNITY_RESEARCH_PROVIDER"
    | "OPPORTUNITY_RESEARCH_MODEL"
    | "DEEPSEEK_API_KEY"
    | "DEEPSEEK_BASE_URL"
    | "DEEPSEEK_TIMEOUT_MS"
    | "DEEPSEEK_MAX_ATTEMPTS"
    | "DEEPSEEK_MAX_RESPONSE_BYTES"
  >,
  publicWebSearch: PublicWebSearchPort,
  workflowRuntime?: OpportunityResearchWorkflowRuntime,
  db?: ReturnType<typeof createDatabaseClient>["db"]
): OpportunityResearchPort {
  let model: OpportunityResearchModelPort;
  switch (input.OPPORTUNITY_RESEARCH_PROVIDER) {
    case "mock":
      model = new MockOpportunityResearchModel();
      break;
    case "deepseek":
      model = input.DEEPSEEK_API_KEY
        ? new DirectDeepSeekOpportunityResearchModel({
            apiKey: input.DEEPSEEK_API_KEY,
            model: input.OPPORTUNITY_RESEARCH_MODEL,
            baseUrl: input.DEEPSEEK_BASE_URL,
            timeoutMs: input.DEEPSEEK_TIMEOUT_MS,
            maxAttempts: input.DEEPSEEK_MAX_ATTEMPTS,
            maxResponseBytes: input.DEEPSEEK_MAX_RESPONSE_BYTES,
            beforeProviderAttempt: db ? createOpportunityResearchProviderAttemptGuard(db) : undefined
          })
        : new NotConfiguredOpportunityResearchModel("DEEPSEEK_API_KEY is required for Opportunity Research.");
      break;
  }
  return (
    workflowRuntime?.createAdapter(model, publicWebSearch) ??
    new MastraOpportunityResearchAdapter(model, publicWebSearch)
  );
}

function createPublicWebSearchAdapter(
  db: ReturnType<typeof createDatabaseClient>["db"] | undefined,
  input: Pick<
    AppEnv,
    "PUBLIC_WEB_SEARCH_ENABLED" | "PUBLIC_WEB_SEARCH_TIMEOUT_MS" | "PUBLIC_WEB_SEARCH_MAX_RESPONSE_BYTES"
  >
): PublicWebSearchPort {
  if (!db) {
    return {
      search() {
        return Promise.reject(new OpportunityResearchConfigurationError("Public web search requires DATABASE_URL."));
      }
    };
  }
  return new PersistedDuckDuckGoPublicWebSearch(
    db,
    new DuckDuckGoHtmlSearchAdapter({
      timeoutMs: input.PUBLIC_WEB_SEARCH_TIMEOUT_MS,
      maxResponseBytes: input.PUBLIC_WEB_SEARCH_MAX_RESPONSE_BYTES
    }),
    input.PUBLIC_WEB_SEARCH_ENABLED
  );
}

function createReleaseVerificationAdapter(
  input: Pick<
    AppEnv,
    | "RELEASE_BROWSER_VERIFICATION_TIMEOUT_MS"
    | "RELEASE_BROWSER_VERIFICATION_ENABLED"
    | "RELEASE_BROWSER_VERIFICATION_EXECUTABLE_PATH"
  >
): VerificationPort {
  return new HttpReleaseVerificationAdapter({
    browserCheckTimeoutMs: input.RELEASE_BROWSER_VERIFICATION_TIMEOUT_MS,
    browserRuntime: input.RELEASE_BROWSER_VERIFICATION_ENABLED
      ? new PlaywrightBrowserRuntimeVerifier({
          executablePath: input.RELEASE_BROWSER_VERIFICATION_EXECUTABLE_PATH
        })
      : undefined
  });
}

function createSearchConsoleAdapter(
  input: Pick<
    AppEnv,
    | "GOOGLE_OAUTH_CLIENT_ID"
    | "GOOGLE_OAUTH_CLIENT_SECRET"
    | "GOOGLE_OAUTH_REDIRECT_URI"
    | "API_PUBLIC_URL"
    | "GSC_OAUTH_STATE_SECRET"
    | "BETTER_AUTH_SECRET"
  >
): SearchConsolePort | undefined {
  const redirectUri = input.GOOGLE_OAUTH_REDIRECT_URI ?? `${input.API_PUBLIC_URL}/gsc/callback`;
  const stateSecret = input.GSC_OAUTH_STATE_SECRET ?? input.BETTER_AUTH_SECRET;

  if (!input.GOOGLE_OAUTH_CLIENT_ID || !input.GOOGLE_OAUTH_CLIENT_SECRET || !stateSecret) {
    return undefined;
  }

  return new GoogleSearchConsoleAdapter({
    clientId: input.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: input.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri,
    stateSecret
  });
}
