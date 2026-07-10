export type WorkRecoveryWorkflowCategory =
  | "read_analyze"
  | "artifact_capture"
  | "provider_handoff_warning"
  | "provider_mutation"
  | "projection_approval";

export type WorkRecoveryDurableState = "queued" | "running" | "retrying" | "terminal";

export type WorkRecoveryTransportState = "active" | "missing" | "failed" | "completed" | "unknown";

export type WorkRecoveryWorkerFreshness = "fresh" | "stale" | "unknown";

export type WorkRecoveryDecision =
  | {
      kind: "noop";
      reason: "terminal" | "fresh_worker" | "transport_job_active" | "transport_state_unknown";
    }
  | { kind: "reenqueue"; jobId: string; reason: "missing_transport" | "stale_running" | "transport_failed" }
  | {
      kind: "mark_execution_failed";
      reason: "recovery_exhausted" | "transport_completed_without_product_truth";
    }
  | { kind: "record_warning"; reason: "provider_handoff_recovery_exhausted" }
  | { kind: "reconcile_provider"; reason: "provider_mutation_uncertain" }
  | {
      kind: "manual_reconciliation";
      reason:
        | "provider_recovery_exhausted"
        | "provider_mutation_uncertain"
        | "projection_requires_human_review"
        | "artifact_capture_not_recoverable";
    };

export type WorkRecoveryInput = {
  workflowCategory: WorkRecoveryWorkflowCategory;
  durableState: WorkRecoveryDurableState;
  transportState: WorkRecoveryTransportState;
  workerFreshness: WorkRecoveryWorkerFreshness;
  recoveryCount: number;
  maxRecoveryCount: number;
  jobId: string;
  artifactWritesAreIdempotent?: boolean;
  providerMutationUncertain?: boolean;
};

export function classifyWorkRecovery(input: WorkRecoveryInput): WorkRecoveryDecision {
  if (input.durableState === "terminal") {
    return { kind: "noop", reason: "terminal" };
  }

  if (input.workerFreshness === "fresh") {
    return { kind: "noop", reason: "fresh_worker" };
  }

  if (input.transportState === "active") {
    return { kind: "noop", reason: "transport_job_active" };
  }

  if (input.transportState === "unknown") {
    return { kind: "noop", reason: "transport_state_unknown" };
  }

  if (input.workflowCategory === "provider_mutation" || input.providerMutationUncertain) {
    return classifyProviderMutationRecovery(input);
  }

  if (input.workflowCategory === "projection_approval") {
    return { kind: "manual_reconciliation", reason: "projection_requires_human_review" };
  }

  if (input.transportState === "completed") {
    return { kind: "mark_execution_failed", reason: "transport_completed_without_product_truth" };
  }

  if (hasRecoveryExhausted(input)) {
    if (input.workflowCategory === "provider_handoff_warning") {
      return { kind: "record_warning", reason: "provider_handoff_recovery_exhausted" };
    }

    return { kind: "mark_execution_failed", reason: "recovery_exhausted" };
  }

  if (input.workflowCategory === "artifact_capture" && !input.artifactWritesAreIdempotent) {
    return { kind: "manual_reconciliation", reason: "artifact_capture_not_recoverable" };
  }

  return {
    kind: "reenqueue",
    jobId: input.jobId,
    reason: reenqueueReason(input)
  };
}

function classifyProviderMutationRecovery(input: WorkRecoveryInput): WorkRecoveryDecision {
  if (hasRecoveryExhausted(input)) {
    return { kind: "manual_reconciliation", reason: "provider_recovery_exhausted" };
  }

  return { kind: "reconcile_provider", reason: "provider_mutation_uncertain" };
}

function hasRecoveryExhausted(input: Pick<WorkRecoveryInput, "recoveryCount" | "maxRecoveryCount">): boolean {
  return input.recoveryCount >= input.maxRecoveryCount;
}

type ReenqueueReason = Extract<WorkRecoveryDecision, { kind: "reenqueue" }>["reason"];

function reenqueueReason(input: Pick<WorkRecoveryInput, "transportState" | "durableState">): ReenqueueReason {
  if (input.transportState === "failed") {
    return "transport_failed";
  }

  if (input.durableState === "running") {
    return "stale_running";
  }

  return "missing_transport";
}
