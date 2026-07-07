import {
  isProviderRequestError,
  type SearchConsolePort,
  type TokenCipher,
  type VerificationPort
} from "@localseo/adapters";
import {
  ReleaseCheckSchema,
  ReleaseVerificationCheckSchema,
  ReleaseVerificationJobDataSchema,
  ReleaseVerificationSchema,
  type DeploymentStatus,
  type ReleaseCheck,
  type ReleasePlanStatus,
  type ReleaseVerification,
  type ReleaseVerificationJobData,
  type ReleaseVerificationStatus
} from "@localseo/contracts";
import { decideReleaseVerificationStatus } from "@localseo/domain";
import {
  deployments,
  gscConnections,
  projectTrackingKeys,
  releasePlanItems,
  releasePlans,
  releaseVerificationChecks,
  releaseVerifications
} from "@localseo/db";
import type { Job } from "bullmq";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { isFinalJobAttempt, type WorkerDb, type WorkerDbHandle } from "../job-run.js";

const maxGscInspectionUrlsPerVerification = 10;

type ReleaseVerificationDependencies = {
  verification: VerificationPort;
  searchConsole?: SearchConsolePort;
  tokenCipher?: TokenCipher;
};

type ReleaseVerificationRunRow = typeof releaseVerifications.$inferSelect;
type DeploymentRow = typeof deployments.$inferSelect;

export class ReleaseVerificationConfigurationError extends Error {}
export class ReleaseVerificationEvidenceError extends Error {}

export async function handleReleaseVerificationJob(
  job: Job,
  dbHandle: WorkerDbHandle | undefined,
  dependencies: ReleaseVerificationDependencies
): Promise<Record<string, unknown>> {
  const data = parseReleaseVerificationJobData(job.data);

  if (!dbHandle) {
    throw new ReleaseVerificationConfigurationError("DATABASE_URL is required for release verification jobs");
  }

  return executeReleaseVerification({
    data,
    db: dbHandle.db,
    dependencies,
    isFinalAttempt: isFinalJobAttempt(job, data.maxAttempts)
  });
}

export async function executeReleaseVerification(input: {
  data: ReleaseVerificationJobData;
  db: WorkerDb;
  dependencies: ReleaseVerificationDependencies;
  isFinalAttempt: boolean;
}): Promise<Record<string, unknown>> {
  const run = await loadVerificationRun(input.db, input.data);

  if (!run) {
    throw new ReleaseVerificationEvidenceError(`Release verification ${input.data.verificationId} was not found.`);
  }

  if (run.status !== "running") {
    return {
      status: "already_completed",
      verificationId: run.id,
      verificationStatus: run.status
    };
  }

  const deployment = await loadDeploymentForVerification(input.db, input.data);
  const targetUrls = await loadVerificationTargetUrls(input.db, input.data.releasePlanId, deployment);
  const trackingExpected = await hasActiveTrackingKey(input.db, input.data.projectId);

  const verification = await runVerifier({
    data: input.data,
    verification: input.dependencies.verification,
    deployment,
    targetUrls,
    trackingExpected,
    isFinalAttempt: input.isFinalAttempt
  });

  const gscChecks = await buildGscPostDeployChecks({
    db: input.db,
    projectId: input.data.projectId,
    targetUrls,
    searchConsole: input.dependencies.searchConsole,
    tokenCipher: input.dependencies.tokenCipher
  });
  const checks = [...verification.checks, ...gscChecks];
  const verificationStatus =
    verification.verificationStatus === "execution_failed"
      ? verification.verificationStatus
      : decideReleaseVerificationStatus(checks);

  const persisted = await persistReleaseVerificationResult(input.db, input.data.projectId, input.data.verificationId, {
    ...verification,
    releasePlanId: input.data.releasePlanId,
    deploymentId: input.data.deploymentId,
    verificationStatus,
    summary:
      verificationStatus === "execution_failed"
        ? verification.summary
        : verificationSummaryFromStatus(verificationStatus),
    checks
  });

  if (!persisted) {
    return {
      status: "stale_noop",
      verificationId: input.data.verificationId
    };
  }

  return {
    status: "completed",
    verificationId: input.data.verificationId,
    verificationStatus: persisted.verificationStatus,
    checkCount: persisted.checks.length
  };
}

