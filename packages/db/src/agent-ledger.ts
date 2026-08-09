import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import type {
  AgentRunEventType,
  AgentRunEvidenceRole,
  AgentRunEvidenceSourceKind,
  AgentRunStepKind
} from "@localseo/contracts";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseClient } from "./client.js";
import {
  agentRunEvents,
  agentRunEvidenceItems,
  agentRuns,
  agentRunStepEvidenceLinks,
  agentRunSteps
} from "./schema.js";

type TransactionClient = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

export class AgentLedgerConflictError extends Error {}

export type AgentRunStepIdentity = {
  projectId: string;
  runId: string;
  stepKey: string;
  stepKind: AgentRunStepKind;
  agentRole?: string;
  toolKey?: string;
};

export type AgentRunEvidenceSource = {
  evidenceKey: string;
  sourceKind: AgentRunEvidenceSourceKind;
  sourceId: string;
  sourceVersion: string;
};

export function canonicalAgentLedgerText(value: unknown): string {
  const text = canonicalize(value);
  if (text === undefined) throw new AgentLedgerConflictError("Agent ledger value could not be canonicalized.");
  return text;
}

export function canonicalAgentLedgerSha256(value: unknown): string {
  return createHash("sha256").update(canonicalAgentLedgerText(value), "utf8").digest("hex");
}

export async function claimAgentRunStep(
  db: DatabaseClient,
  input: AgentRunStepIdentity & {
    eventKey: string;
    maxAttempts: number;
    expectedExecutionEpoch?: number;
    occurredAt?: Date;
  }
): Promise<
  | { kind: "claimed"; stepId: string; attemptCount: number; rowVersion: number }
  | { kind: "already_succeeded"; stepId: string }
> {
  return db.transaction(async (tx) => {
    const run = await lockActiveWorkflowRun(tx, input.projectId, input.runId, input.expectedExecutionEpoch);
    await tx
      .insert(agentRunSteps)
      .values({
        projectId: input.projectId,
        agentRunId: input.runId,
        stepKey: input.stepKey,
        stepKind: input.stepKind,
        agentRole: input.agentRole,
        toolKey: input.toolKey
      })
      .onConflictDoNothing();
    const [step] = await tx
      .select()
      .from(agentRunSteps)
      .where(and(eq(agentRunSteps.agentRunId, input.runId), eq(agentRunSteps.stepKey, input.stepKey)))
      .limit(1);
    if (!step) throw new AgentLedgerConflictError("Agent run step could not be created or loaded.");
    assertStepIdentity(step, input);
    if (step.status === "succeeded") return { kind: "already_succeeded", stepId: step.id };
    if (!inArrayValue(step.status, ["pending", "failed"])) {
      throw new AgentLedgerConflictError("Agent run step is already claimed or terminal.");
    }
    if (step.attemptCount >= input.maxAttempts)
      throw new AgentLedgerConflictError("Agent run step attempts are exhausted.");
    const now = input.occurredAt ?? new Date();
    const [claimed] = await tx
      .update(agentRunSteps)
      .set({
        status: "running",
        attemptCount: step.attemptCount + 1,
        executionEpoch: run.executionEpoch,
        startedAt: now,
        completedAt: null,
        outputRef: null,
        outputSha256: null,
        outputJson: null,
        usageJson: null,
        failureCode: null,
        failureMessage: null,
        updatedAt: now
      })
      .where(
        and(
          eq(agentRunSteps.id, step.id),
          eq(agentRunSteps.rowVersion, step.rowVersion),
          inArray(agentRunSteps.status, ["pending", "failed"])
        )
      )
      .returning();
    if (!claimed) throw new AgentLedgerConflictError("Agent run step claim lost its compare-and-set.");
    await appendEvent(tx, {
      projectId: input.projectId,
      runId: input.runId,
      stepId: step.id,
      eventKey: `${input.eventKey}.attempt-${claimed.attemptCount}`,
      eventType: "step.started",
      executionEpoch: run.executionEpoch,
      occurredAt: now,
      payload: { stepKey: input.stepKey, attemptCount: claimed.attemptCount }
    });
    return {
      kind: "claimed",
      stepId: step.id,
      attemptCount: claimed.attemptCount,
      rowVersion: claimed.rowVersion
    };
  });
}

