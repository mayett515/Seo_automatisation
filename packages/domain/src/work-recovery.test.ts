import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyWorkRecovery, type WorkRecoveryInput } from "./work-recovery.js";

void describe("DB-before-queue recovery decisions", () => {
  void it("does nothing when durable product truth is already terminal", () => {
    assert.deepEqual(classifyWorkRecovery(workRecoveryInput({ durableState: "terminal" })), {
      kind: "noop",
      reason: "terminal"
    });
  });

  void it("does not recover active transport or fresh workers", () => {
    assert.deepEqual(classifyWorkRecovery(workRecoveryInput({ transportState: "active" })), {
      kind: "noop",
      reason: "transport_job_active"
    });
    assert.deepEqual(classifyWorkRecovery(workRecoveryInput({ workerFreshness: "fresh" })), {
      kind: "noop",
      reason: "fresh_worker"
    });
    assert.deepEqual(classifyWorkRecovery(workRecoveryInput({ transportState: "unknown" })), {
      kind: "noop",
      reason: "transport_state_unknown"
    });
  });

  void it("re-enqueues stale read/analyze work with the same deterministic job id", () => {
    assert.deepEqual(
      classifyWorkRecovery(
        workRecoveryInput({
          workflowCategory: "read_analyze",
          durableState: "running",
          transportState: "missing",
          jobId: "opportunity-scout:run-1"
        })
      ),
      {
        kind: "reenqueue",
        jobId: "opportunity-scout:run-1",
        reason: "stale_running"
      }
    );
  });

  void it("requires manual review for artifact capture that is not run-id idempotent", () => {
    assert.deepEqual(
      classifyWorkRecovery(
        workRecoveryInput({
          workflowCategory: "artifact_capture",
          artifactWritesAreIdempotent: false
        })
      ),
      {
        kind: "manual_reconciliation",
        reason: "artifact_capture_not_recoverable"
      }
    );
  });

  void it("re-enqueues idempotent artifact capture with the same deterministic job id", () => {
    assert.deepEqual(
      classifyWorkRecovery(
        workRecoveryInput({
          workflowCategory: "artifact_capture",
          artifactWritesAreIdempotent: true,
          jobId: "website-import:run-1"
        })
      ),
      {
        kind: "reenqueue",
        jobId: "website-import:run-1",
        reason: "missing_transport"
      }
    );
  });

  void it("routes provider mutation uncertainty to provider reconciliation instead of re-enqueue", () => {
    assert.deepEqual(
      classifyWorkRecovery(
        workRecoveryInput({
          workflowCategory: "provider_mutation",
          transportState: "missing"
        })
      ),
      {
        kind: "reconcile_provider",
        reason: "provider_mutation_uncertain"
      }
    );
  });

  void it("requires manual reconciliation when provider mutation recovery is exhausted", () => {
    assert.deepEqual(
      classifyWorkRecovery(
        workRecoveryInput({
          workflowCategory: "provider_mutation",
          recoveryCount: 3,
          maxRecoveryCount: 3
        })
      ),
      {
        kind: "manual_reconciliation",
        reason: "provider_recovery_exhausted"
      }
    );
  });

  void it("records warning evidence when provider handoff warning recovery is exhausted", () => {
    assert.deepEqual(
      classifyWorkRecovery(
        workRecoveryInput({
          workflowCategory: "provider_handoff_warning",
          recoveryCount: 2,
          maxRecoveryCount: 2
        })
      ),
      {
        kind: "record_warning",
        reason: "provider_handoff_recovery_exhausted"
      }
    );
  });

  void it("does not auto-recover projection and approval work", () => {
    assert.deepEqual(
      classifyWorkRecovery(
        workRecoveryInput({
          workflowCategory: "projection_approval"
        })
      ),
      {
        kind: "manual_reconciliation",
        reason: "projection_requires_human_review"
      }
    );
  });

  void it("marks active product truth failed when transport completed without terminal product truth", () => {
    assert.deepEqual(
      classifyWorkRecovery(
        workRecoveryInput({
          workflowCategory: "read_analyze",
          transportState: "completed"
        })
      ),
      {
        kind: "mark_execution_failed",
        reason: "transport_completed_without_product_truth"
      }
    );
  });
});

function workRecoveryInput(overrides: Partial<WorkRecoveryInput> = {}): WorkRecoveryInput {
  return {
    workflowCategory: "read_analyze",
    durableState: "queued",
    transportState: "missing",
    workerFreshness: "stale",
    recoveryCount: 0,
    maxRecoveryCount: 3,
    jobId: "job-1",
    artifactWritesAreIdempotent: true,
    providerMutationUncertain: false,
    ...overrides
  };
}