async function runVerifier(input: {
  data: ReleaseVerificationJobData;
  verification: VerificationPort;
  deployment: DeploymentRow;
  targetUrls: string[];
  trackingExpected: boolean;
  isFinalAttempt: boolean;
}): Promise<ReleaseVerification> {
  try {
    return await input.verification.verifyRelease({
      releasePlanId: input.data.releasePlanId,
      deploymentId: input.deployment.id,
      liveUrls: input.targetUrls,
      trackingExpected: input.trackingExpected
    });
  } catch (error) {
    if (!input.isFinalAttempt) {
      throw error;
    }

    return verificationExecutionFailureResult({
      releasePlanId: input.data.releasePlanId,
      deploymentId: input.deployment.id,
      error
    });
  }
}

export function parseReleaseVerificationJobData(data: unknown): ReleaseVerificationJobData {
  const parsed = ReleaseVerificationJobDataSchema.safeParse(data);

  if (!parsed.success) {
    throw new ReleaseVerificationEvidenceError(
      "Release verification jobs require projectId, releasePlanId, deploymentId, and verificationId."
    );
  }

  return parsed.data;
}

async function loadVerificationRun(
  db: WorkerDb,
  data: ReleaseVerificationJobData
): Promise<ReleaseVerificationRunRow | undefined> {
  const [run] = await db
    .select()
    .from(releaseVerifications)
    .where(
      and(
        eq(releaseVerifications.id, data.verificationId),
        eq(releaseVerifications.releasePlanId, data.releasePlanId),
        eq(releaseVerifications.deploymentId, data.deploymentId)
      )
    )
    .limit(1);

  return run;
}

async function loadDeploymentForVerification(db: WorkerDb, data: ReleaseVerificationJobData): Promise<DeploymentRow> {
  const verificationReadyStatuses = [
    "provider_succeeded",
    "verifying",
    "live_healthy",
    "live_with_warnings",
    "rollback_recommended"
  ] as const satisfies DeploymentStatus[];
  const [deployment] = await db
    .select()
    .from(deployments)
    .where(
      and(
        eq(deployments.id, data.deploymentId),
        eq(deployments.projectId, data.projectId),
        eq(deployments.releasePlanId, data.releasePlanId),
        inArray(deployments.status, verificationReadyStatuses)
      )
    )
    .limit(1);

  if (!deployment) {
    throw new ReleaseVerificationEvidenceError("No provider-succeeded deployment is available for verification.");
  }

  return deployment;
}

async function loadVerificationTargetUrls(
  db: WorkerDb,
  releasePlanId: string,
  deployment: DeploymentRow
): Promise<string[]> {
  const baseLiveUrl = liveUrlsFromDeployment(deployment)[0];
  const itemRows = await db
    .select({
      targetUrl: releasePlanItems.targetUrl
    })
    .from(releasePlanItems)
    .where(eq(releasePlanItems.releasePlanId, releasePlanId));

  if (!baseLiveUrl || itemRows.length === 0) {
    return liveUrlsFromDeployment(deployment);
  }

  return [...new Set(itemRows.map((row) => resolveVerificationTargetUrl(row.targetUrl, baseLiveUrl)))];
}

function resolveVerificationTargetUrl(targetUrl: string, baseLiveUrl: string): string {
  const route = normalizeRelativeReleaseTargetRoute(targetUrl);
  const base = new URL(baseLiveUrl);
  const resolved = new URL(route, base);

  if (resolved.origin !== base.origin) {
    throw new ReleaseVerificationEvidenceError("Release verification target routes must stay on the deployment host.");
  }

  return resolved.toString();
}