export async function completeAgentRunStep(
  db: DatabaseClient,
  input: {
    projectId: string;
    runId: string;
    stepId: string;
    expectedRowVersion: number;
    outputJson: Record<string, unknown>;
    outputRef?: string;
    usageJson?: Record<string, unknown>;
    expectedExecutionEpoch?: number;
    provider?: string;
    model?: string;
    evidenceLinks?: Array<{
      role: AgentRunEvidenceRole;
      ordinal: number;
      evidence: AgentRunEvidenceSource;
      eventKey: string;
    }>;
    eventKey: string;
    occurredAt?: Date;
  }
): Promise<{ outputSha256: string; rowVersion: number }> {
  return db.transaction(async (tx) => {
    await lockAgentLedgerProject(tx, input.projectId);
    const evidenceSources = (input.evidenceLinks ?? [])
      .map((link) => link.evidence)
      .sort((left, right) =>
        left.sourceKind === right.sourceKind
          ? compareStableText(left.sourceId, right.sourceId)
          : compareStableText(left.sourceKind, right.sourceKind)
      );
    for (const evidence of evidenceSources) {
      await lockAgentEvidenceSource(tx, input.projectId, input.runId, evidence);
    }
    const run = await lockActiveWorkflowRun(tx, input.projectId, input.runId, input.expectedExecutionEpoch);
    const now = input.occurredAt ?? new Date();
    const outputCanonicalText = canonicalAgentLedgerText(input.outputJson);
    const outputSha256 = createHash("sha256").update(outputCanonicalText, "utf8").digest("hex");
    for (const link of input.evidenceLinks ?? []) {
      await bindEvidenceInTransaction(tx, {
        projectId: input.projectId,
        runId: input.runId,
        stepId: input.stepId,
        ...link,
        expectedExecutionEpoch: input.expectedExecutionEpoch,
        occurredAt: now
      });
    }
    const [updated] = await tx
      .update(agentRunSteps)
      .set({
        status: "succeeded",
        outputJson: input.outputJson,
        outputRef: input.outputRef,
        outputSha256,
        outputCanonicalText,
        usageJson: input.usageJson,
        provider: input.provider,
        model: input.model,
        completedAt: now,
        updatedAt: now
      })
      .where(
        and(
          eq(agentRunSteps.id, input.stepId),
          eq(agentRunSteps.agentRunId, input.runId),
          eq(agentRunSteps.projectId, input.projectId),
          eq(agentRunSteps.status, "running"),
          ...(input.expectedExecutionEpoch === undefined
            ? []
            : [eq(agentRunSteps.executionEpoch, input.expectedExecutionEpoch)]),
          eq(agentRunSteps.rowVersion, input.expectedRowVersion)
        )
      )
      .returning({ rowVersion: agentRunSteps.rowVersion });
    if (!updated) throw new AgentLedgerConflictError("Agent run step success lost its compare-and-set.");
    await appendEvent(tx, {
      projectId: input.projectId,
      runId: input.runId,
      stepId: input.stepId,
      eventKey: input.eventKey,
      eventType: "step.succeeded",
      executionEpoch: run.executionEpoch,
      occurredAt: now,
      payload: { outputSha256 }
    });
    return { outputSha256, rowVersion: updated.rowVersion };
  });
}

