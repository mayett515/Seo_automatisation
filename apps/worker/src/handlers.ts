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
import { UnrecoverableError, type Job } from "bullmq";
import {
  handleMediaProcessingJob,
  MediaProcessingConfigurationError,
  MediaProcessingEvidenceError,
  parseMediaProcessingJobData
} from "./handlers/media-processing.js";
import {
  DeployConfigurationError,
  DeployEvidenceError,
  handleDeployJob,
  ManualReconciliationRequiredError,
  ProviderDeployTerminalStatusError,
  reconcilePendingDeployments
} from "./handlers/deploy.js";
import { handleGscSyncJob, isTerminalGscSyncFailure } from "./handlers/gsc-sync.js";
import {
  CustomerReportConfigurationError,
  CustomerReportEvidenceError,
  handleCustomerReportGenerationJob
} from "./handlers/customer-report.js";
import {
  CustomerReportHtmlConfigurationError,
  CustomerReportHtmlEvidenceError,
  handleCustomerReportHtmlRenderJob,
  parseCustomerReportHtmlRenderJobData
} from "./handlers/customer-report-html.js";
import {
  handleOpportunityScoutJob,
  OpportunityScoutConfigurationError,
  OpportunityScoutEvidenceError,
  OpportunityScoutWorkflowError
} from "./handlers/opportunity-scout.js";
import {
  handleOpportunityResearchJob,
  createOpportunityResearchProviderAttemptGuard,
  OpportunityResearchConfigurationError,
  OpportunityResearchEvidenceError,
  OpportunityResearchQaError,
  parseOpportunityResearchJobData
} from "./handlers/opportunity-research.js";
import {
  handlePageProposalJob,
  PageProposalConfigurationError,
  PageProposalEvidenceError,
  PageProposalWorkflowError
} from "./handlers/page-proposal.js";
import {
  handleSectionCopySuggestionJob,
  SectionCopySuggestionConfigurationError,
  SectionCopySuggestionEvidenceError,
  SectionCopySuggestionWorkflowError
} from "./handlers/section-copy-suggestion.js";
import {
  handleRollbackJob,
  reconcilePendingRollbacks,
  RollbackConfigurationError,
  RollbackEvidenceError,
  RollbackProviderFailedError
} from "./handlers/rollback.js";
import {
  handleReleaseVerificationJob,
  parseReleaseVerificationJobData,
  ReleaseVerificationConfigurationError,
  ReleaseVerificationEvidenceError
} from "./handlers/release-verification.js";
import {
  handleSerpScoutJob,
  SerpScoutConfigurationError,
  SerpScoutEvidenceError,
  SerpScoutTerminalError
} from "./handlers/serp-scout.js";
import {
  handleTechnicalAuditJob,
  TechnicalAuditConfigurationError,
  TechnicalAuditEvidenceError
} from "./handlers/technical-audit.js";
import {
  handleWebsiteImportJob,
  WebsiteImportConfigurationError,
  WebsiteImportEvidenceError
} from "./handlers/website-import.js";
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

export async function routeJob(job: Job): Promise<Record<string, unknown>> {
  if (job.queueName === "deploy" || job.name === "deploy") {
    return handleDeployJob(job, sharedDbHandle, sharedSiteHosting, sharedObjectStorage);
  }

  if (job.queueName === "rollback" || job.name === "rollback") {
    return handleRollbackJob(job, sharedDbHandle, sharedSiteHosting);
  }

  if (job.queueName === "website-import" || job.name === "website_import") {
    return handleWebsiteImportJob(job, sharedDbHandle, sharedCrawler);
  }

  if (job.queueName === "opportunity-research" || job.name === "opportunity_research") {
    return handleOpportunityResearchJob(job, sharedDbHandle, sharedOpportunityResearch, {
      heartbeatIntervalMs: env.OPPORTUNITY_RESEARCH_HEARTBEAT_MS
    });
  }

  if (job.queueName === "opportunity-scout" || job.name === "opportunity_scout") {
    return handleOpportunityScoutJob(job, sharedDbHandle, sharedReasoning, sharedObjectStorage, {
      reasoningTimeoutMs: env.AI_REASONING_TIMEOUT_MS
    });
  }

  if (job.name === "section_text_generation") {
    return handleSectionCopySuggestionJob(job, sharedDbHandle, sharedReasoning, sharedObjectStorage, {
      reasoningTimeoutMs: env.AI_REASONING_TIMEOUT_MS
    });
  }

  if (job.queueName === "page-generation" || job.name === "page_generation") {
    return handlePageProposalJob(job, sharedDbHandle, sharedReasoning, sharedObjectStorage, {
      reasoningTimeoutMs: env.AI_REASONING_TIMEOUT_MS
    });
  }

  if (job.queueName === "media-processing" || job.name === "media_processing") {
    return handleMediaProcessingJob(job, sharedDbHandle, sharedObjectStorage);
  }

  if (job.queueName === "serp-scout" || job.name === "serp_scout") {
    return handleSerpScoutJob(job, sharedDbHandle, sharedSerpScout);
  }

  if (job.queueName === "technical-audit" || job.name === "technical_audit") {
    return handleTechnicalAuditJob(job, sharedDbHandle, sharedCrawler);
  }

  if (job.queueName === "gsc-sync" || job.name === "gsc_sync") {
    return handleGscSyncJob(job, sharedDbHandle, env);
  }

  if (job.queueName === "release-verification" || job.name === "release_verification") {
    return handleReleaseVerificationJob(job, sharedDbHandle, {
      verification: sharedReleaseVerification,
      searchConsole: sharedSearchConsole,
      tokenCipher: sharedTokenCipher
    });
  }

  if (job.name === "customer_report_html_render") {
    return handleCustomerReportHtmlRenderJob(job, sharedDbHandle, sharedObjectStorage);
  }

  if (job.queueName === "report" || job.name === "customer_report_generation") {
    return handleCustomerReportGenerationJob(job, sharedDbHandle, sharedReasoning, sharedObjectStorage, {
      reasoningTimeoutMs: env.AI_REASONING_TIMEOUT_MS
    });
  }

  throw new Error(`Worker job is not implemented: ${job.queueName}:${job.name}`);
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