function normalizeRelativeReleaseTargetRoute(targetUrl: string): string {
  const trimmed = targetUrl.trim();

  if (
    trimmed.length === 0 ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    /^[a-z][a-z\d+\-.]*:/iu.test(trimmed)
  ) {
    throw new ReleaseVerificationEvidenceError("Release verification target routes must be relative paths.");
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

async function buildGscPostDeployChecks(input: {
  db: WorkerDb;
  projectId: string;
  targetUrls: string[];
  searchConsole?: SearchConsolePort;
  tokenCipher?: TokenCipher;
}): Promise<ReleaseCheck[]> {
  const connection = await loadLatestGscConnection(input.db, input.projectId);
  const propertyUrl = connection?.propertyUrl ?? undefined;
  const firstTargetUrl = input.targetUrls[0];

  if (!connection || connection.status !== "connected" || !connection.encryptedRefreshToken || !propertyUrl) {
    return [
      gscCheck({
        checkKey: "gsc_connection_check",
        result: "skipped",
        message: "Google Search Console handoff skipped because no connected property is available.",
        evidence: {
          observed: {
            connectionStatus: connection?.status ?? "missing"
          }
        }
      })
    ];
  }

  if (!input.searchConsole || !input.tokenCipher) {
    return [
      gscCheck({
        checkKey: "gsc_connection_check",
        result: "skipped",
        message: "Google Search Console handoff skipped because OAuth runtime configuration is incomplete.",
        evidence: {
          observed: { connectionStatus: "connected", runtimeConfigured: false }
        }
      })
    ];
  }

  let refreshToken: string;
  let accessToken: string;

  try {
    refreshToken = input.tokenCipher.decrypt(connection.encryptedRefreshToken);
  } catch {
    const reason = "refresh_token_decrypt_failed";
    await markGscConnectionError(input.db, connection.id, reason);

    return [
      gscCheck({
        checkKey: "gsc_connection_check",
        result: "failed",
        message: "Google Search Console handoff could not decrypt the stored refresh token. Reconnect Search Console.",
        evidence: {
          observed: {
            reason,
            reconnectRequired: true
          }
        }
      })
    ];
  }

  try {
    const tokens = await input.searchConsole.refreshAccessToken({ refreshToken });
    accessToken = tokens.accessToken;
  } catch (error) {
    const reason = classifyGscHandoffAuthFailure(error);

    if (reason.reconnectRequired) {
      await markGscConnectionError(input.db, connection.id, reason.reason);
    }

    return [
      gscCheck({
        checkKey: "gsc_connection_check",
        result: "failed",
        message: "Google Search Console handoff could not refresh access. Reconnect Search Console.",
        evidence: {
          observed: {
            reason: reason.reason,
            reconnectRequired: reason.reconnectRequired,
            provider: providerDiagnostic(error)
          }
        }
      })
    ];
  }

  const checks: ReleaseCheck[] = [
    gscCheck({
      checkKey: "gsc_connection_check",
      result: "passed",
      message: "Google Search Console connection is ready for post-deploy handoff.",
      evidence: {
        observed: {
          propertyUrl
        }
      }
    })
  ];

  if (firstTargetUrl) {
    const sitemapUrl = new URL("/sitemap.xml", firstTargetUrl).toString();

    try {
      await input.searchConsole.submitSitemap({
        accessToken,
        projectId: input.projectId,
        propertyUrl,
        sitemapUrl
      });
      checks.push(
        gscCheck({
          checkKey: "gsc_sitemap_submission_check",
          result: "passed",
          message: "Sitemap was submitted to Google Search Console.",
          evidence: {
            targetUrl: sitemapUrl,
            observed: { propertyUrl, sitemapUrl }
          }
        })
      );
    } catch (error) {
      checks.push(
        gscCheck({
          checkKey: "gsc_sitemap_submission_check",
          result: "failed",
          message: "Sitemap submission to Google Search Console failed.",
          evidence: {
            targetUrl: sitemapUrl,
            observed: {
              propertyUrl,
              provider: providerDiagnostic(error)
            }
          }
        })
      );
    }
  }

  for (const inspectionUrl of input.targetUrls.slice(0, maxGscInspectionUrlsPerVerification)) {
    try {
      const inspection = await input.searchConsole.inspectUrl({
        accessToken,
        siteUrl: propertyUrl,
        inspectionUrl
      });
      checks.push(
        gscCheck({
          checkKey: "gsc_url_inspection_check",
          result: "passed",
          message: "Google Search Console URL Inspection returned indexing diagnostics.",
          evidence: {
            targetUrl: inspectionUrl,
            observed: {
              siteUrl: inspection.siteUrl,
              inspectionUrl: inspection.inspectionUrl,
              verdict: inspection.verdict ?? null,
              coverageState: inspection.coverageState ?? null,
              checkedAt: inspection.checkedAt
            }
          }
        })
      );
    } catch (error) {
      checks.push(
        gscCheck({
          checkKey: "gsc_url_inspection_check",
          result: "failed",
          message: "Google Search Console URL Inspection failed.",
          evidence: {
            targetUrl: inspectionUrl,
            observed: {
              propertyUrl,
              provider: providerDiagnostic(error)
            }
          }
        })
      );
    }
  }

  if (input.targetUrls.length > maxGscInspectionUrlsPerVerification) {
    checks.push(
      gscCheck({
        checkKey: "gsc_url_inspection_limit_check",
        result: "skipped",
        message: "Additional URLs were not inspected because the post-deploy GSC handoff batch is bounded.",
        evidence: {
          observed: {
            inspectedUrlCount: maxGscInspectionUrlsPerVerification,
            skippedUrlCount: input.targetUrls.length - maxGscInspectionUrlsPerVerification
          }
        }
      })
    );
  }

  return checks;
}

async function loadLatestGscConnection(db: WorkerDb, projectId: string) {
  const [connection] = await db
    .select()
    .from(gscConnections)
    .where(eq(gscConnections.projectId, projectId))
    .orderBy(desc(gscConnections.createdAt))
    .limit(1);

  return connection;
}

async function markGscConnectionError(db: WorkerDb, connectionId: string, reason: string): Promise<void> {
  await db
    .update(gscConnections)
    .set({
      status: "error",
      failureJson: { reason },
      updatedAt: new Date()
    })
    .where(eq(gscConnections.id, connectionId));
}

function classifyGscHandoffAuthFailure(error: unknown): { reason: string; reconnectRequired: boolean } {
  if (
    isProviderRequestError(error) &&
    (error.providerReasonCode === "invalid_grant" ||
      error.providerReasonCode === "invalid_client" ||
      error.statusCode === 400 ||
      error.statusCode === 401 ||
      error.statusCode === 403)
  ) {
    return { reason: "google_refresh_token_invalid", reconnectRequired: true };
  }

  return { reason: "google_oauth_refresh_failed", reconnectRequired: false };
}

function providerDiagnostic(error: unknown): Record<string, unknown> {
  if (!isProviderRequestError(error)) {
    return { reason: error instanceof Error ? error.name : "unknown_error" };
  }

  return {
    provider: error.provider,
    operation: error.operation,
    reasonCode: error.reasonCode,
    statusCode: error.statusCode ?? null,
    providerReasonCode: error.providerReasonCode ?? null
  };
}

function gscCheck(input: Omit<ReleaseCheck, "scope" | "severity">): ReleaseCheck {
  return ReleaseCheckSchema.parse({
    ...input,
    scope: "gsc",
    severity: "warning"
  });
}

async function hasActiveTrackingKey(db: WorkerDb, projectId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: projectTrackingKeys.id })
    .from(projectTrackingKeys)
    .where(
      and(
        eq(projectTrackingKeys.projectId, projectId),
        eq(projectTrackingKeys.status, "active"),
        isNull(projectTrackingKeys.revokedAt)
      )
    )
    .limit(1);

  return Boolean(row);
}