export async function failAgentRunStep(
  db: DatabaseClient,
  input: {
    projectId: string;
    runId: string;
    stepId: string;
    expectedRowVersion: number;
    failureCode: string;
    failureMessage: string;
    expectedExecutionEpoch?: number;
    eventKey: string;
    occurredAt?: Date;
  }
): Promise<void> {
  await db.transaction(async (tx) => {
    const run = await lockActiveWorkflowRun(tx, input.projectId, input.runId, input.expectedExecutionEpoch);
    const now = input.occurredAt ?? new Date();
    const [updated] = await tx
      .update(agentRunSteps)
      .set({
        status: "failed",
        failureCode: input.failureCode.slice(0, 120),
        failureMessage: input.failureMessage.slice(0, 1_000),
        completedAt: now,
        updatedAt: now
      })
      .where(
        and(
          eq(agentRunSteps.id, input.stepId),
          eq(agentRunSteps.agentRunId, input.runId),
          eq(agentRunSteps.projectId, input.projectId),
          eq(agentRunSteps.status, "running"),
          ...(input.expectedExecutionEpoch === undefined
            ? []
            : [eq(agentRunSteps.executionEpoch, input.expectedExecutionEpoch)]),
          eq(agentRunSteps.rowVersion, input.expectedRowVersion)
        )
      )
      .returning({ id: agentRunSteps.id });
    if (!updated) throw new AgentLedgerConflictError("Agent run step failure lost its compare-and-set.");
    await appendEvent(tx, {
      projectId: input.projectId,
      runId: input.runId,
      stepId: input.stepId,
      eventKey: input.eventKey,
      eventType: "step.failed",
      executionEpoch: run.executionEpoch,
      occurredAt: now,
      payload: { failureCode: input.failureCode.slice(0, 120) }
    });
  });
}

export async function bindAgentRunEvidenceSource(
  db: DatabaseClient,
  input: {
    projectId: string;
    runId: string;
    stepId: string;
    role: AgentRunEvidenceRole;
    ordinal: number;
    evidence: AgentRunEvidenceSource;
    expectedExecutionEpoch?: number;
    eventKey: string;
  }
): Promise<{ evidenceItemId: string }> {
  return db.transaction(async (tx) => {
    await lockAgentLedgerProject(tx, input.projectId);
    await lockAgentEvidenceSource(tx, input.projectId, input.runId, input.evidence);
    await lockActiveWorkflowRun(tx, input.projectId, input.runId, input.expectedExecutionEpoch);
    return bindEvidenceInTransaction(tx, { ...input, occurredAt: new Date() });
  });
}

async function lockAgentLedgerProject(tx: TransactionClient, projectId: string): Promise<void> {
  const rows = await tx.execute(sql`SELECT "id" FROM "projects" WHERE "id" = ${projectId} FOR UPDATE`);
  if (rows.length === 0) throw new AgentLedgerConflictError("Agent ledger project was not found.");
}

