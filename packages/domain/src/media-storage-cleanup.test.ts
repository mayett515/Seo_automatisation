import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideMediaStorageCleanup, failedMediaDiagnosticRetentionMs } from "./media-storage-cleanup.js";

const now = new Date("2026-07-17T12:00:00.000Z");
const claimStaleBefore = new Date(now.getTime() - 15 * 60_000);
const failedBefore = new Date(now.getTime() - failedMediaDiagnosticRetentionMs);

void describe("media storage cleanup policy", () => {
  void it("cleans successful quarantine sources without selecting immutable derivatives", () => {
    assert.deepEqual(decide({ status: "ready", processedAt: new Date("2026-07-17T11:59:00.000Z") }), {
      kind: "cleanup",
      scope: "source_only"
    });
    assert.deepEqual(decide({ status: "archived", processedAt: new Date("2026-07-17T11:59:00.000Z") }), {
      kind: "cleanup",
      scope: "source_only"
    });
  });

  void it("keeps ordinary failed assets for seven days but cleans expired upload intents immediately", () => {
    assert.deepEqual(decide({ status: "failed", updatedAt: new Date(failedBefore.getTime() + 1) }), {
      kind: "noop",
      reason: "diagnostic_window"
    });
    assert.deepEqual(decide({ status: "failed", updatedAt: failedBefore }), {
      kind: "cleanup",
      scope: "failed_asset_objects"
    });
    assert.deepEqual(decide({ status: "failed", failureCode: "upload_expired", updatedAt: new Date() }), {
      kind: "cleanup",
      scope: "failed_asset_objects"
    });
  });

  void it("keeps fresh claims exclusive and stops after the bounded attempt count", () => {
    assert.deepEqual(
      decide({
        status: "ready",
        processedAt: now,
        cleanupClaimedAt: new Date(claimStaleBefore.getTime() + 1)
      }),
      { kind: "noop", reason: "claim_active" }
    );
    assert.deepEqual(decide({ status: "failed", cleanupAttemptCount: 3, updatedAt: failedBefore }), {
      kind: "exhausted"
    });
  });

  void it("reports ready assets without durable processing evidence as invalid", () => {
    assert.deepEqual(decide({ status: "ready", processedAt: null }), {
      kind: "invalid",
      reason: "ready_asset_missing_processed_at"
    });
  });
});

function decide(
  input: Partial<Parameters<typeof decideMediaStorageCleanup>[0]> &
    Pick<Parameters<typeof decideMediaStorageCleanup>[0], "status">
) {
  return decideMediaStorageCleanup({
    failureCode: null,
    processedAt: null,
    updatedAt: now,
    cleanupCompletedAt: null,
    cleanupClaimedAt: null,
    cleanupAttemptCount: 0,
    maxAttempts: 3,
    claimStaleBefore,
    readyBefore: now,
    failedBefore,
    ...input
  });
}