async function persistReleaseVerificationResult(
  db: WorkerDb,
  projectId: string,
  verificationId: string,
  verification: ReleaseVerification
): Promise<ReleaseVerification | undefined> {
  if (!verification.deploymentId) {
    throw new ReleaseVerificationEvidenceError("Release verification results require a deployment id.");
  }

  const deploymentId = verification.deploymentId;
  const checkedAt = new Date(verification.checkedAt);
  const verificationStatus = verification.verificationStatus;

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(releaseVerifications)
      .set({
        status: verificationStatus,
        summary: verification.summary,
        checkedAt,
        evidenceJson: {
          source: "release_verify_worker",
          checkCount: verification.checks.length
        },
        updatedAt: new Date()
      })
      .where(
        and(
          eq(releaseVerifications.id, verificationId),
          eq(releaseVerifications.releasePlanId, verification.releasePlanId),
          eq(releaseVerifications.deploymentId, deploymentId),
          eq(releaseVerifications.status, "running")
        )
      )
      .returning();

    if (!updated) {
      return undefined;
    }

    await tx.delete(releaseVerificationChecks).where(eq(releaseVerificationChecks.verificationId, verificationId));

    if (verification.checks.length > 0) {
      await tx.insert(releaseVerificationChecks).values(
        verification.checks.map((check) => {
          const evidence = recordFromUnknown(check.evidence);

          return {
            verificationId,
            checkKey: check.checkKey,
            scope: check.scope,
            targetUrl: stringFromUnknown(evidence.targetUrl),
            severity: check.severity,
            result: check.result,
            message: check.message,
            expectedJson: recordOrUndefined(evidence.expected),
            observedJson: recordOrUndefined(evidence.observed),
            evidenceJson: check.evidence,
            checkedAt
          };
        })
      );
    }

    const nextDeploymentStatus = deploymentStatusFromVerification(verificationStatus);

    await tx
      .update(deployments)
      .set({
        ...(nextDeploymentStatus ? { status: nextDeploymentStatus } : {}),
        verificationStatus,
        verifiedAt: checkedAt,
        updatedAt: new Date()
      })
      .where(and(eq(deployments.id, deploymentId), eq(deployments.projectId, projectId)));

    const nextReleasePlanStatus = releasePlanStatusFromVerification(verificationStatus);

    if (nextReleasePlanStatus) {
      await tx
        .update(releasePlans)
        .set({
          status: nextReleasePlanStatus,
          ...(nextReleasePlanStatus === "live" ? { deployedAt: checkedAt } : {}),
          updatedAt: new Date()
        })
        .where(and(eq(releasePlans.id, verification.releasePlanId), eq(releasePlans.projectId, projectId)));
    }

    return ReleaseVerificationSchema.parse({
      releasePlanId: updated.releasePlanId,
      deploymentId: updated.deploymentId ?? undefined,
      verificationStatus: updated.status,
      summary: updated.summary,
      checkedAt: updated.checkedAt.toISOString(),
      checks: verification.checks.map((check) =>
        ReleaseVerificationCheckSchema.parse({
          ...check,
          checkedAt: verification.checkedAt
        })
      )
    });
  });
}