async function lockAgentEvidenceSource(
  tx: TransactionClient,
  projectId: string,
  runId: string,
  evidence: AgentRunEvidenceSource
): Promise<void> {
  // Project -> sorted sources -> run is shared by evidence, context, and recovery writers.
  let rows: Awaited<ReturnType<TransactionClient["execute"]>>;
  switch (evidence.sourceKind) {
    case "business_profile_revision":
      rows = await tx.execute(sql`
        SELECT revision."id"
        FROM "project_business_profile_revisions" AS revision
        INNER JOIN "project_business_profiles" AS profile
          ON profile."current_revision_id" = revision."id"
         AND profile."project_id" = revision."project_id"
         AND profile."status" = 'confirmed'
        WHERE revision."id" = ${evidence.sourceId}
          AND revision."project_id" = ${projectId}
          AND 'sha256:' || revision."profile_sha256" = ${evidence.sourceVersion}
        FOR SHARE OF revision, profile
      `);
      break;
    case "canonical_service":
      rows = await tx.execute(
        sql`SELECT "id" FROM "services" WHERE "id" = ${evidence.sourceId} AND "project_id" = ${projectId} AND "status" = 'confirmed' AND 'row-version:' || "row_version"::text = ${evidence.sourceVersion} FOR SHARE`
      );
      break;
    case "canonical_area":
      rows = await tx.execute(
        sql`SELECT "id" FROM "areas" WHERE "id" = ${evidence.sourceId} AND "project_id" = ${projectId} AND "status" = 'confirmed' AND 'row-version:' || "row_version"::text = ${evidence.sourceVersion} FOR SHARE`
      );
      break;
    case "website_import":
      rows = await tx.execute(
        sql`SELECT "id" FROM "website_import_runs" WHERE "id" = ${evidence.sourceId} AND "project_id" = ${projectId} AND "status" = 'completed' AND 'completed-at:' || to_char("completed_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') = ${evidence.sourceVersion} FOR SHARE`
      );
      break;
    case "gsc_row":
      rows = await tx.execute(sql`
        SELECT row."id"
        FROM "gsc_search_analytics_rows" AS row
        INNER JOIN "gsc_sync_runs" AS sync
          ON sync."id" = row."sync_run_id"
         AND sync."project_id" = row."project_id"
         AND sync."status" = 'completed'
         AND (sync."date_to" || 'T23:59:59.999Z')::timestamptz >= current_date - interval '90 days'
        WHERE row."id" = ${evidence.sourceId}
          AND row."project_id" = ${projectId}
          AND 'sync-run:' || sync."id"::text = ${evidence.sourceVersion}
        FOR SHARE OF row, sync
      `);
      break;
    case "gsc_signal":
      rows = await tx.execute(sql`
        SELECT signal."id"
        FROM "gsc_opportunity_signals" AS signal
        INNER JOIN "gsc_sync_runs" AS sync
          ON sync."id" = signal."sync_run_id"
         AND sync."project_id" = signal."project_id"
         AND sync."status" = 'completed'
         AND (sync."date_to" || 'T23:59:59.999Z')::timestamptz >= current_date - interval '90 days'
        WHERE signal."id" = ${evidence.sourceId}
          AND signal."project_id" = ${projectId}
          AND 'sync-run:' || sync."id"::text = ${evidence.sourceVersion}
        FOR SHARE OF signal, sync
      `);
      break;
    case "ranking_proof":
      rows = await tx.execute(
        sql`SELECT "id" FROM "ranking_proofs" WHERE "id" = ${evidence.sourceId} AND "project_id" = ${projectId} AND "status" = 'reviewed' AND "captured_at" >= now() - interval '30 days' AND 'row-version:' || "row_version"::text = ${evidence.sourceVersion} FOR SHARE`
      );
      break;
    case "public_web_search_capture":
      rows = await tx.execute(
        sql`SELECT "id" FROM "public_web_search_captures" WHERE "id" = ${evidence.sourceId} AND "project_id" = ${projectId} AND "agent_run_id" = ${runId} AND "status" = 'succeeded' AND 'captured-at:' || to_char("captured_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') = ${evidence.sourceVersion} FOR SHARE`
      );
      break;
    case "knowledge_version":
      rows = await tx.execute(sql`
        SELECT version."id"
        FROM "project_knowledge_versions" AS version
        INNER JOIN "project_knowledge_documents" AS document
          ON document."id" = version."document_id"
         AND document."project_id" = version."project_id"
         AND document."current_approved_version_id" = version."id"
        WHERE version."id" = ${evidence.sourceId}
          AND version."project_id" = ${projectId}
          AND version."status" = 'approved'
          AND version."model_use_policy" = 'model_allowed'
          AND version."content_sha256" = encode(sha256(convert_to(version."body_markdown", 'UTF8')), 'hex')
          AND 'sha256:' || version."content_sha256" = ${evidence.sourceVersion}
          AND EXISTS (
            SELECT 1 FROM "project_knowledge_task_scopes" AS scope
            WHERE scope."version_id" = version."id" AND scope."task_scope" = 'opportunity_research'
          )
        FOR SHARE OF version, document
      `);
      break;
    case "technical_audit_finding":
      rows = await tx.execute(sql`
        SELECT finding."id"
        FROM "technical_audit_findings" AS finding
        INNER JOIN "technical_audit_runs" AS audit
          ON audit."id" = finding."audit_run_id"
         AND audit."project_id" = finding."project_id"
         AND audit."status" = 'completed'
        WHERE finding."id" = ${evidence.sourceId}
          AND finding."project_id" = ${projectId}
          AND 'audit-run:' || audit."id"::text = ${evidence.sourceVersion}
        FOR SHARE OF finding, audit
      `);
      break;
    case "existing_page":
      rows = await tx.execute(sql`
        SELECT version."id"
        FROM "page_versions" AS version
        INNER JOIN "page_proposals" AS proposal
          ON proposal."id" = version."page_proposal_id"
         AND proposal."project_id" = ${projectId}
        WHERE version."id" = ${evidence.sourceId}
          AND version."status" IN ('approved', 'release_candidate', 'released', 'superseded')
          AND 'version-number:' || version."version_number"::text = ${evidence.sourceVersion}
        FOR SHARE OF version, proposal
      `);
      break;
  }
  if (rows.length === 0) {
    throw new AgentLedgerConflictError("Agent evidence source is no longer current and admissible.");
  }
}

