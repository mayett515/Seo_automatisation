import {
  AesGcmTokenCipher,
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
  S3ObjectStorageAdapter,
  type ObjectStoragePort,
  type SearchConsolePort,
  type SerpScoutPort,
  type SiteHostingPort,
  type VerificationPort
} from "@localseo/adapters";
import { parseAppEnv, type AppEnv } from "@localseo/config";
import { createDatabaseClient } from "@localseo/db";
import { UnrecoverableError, type Job } from "bullmq";
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
  handleOpportunityScoutJob,
  OpportunityScoutConfigurationError,
  OpportunityScoutEvidenceError,
  OpportunityScoutWorkflowError
} from "./handlers/opportunity-scout.js";
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

const env = parseAppEnv(process.env);
const sharedDbHandle = env.DATABASE_URL ? createDatabaseClient(env.DATABASE_URL) : undefined;
const sharedObjectStorage = createObjectStorageAdapter();
const sharedSiteHosting = createSiteHostingAdapter(env.NETLIFY_AUTH_TOKEN, sharedObjectStorage);
const sharedCrawler = createCrawlerAdapter(sharedObjectStorage);
const sharedReasoning = createReasoningAdapter(env);
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
  await sharedDbHandle?.close();
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

  if (job.queueName === "opportunity-scout" || job.name === "opportunity_scout") {
    return handleOpportunityScoutJob(job, sharedDbHandle, sharedReasoning, sharedObjectStorage, {
      reasoningTimeoutMs: env.AI_REASONING_TIMEOUT_MS
    });
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

  throw new Error(`Worker job is not implemented: ${job.queueName}:${job.name}`);
}

export { classifyOpportunitySignals, parseGscSyncJobData } from "./handlers/gsc-sync.js";
export { parseOpportunityScoutJobData } from "./handlers/opportunity-scout.js";
export { parseSerpScoutJobData } from "./handlers/serp-scout.js";
export { parseTechnicalAuditJobData } from "./handlers/technical-audit.js";
export { parseWebsiteImportJobData } from "./handlers/website-import.js";
export { parseReleaseVerificationJobData };

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
    error instanceof SerpScoutConfigurationError ||
    error instanceof SerpScoutEvidenceError ||
    error instanceof SerpScoutTerminalError ||
    error instanceof TechnicalAuditConfigurationError ||
    error instanceof TechnicalAuditEvidenceError ||
    error instanceof ReleaseVerificationConfigurationError ||
    error instanceof ReleaseVerificationEvidenceError ||
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

function createObjectStorageAdapter(): ObjectStoragePort {
  if (env.NODE_ENV === "production" && env.S3_BUCKET) {
    return new S3ObjectStorageAdapter({
      bucket: env.S3_BUCKET,
      region: env.AWS_REGION
    });
  }

  return new FileSystemObjectStorageAdapter(env.LOCAL_OBJECT_STORAGE_DIR);
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
