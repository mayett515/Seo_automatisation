import { z } from "zod";

import { ProjectIdSchema } from "./common.js";
import { jobStatuses } from "./common.js";

export const releasePlanStatuses = [
  "draft",
  "ready",
  "ready_with_warnings",
  "blocked",
  "approved_for_deploy",
  "deploying",
  "live",
  "failed",
  "rolled_back"
] as const;

export const deploymentStatuses = [
  "pending",
  "deploying",
  "provider_succeeded",
  "verifying",
  "live_healthy",
  "live_with_warnings",
  "rollback_recommended",
  "failed",
  "rollback_pending",
  "rolled_back"
] as const;

export const providerOperationStatuses = [
  "not_started",
  "in_flight",
  "recorded",
  "failed",
  "manual_reconciliation_required"
] as const;

export const releaseVerificationStatuses = [
  "not_started",
  "running",
  "live_healthy",
  "live_with_warnings",
  "rollback_recommended",
  "execution_failed",
  "failed"
] as const;

export const releaseVerificationQueueStatuses = [...jobStatuses, "already_active"] as const;

export const releaseCheckSeverities = ["info", "warning", "blocker"] as const;
export const releaseCheckResults = ["passed", "failed", "skipped"] as const;
export const releaseNoteAudiences = ["internal", "customer"] as const;

export const ReleasePlanStatusSchema = z.enum(releasePlanStatuses);
export const DeploymentStatusSchema = z.enum(deploymentStatuses);
export const ProviderOperationStatusSchema = z.enum(providerOperationStatuses);
export const ReleaseVerificationStatusSchema = z.enum(releaseVerificationStatuses);
export const ReleaseVerificationQueueStatusSchema = z.enum(releaseVerificationQueueStatuses);

export const ReleaseCheckSchema = z.object({
  checkKey: z.string().min(1),
  scope: z.enum(["page", "project", "domain", "sitemap", "tracking", "gsc"]),
  severity: z.enum(releaseCheckSeverities),
  result: z.enum(releaseCheckResults),
  message: z.string().min(1),
  evidence: z.record(z.string(), z.unknown()).optional()
});

export const ReleasePlanSchema = z.object({
  releasePlanId: z.string().min(1),
  projectId: ProjectIdSchema,
  status: ReleasePlanStatusSchema,
  riskLevel: z.enum(["low", "medium", "high"]),
  blockerCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative()
});

export const ReleasePreflightResponseSchema = z.object({
  projectId: ProjectIdSchema,
  releasePlanId: z.string().min(1),
  readiness: ReleasePlanStatusSchema.extract(["ready", "ready_with_warnings", "blocked"]),
  checks: z.array(ReleaseCheckSchema)
});

export const ReleaseDeployApprovalResponseSchema = z.object({
  projectId: ProjectIdSchema,
  releasePlanId: z.string().min(1),
  status: z.literal("approved_for_deploy"),
  approvedAt: z.string().datetime()
});

export const ReleaseVerificationSchema = z.object({
  releasePlanId: z.string().min(1),
  deploymentId: z.string().min(1).optional(),
  verificationStatus: ReleaseVerificationStatusSchema,
  summary: z.string().min(1),
  checkedAt: z.string().datetime(),
  checks: z.array(ReleaseCheckSchema)
});

export const ReleaseVerificationCheckSchema = ReleaseCheckSchema.extend({
  verificationId: z.string().min(1).optional(),
  targetUrl: z.string().min(1).optional(),
  expected: z.record(z.string(), z.unknown()).optional(),
  observed: z.record(z.string(), z.unknown()).optional(),
  checkedAt: z.string().datetime()
});

export const ReleaseNoteSchema = z.object({
  releasePlanId: z.string().min(1),
  audience: z.enum(releaseNoteAudiences).default("internal"),
  title: z.string().min(1),
  body: z.string().min(1),
  createdAt: z.string().datetime()
});

export const RollbackPointSchema = z.object({
  releasePlanId: z.string().min(1),
  deploymentId: z.string().min(1).optional(),
  artifactKey: z.string().min(1),
  providerDeployId: z.string().min(1).optional(),
  liveUrl: z.string().url().optional(),
  evidence: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime()
});

export const VerifyReleaseRequestSchema = z.object({
  deploymentId: z.string().min(1).optional()
});

export const ExecuteRollbackRequestSchema = z.object({
  rollbackPointId: z.string().min(1)
});

export type ReleaseCheck = z.output<typeof ReleaseCheckSchema>;
export type ReleasePlan = z.output<typeof ReleasePlanSchema>;
export type ReleasePreflightResponse = z.output<typeof ReleasePreflightResponseSchema>;
export type ReleaseDeployApprovalResponse = z.output<typeof ReleaseDeployApprovalResponseSchema>;
export type ReleaseVerification = z.output<typeof ReleaseVerificationSchema>;
export type ReleaseVerificationCheck = z.output<typeof ReleaseVerificationCheckSchema>;
export type ReleaseNote = z.output<typeof ReleaseNoteSchema>;
export type RollbackPoint = z.output<typeof RollbackPointSchema>;

export type VerifyReleaseRequest = z.output<typeof VerifyReleaseRequestSchema>;
export type ExecuteRollbackRequest = z.output<typeof ExecuteRollbackRequestSchema>;

export type ReleasePlanStatus = z.output<typeof ReleasePlanStatusSchema>;
export type DeploymentStatus = z.output<typeof DeploymentStatusSchema>;
export type ProviderOperationStatus = z.output<typeof ProviderOperationStatusSchema>;
export type ReleaseVerificationStatus = z.output<typeof ReleaseVerificationStatusSchema>;

export type ReleaseVerificationQueueStatus = z.output<typeof ReleaseVerificationQueueStatusSchema>;