function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function bindEvidenceInTransaction(
  tx: TransactionClient,
  input: {
    projectId: string;
    runId: string;
    stepId: string;
    role: AgentRunEvidenceRole;
    ordinal: number;
    evidence: AgentRunEvidenceSource;
    eventKey: string;
    expectedExecutionEpoch?: number;
    occurredAt: Date;
  }
): Promise<{ evidenceItemId: string }> {
  const [step] = await tx
    .select({ id: agentRunSteps.id, status: agentRunSteps.status, executionEpoch: agentRunSteps.executionEpoch })
    .from(agentRunSteps)
    .where(
      and(
        eq(agentRunSteps.id, input.stepId),
        eq(agentRunSteps.agentRunId, input.runId),
        eq(agentRunSteps.projectId, input.projectId)
      )
    )
    .limit(1);
  if (
    !step ||
    step.status !== "running" ||
    (input.expectedExecutionEpoch !== undefined && step.executionEpoch !== input.expectedExecutionEpoch)
  ) {
    throw new AgentLedgerConflictError("Evidence can bind only to the current running step execution.");
  }
  const [existing] = await tx
    .select()
    .from(agentRunEvidenceItems)
    .where(
      and(
        eq(agentRunEvidenceItems.agentRunId, input.runId),
        eq(agentRunEvidenceItems.evidenceKey, input.evidence.evidenceKey)
      )
    )
    .limit(1);
  if (existing) assertEvidenceReplay(existing, input.evidence);
  const [inserted] = existing
    ? [undefined]
    : await tx
        .insert(agentRunEvidenceItems)
        .values({
          projectId: input.projectId,
          agentRunId: input.runId,
          evidenceKey: input.evidence.evidenceKey,
          sourceKind: input.evidence.sourceKind,
          sourceId: input.evidence.sourceId,
          sourceVersion: input.evidence.sourceVersion,
          executionEpoch: step.executionEpoch,
          payloadSha256: "0".repeat(64),
          observedAt: new Date(0),
          proofTier: "internal_signal",
          evidenceJson: {}
        })
        .returning();
  const item = existing ?? inserted;
  if (!item) throw new AgentLedgerConflictError("Evidence item could not be created or loaded.");
  await tx
    .insert(agentRunStepEvidenceLinks)
    .values({
      projectId: input.projectId,
      agentRunId: input.runId,
      agentRunStepId: input.stepId,
      evidenceItemId: item.id,
      role: input.role,
      ordinal: input.ordinal
    })
    .onConflictDoNothing();
  const [storedLink] = await tx
    .select()
    .from(agentRunStepEvidenceLinks)
    .where(
      and(
        eq(agentRunStepEvidenceLinks.agentRunStepId, input.stepId),
        eq(agentRunStepEvidenceLinks.evidenceItemId, item.id),
        eq(agentRunStepEvidenceLinks.role, input.role)
      )
    )
    .limit(1);
  if (
    !storedLink ||
    storedLink.projectId !== input.projectId ||
    storedLink.agentRunId !== input.runId ||
    storedLink.ordinal !== input.ordinal
  ) {
    throw new AgentLedgerConflictError("Agent evidence link replay has different semantics.");
  }
  await appendEvent(tx, {
    projectId: input.projectId,
    runId: input.runId,
    stepId: input.stepId,
    eventKey: input.eventKey,
    eventType: "evidence.bound",
    executionEpoch: step.executionEpoch,
    occurredAt: input.occurredAt,
    payload: {
      evidenceKey: input.evidence.evidenceKey,
      role: input.role,
      sourceVersion: item.sourceVersion,
      payloadSha256: item.payloadSha256
    }
  });
  return { evidenceItemId: item.id };
}

