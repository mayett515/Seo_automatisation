import type { MediaAssetStatus } from "@localseo/contracts";

export const failedMediaDiagnosticRetentionMs = 7 * 24 * 60 * 60_000;

export type MediaStorageCleanupDecision =
  | { kind: "cleanup"; scope: "source_only" | "failed_asset_objects" }
  | {
      kind: "noop";
      reason: "active_asset" | "already_completed" | "claim_active" | "diagnostic_window";
    }
  | { kind: "exhausted" }
  | { kind: "invalid"; reason: "ready_asset_missing_processed_at" };

export function decideMediaStorageCleanup(input: {
  status: MediaAssetStatus;
  failureCode?: string | null;
  processedAt?: Date | null;
  updatedAt: Date;
  cleanupCompletedAt?: Date | null;
  cleanupClaimedAt?: Date | null;
  cleanupAttemptCount: number;
  maxAttempts: number;
  claimStaleBefore: Date;
  readyBefore: Date;
  failedBefore: Date;
}): MediaStorageCleanupDecision {
  if (input.cleanupCompletedAt) {
    return { kind: "noop", reason: "already_completed" };
  }

  if (input.status === "pending_upload" || input.status === "processing") {
    return { kind: "noop", reason: "active_asset" };
  }

  if (input.cleanupClaimedAt && input.cleanupClaimedAt > input.claimStaleBefore) {
    return { kind: "noop", reason: "claim_active" };
  }

  if (input.cleanupAttemptCount >= input.maxAttempts) {
    return { kind: "exhausted" };
  }

  if (input.status === "ready" || input.status === "archived") {
    if (!input.processedAt) {
      return { kind: "invalid", reason: "ready_asset_missing_processed_at" };
    }
    return input.processedAt <= input.readyBefore
      ? { kind: "cleanup", scope: "source_only" }
      : { kind: "noop", reason: "diagnostic_window" };
  }

  if (input.failureCode === "upload_expired" || input.updatedAt <= input.failedBefore) {
    return { kind: "cleanup", scope: "failed_asset_objects" };
  }

  return { kind: "noop", reason: "diagnostic_window" };
}