function deploymentStatusFromVerification(status: ReleaseVerificationStatus): DeploymentStatus | undefined {
  if (status === "live_healthy" || status === "live_with_warnings" || status === "rollback_recommended") {
    return status;
  }

  if (status === "running") {
    return "verifying";
  }

  if (status === "execution_failed" || status === "not_started") {
    return undefined;
  }

  return "failed";
}

function releasePlanStatusFromVerification(status: ReleaseVerificationStatus): ReleasePlanStatus | undefined {
  if (status === "live_healthy" || status === "live_with_warnings") {
    return "live";
  }

  if (status === "rollback_recommended" || status === "failed") {
    return "failed";
  }

  return undefined;
}

function verificationExecutionFailureResult(input: {
  releasePlanId: string;
  deploymentId: string;
  error: unknown;
}): ReleaseVerification {
  const message = normalizeFailureMessage(input.error);

  return ReleaseVerificationSchema.parse({
    releasePlanId: input.releasePlanId,
    deploymentId: input.deploymentId,
    verificationStatus: "execution_failed",
    summary: "Post-deploy verification did not complete.",
    checkedAt: new Date().toISOString(),
    checks: [
      ReleaseCheckSchema.parse({
        checkKey: "verification_execution_error",
        scope: "project",
        severity: "warning",
        result: "skipped",
        message: "Post-deploy verification did not complete.",
        evidence: {
          executionFailure: { message }
        }
      })
    ]
  });
}

function verificationSummaryFromStatus(status: ReleaseVerificationStatus): string {
  return status === "live_healthy"
    ? "Post-deploy verification passed."
    : "Post-deploy verification completed with issues.";
}

function liveUrlsFromDeployment(deployment: DeploymentRow): string[] {
  const evidence = recordFromUnknown(deployment.evidenceJson);
  const provider = recordFromUnknown(evidence.provider);
  const providerLiveUrls = Array.isArray(provider.liveUrls)
    ? provider.liveUrls.filter((url): url is string => typeof url === "string" && url.length > 0)
    : [];
  const urls = deployment.liveUrl ? [deployment.liveUrl, ...providerLiveUrls] : providerLiveUrls;

  return [...new Set(urls)].sort(compareLiveUrlsForVerification);
}

function compareLiveUrlsForVerification(left: string, right: string): number {
  return liveUrlVerificationScore(left) - liveUrlVerificationScore(right);
}

function liveUrlVerificationScore(value: string): number {
  try {
    const url = new URL(value);
    const previewPenalty = url.hostname.includes("--") ? 10 : 0;
    const insecurePenalty = url.protocol === "https:" ? 0 : 1;
    return previewPenalty + insecurePenalty;
  } catch {
    return 100;
  }
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function recordOrUndefined(value: unknown): Record<string, unknown> | undefined {
  const record = recordFromUnknown(value);
  return Object.keys(record).length > 0 ? record : undefined;
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "verification_failed";
}