export async function completeWorkflowRun(
  db: DatabaseClient,
  input: {
    projectId: string;
    runId: string;
    outputJson: Record<string, unknown>;
    eventKey: string;
    diagnosticsJson?: Record<string, unknown>;
    occurredAt?: Date;
  }
): Promise<string> {
  return db.transaction(async (tx) => {
    const run = await lockWorkflowRun(tx, input.projectId, input.runId);
    if (run.status === "succeeded") {
      if (run.outputSha256 !== canonicalAgentLedgerSha256(input.outputJson)) {
        throw new AgentLedgerConflictError("Succeeded workflow replay has a different output digest.");
      }
      return run.outputSha256;
    }
    if (run.status !== "running") throw new AgentLedgerConflictError("Workflow run is not running.");
    const activeSteps = await tx
      .select({ id: agentRunSteps.id })
      .from(agentRunSteps)
      .where(
        and(eq(agentRunSteps.agentRunId, input.runId), inArray(agentRunSteps.status, ["pending", "running", "failed"]))
      );
    if (activeSteps.length > 0) throw new AgentLedgerConflictError("Workflow cannot succeed with unresolved steps.");
    const now = input.occurredAt ?? new Date();
    const outputSha256 = canonicalAgentLedgerSha256(input.outputJson);
    const [updated] = await tx
      .update(agentRuns)
      .set({
        status: "succeeded",
        outputJson: input.outputJson,
        outputSha256,
        diagnosticsJson: input.diagnosticsJson,
        completedAt: now,
        updatedAt: now
      })
      .where(
        and(eq(agentRuns.id, input.runId), eq(agentRuns.projectId, input.projectId), eq(agentRuns.status, "running"))
      )
      .returning({ id: agentRuns.id });
    if (!updated) throw new AgentLedgerConflictError("Workflow success lost its compare-and-set.");
    await appendEvent(tx, {
      projectId: input.projectId,
      runId: input.runId,
      eventKey: input.eventKey,
      eventType: "run.succeeded",
      executionEpoch: run.executionEpoch,
      occurredAt: now,
      payload: { outputSha256 }
    });
    return outputSha256;
  });
}

export async function failWorkflowRun(
  db: DatabaseClient,
  input: {
    projectId: string;
    runId: string;
    failureCode: string;
    failureMessage: string;
    eventKey: string;
    occurredAt?: Date;
  }
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const run = await lockWorkflowRun(tx, input.projectId, input.runId);
    if (run.status === "failed") return false;
    if (!inArrayValue(run.status, ["queued", "running"])) return false;
    const now = input.occurredAt ?? new Date();
    const failedSteps = await tx
      .update(agentRunSteps)
      .set({
        status: "failed",
        executionEpoch: run.executionEpoch,
        failureCode: "parent_run_failed",
        failureMessage: "Parent workflow was terminalized.",
        completedAt: now,
        updatedAt: now
      })
      .where(and(eq(agentRunSteps.agentRunId, input.runId), inArray(agentRunSteps.status, ["pending", "running"])))
      .returning({ id: agentRunSteps.id, executionEpoch: agentRunSteps.executionEpoch });
    for (const step of failedSteps) {
      await appendEvent(tx, {
        projectId: input.projectId,
        runId: input.runId,
        stepId: step.id,
        eventKey: `step.failed.parent.${step.id}`,
        eventType: "step.failed",
        executionEpoch: step.executionEpoch,
        occurredAt: now,
        payload: { failureCode: "parent_run_failed" }
      });
    }
    const [updated] = await tx
      .update(agentRuns)
      .set({
        status: "failed",
        failureCode: input.failureCode.slice(0, 120),
        diagnosticsJson: { message: input.failureMessage.slice(0, 1_000) },
        completedAt: now,
        updatedAt: now
      })
      .where(
        and(
          eq(agentRuns.id, input.runId),
          eq(agentRuns.projectId, input.projectId),
          inArray(agentRuns.status, ["queued", "running"])
        )
      )
      .returning({ id: agentRuns.id });
    if (!updated) return false;
    await appendEvent(tx, {
      projectId: input.projectId,
      runId: input.runId,
      eventKey: input.eventKey,
      eventType: "run.failed",
      executionEpoch: run.executionEpoch,
      occurredAt: now,
      payload: { failureCode: input.failureCode.slice(0, 120) }
    });
    return true;
  });
}

export async function appendAgentRunEvent(
  db: DatabaseClient,
  input: {
    projectId: string;
    runId: string;
    stepId?: string;
    eventKey: string;
    eventType: AgentRunEventType;
    payload?: Record<string, unknown>;
    expectedExecutionEpoch?: number;
    occurredAt?: Date;
  }
): Promise<void> {
  await db.transaction(async (tx) => {
    const run = await lockActiveWorkflowRun(tx, input.projectId, input.runId, input.expectedExecutionEpoch);
    await appendEvent(tx, {
      ...input,
      executionEpoch: run.executionEpoch,
      payload: input.payload ?? {},
      occurredAt: input.occurredAt ?? new Date()
    });
  });
}

async function lockWorkflowRun(tx: TransactionClient, projectId: string, runId: string) {
  await tx.execute(sql`SELECT "id" FROM "agent_runs" WHERE "id" = ${runId} AND "project_id" = ${projectId} FOR UPDATE`);
  const [run] = await tx
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.projectId, projectId)))
    .limit(1);
  if (!run || run.workflowName === null) throw new AgentLedgerConflictError("Workflow run was not found.");
  return run;
}

async function lockActiveWorkflowRun(
  tx: TransactionClient,
  projectId: string,
  runId: string,
  expectedExecutionEpoch?: number
) {
  const run = await lockWorkflowRun(tx, projectId, runId);
  if (!inArrayValue(run.status, ["queued", "running"])) {
    throw new AgentLedgerConflictError("Workflow run is terminal.");
  }
  if (expectedExecutionEpoch !== undefined && run.executionEpoch !== expectedExecutionEpoch) {
    throw new AgentLedgerConflictError("Workflow execution epoch no longer owns the run.");
  }
  return run;
}

async function appendEvent(
  tx: TransactionClient,
  input: {
    projectId: string;
    runId: string;
    stepId?: string;
    eventKey: string;
    eventType: AgentRunEventType;
    executionEpoch: number;
    payload: Record<string, unknown>;
    occurredAt: Date;
  }
): Promise<void> {
  await tx
    .insert(agentRunEvents)
    .values({
      projectId: input.projectId,
      agentRunId: input.runId,
      agentRunStepId: input.stepId,
      eventKey: input.eventKey,
      eventType: input.eventType,
      executionEpoch: input.executionEpoch,
      payloadJson: input.payload,
      occurredAt: input.occurredAt
    })
    .onConflictDoNothing();
  const [event] = await tx
    .select({
      eventType: agentRunEvents.eventType,
      executionEpoch: agentRunEvents.executionEpoch,
      payloadJson: agentRunEvents.payloadJson,
      agentRunStepId: agentRunEvents.agentRunStepId
    })
    .from(agentRunEvents)
    .where(and(eq(agentRunEvents.agentRunId, input.runId), eq(agentRunEvents.eventKey, input.eventKey)))
    .limit(1);
  if (
    !event ||
    event.eventType !== input.eventType ||
    event.executionEpoch !== input.executionEpoch ||
    event.agentRunStepId !== (input.stepId ?? null) ||
    canonicalAgentLedgerSha256(event.payloadJson) !== canonicalAgentLedgerSha256(input.payload)
  ) {
    throw new AgentLedgerConflictError("Agent run event idempotency key was reused with different semantics.");
  }
}

function assertStepIdentity(row: typeof agentRunSteps.$inferSelect, input: AgentRunStepIdentity): void {
  if (
    row.projectId !== input.projectId ||
    row.agentRunId !== input.runId ||
    row.stepKind !== input.stepKind ||
    row.agentRole !== (input.agentRole ?? null) ||
    row.toolKey !== (input.toolKey ?? null)
  ) {
    throw new AgentLedgerConflictError("Agent run step key was reused with different semantics.");
  }
}

function assertEvidenceReplay(row: typeof agentRunEvidenceItems.$inferSelect, evidence: AgentRunEvidenceSource): void {
  if (
    row.sourceKind !== evidence.sourceKind ||
    row.sourceId !== evidence.sourceId ||
    row.sourceVersion !== evidence.sourceVersion
  ) {
    throw new AgentLedgerConflictError("Agent evidence key was reused with different source truth.");
  }
}

function inArrayValue<T>(value: T, values: readonly T[]): boolean {
  return values.includes(value);
}
