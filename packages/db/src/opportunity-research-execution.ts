import { and, eq, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
import {
  OpportunityResearchWorkflowOutputSchema,
  opportunityResearchConstraintProfileVersion,
  opportunityResearchStepIdentities,
  opportunityResearchStepKeys,
  opportunityResearchWorkflowVersion,
  type OpportunityResearchWorkflowOutput
} from "@localseo/contracts";
import { normalizeOpportunityResearchKey, prepareOpportunityPortfolio } from "@localseo/domain";
import { canonicalAgentLedgerSha256, canonicalAgentLedgerText } from "./agent-ledger.js";
import type { DatabaseClient } from "./client.js";
import { loadOpportunityResearchMaterial } from "./opportunity-research-material.js";
import {
  agentRunEvents,
  agentRuns,
  agentRunSteps,
  jobRuns,
  opportunities,
  projectOpportunityResearchStates
} from "./schema.js";

type TransactionClient = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

export class OpportunityResearchPersistenceConflictError extends Error {}

export type PersistedOpportunityResearchCandidate = {
  id: string;
  projectId: string;
  agentRunId: string;
  areaId: string;
  serviceId: string;
  primaryKeyword: string;
  rankingMilestone: "unverified" | "outside_top_10" | "top_10" | "top_5" | "top_3" | "rank_1";
  evidenceReadiness: "internal_signal" | "supporting_context" | "reviewed_proof";
  businessValue: "unknown" | "low" | "medium" | "high";
  marketDifficulty: "unknown" | "low" | "medium" | "high";
  executionEffort: "unknown" | "low" | "medium" | "high";
  lane: "defend_advance" | "quick_win" | "build_cluster" | "strategic_market";
  policyVersion: string;
  researchMaterialDigest: string;
  candidateKey?: string;
  evidenceJson: Record<string, unknown>;
};

export async function claimOpportunityResearchExecution(
  db: DatabaseClient,
  input: {
    projectId: string;
    runId: string;
    materialDigest: string;
    triggerSource?: "user_action" | "material_dirty" | "weekly_scan" | "work_recovery";
    jobRunId?: string;
    expectedRecoveryCount?: number;
    executionClaimToken: string;
    occurredAt?: Date;
  }
): Promise<
  | { kind: "claimed"; executionEpoch: number; executionRecoveryCount: number }
  | { kind: "already_running" }
  | { kind: "already_succeeded"; outputSha256: string; outputJson: Record<string, unknown> }
> {
  return db.transaction(async (tx) => {
    await lockProject(tx, input.projectId);
    const state = await lockResearchState(tx, input.projectId);
    const run = await lockOpportunityResearchRun(tx, input.projectId, input.runId);
    assertRunIdentity(run, input.materialDigest, input.projectId);
    await assertRecoveryDeliveryIdentity(tx, run, input);
    const executionRecoveryCount = input.expectedRecoveryCount ?? 0;
    if (run.status === "succeeded") {
      if (!run.outputSha256 || !run.outputJson) {
        throw new OpportunityResearchPersistenceConflictError("Succeeded workflow has incomplete output evidence.");
      }
      return { kind: "already_succeeded", outputSha256: run.outputSha256, outputJson: run.outputJson };
    }
    if (run.status === "running") {
      if (state.status !== "running" || state.activeRunId !== input.runId) {
        throw new OpportunityResearchPersistenceConflictError("Running workflow and research state disagree.");
      }
      if (executionRecoveryCount < run.executionRecoveryCount) {
        throw new OpportunityResearchPersistenceConflictError(
          "Workflow delivery belongs to a superseded recovery generation."
        );
      }
      if (run.executionClaimToken === input.executionClaimToken) return { kind: "already_running" };
      const now = input.occurredAt ?? new Date();
      const nextExecutionEpoch = run.executionEpoch + 1;
      const supersededSteps = await tx
        .update(agentRunSteps)
        .set({
          status: "failed",
          failureCode: "execution_superseded",
          failureMessage: "The owning workflow execution was superseded by a newer delivery.",
          completedAt: now,
          updatedAt: now
        })
        .where(
          and(
            eq(agentRunSteps.agentRunId, input.runId),
            eq(agentRunSteps.projectId, input.projectId),
            eq(agentRunSteps.status, "running"),
            eq(agentRunSteps.executionEpoch, run.executionEpoch)
          )
        )
        .returning({ id: agentRunSteps.id, executionEpoch: agentRunSteps.executionEpoch });
      if (supersededSteps.length > 0) {
        await tx.insert(agentRunEvents).values(
          supersededSteps.map((step) => ({
            projectId: input.projectId,
            agentRunId: input.runId,
            agentRunStepId: step.id,
            eventKey: `step.failed.execution-superseded.${nextExecutionEpoch}.${step.id}`,
            eventType: "step.failed" as const,
            executionEpoch: step.executionEpoch,
            payloadJson: { failureCode: "execution_superseded" },
            occurredAt: now
          }))
        );
      }
      const [claimed] = await tx
        .update(agentRuns)
        .set({
          executionEpoch: sql<number>`${agentRuns.executionEpoch} + 1`,
          executionClaimToken: input.executionClaimToken,
          executionRecoveryCount,
          lastHeartbeatAt: now,
          updatedAt: now
        })
        .where(
          and(
            eq(agentRuns.id, input.runId),
            eq(agentRuns.projectId, input.projectId),
            eq(agentRuns.status, "running"),
            eq(agentRuns.executionEpoch, run.executionEpoch),
            eq(agentRuns.executionRecoveryCount, run.executionRecoveryCount),
            ...(input.expectedRecoveryCount === undefined
              ? []
              : [eq(agentRuns.recoveryCount, input.expectedRecoveryCount)])
          )
        )
        .returning({ executionEpoch: agentRuns.executionEpoch });
      if (!claimed)
        throw new OpportunityResearchPersistenceConflictError("Workflow delivery claim lost its compare-and-set.");
      await tx.insert(agentRunEvents).values({
        projectId: input.projectId,
        agentRunId: input.runId,
        eventKey: `execution.claimed.${claimed.executionEpoch}`,
        eventType: "recovery.claimed",
        executionEpoch: claimed.executionEpoch,
        payloadJson: {
          executionEpoch: claimed.executionEpoch,
          executionClaimToken: input.executionClaimToken,
          executionRecoveryCount
        },
        occurredAt: now
      });
      return { kind: "claimed", executionEpoch: claimed.executionEpoch, executionRecoveryCount };
    }
    if (run.status !== "queued" || state.status !== "queued" || state.activeRunId !== input.runId) {
      throw new OpportunityResearchPersistenceConflictError("Opportunity Research workflow is no longer claimable.");
    }
    const now = input.occurredAt ?? new Date();
    const [runUpdated] = await tx
      .update(agentRuns)
      .set({
        status: "running",
        startedAt: now,
        executionEpoch: sql<number>`${agentRuns.executionEpoch} + 1`,
        executionClaimToken: input.executionClaimToken,
        executionRecoveryCount,
        lastHeartbeatAt: now,
        updatedAt: now
      })
      .where(
        and(
          eq(agentRuns.id, input.runId),
          eq(agentRuns.projectId, input.projectId),
          eq(agentRuns.status, "queued"),
          eq(agentRuns.executionRecoveryCount, 0)
        )
      )
      .returning({ id: agentRuns.id, executionEpoch: agentRuns.executionEpoch });
    if (!runUpdated) throw new OpportunityResearchPersistenceConflictError("Workflow claim lost its compare-and-set.");
    const [stateUpdated] = await tx
      .update(projectOpportunityResearchStates)
      .set({ status: "running", updatedAt: now })
      .where(
        and(
          eq(projectOpportunityResearchStates.projectId, input.projectId),
          eq(projectOpportunityResearchStates.status, "queued"),
          eq(projectOpportunityResearchStates.activeRunId, input.runId)
        )
      )
      .returning({ projectId: projectOpportunityResearchStates.projectId });
    if (!stateUpdated)
      throw new OpportunityResearchPersistenceConflictError("Research-state claim lost its compare-and-set.");
    await tx.insert(agentRunEvents).values({
      projectId: input.projectId,
      agentRunId: input.runId,
      eventKey: "run.started",
      eventType: "run.started",
      executionEpoch: runUpdated.executionEpoch,
      payloadJson: { executionRecoveryCount },
      occurredAt: now
    });
    return { kind: "claimed", executionEpoch: runUpdated.executionEpoch, executionRecoveryCount };
  });
}

export async function renewOpportunityResearchExecutionHeartbeat(
  db: DatabaseClient,
  input: {
    projectId: string;
    runId: string;
    expectedExecutionEpoch: number;
    expectedExecutionClaimToken: string;
    expectedExecutionRecoveryCount: number;
    occurredAt?: Date;
  }
): Promise<boolean> {
  const now = input.occurredAt ?? new Date();
  const [updated] = await db
    .update(agentRuns)
    .set({ lastHeartbeatAt: now, updatedAt: now })
    .where(
      and(
        eq(agentRuns.id, input.runId),
        eq(agentRuns.projectId, input.projectId),
        eq(agentRuns.workflowName, "opportunity_research"),
        eq(agentRuns.status, "running"),
        eq(agentRuns.executionEpoch, input.expectedExecutionEpoch),
        eq(agentRuns.executionClaimToken, input.expectedExecutionClaimToken),
        eq(agentRuns.executionRecoveryCount, input.expectedExecutionRecoveryCount),
        sql`EXISTS (
          SELECT 1
          FROM "project_opportunity_research_states" AS state
          WHERE state."project_id" = ${input.projectId}
            AND state."status" = 'running'
            AND state."active_run_id" = ${input.runId}
        )`
      )
    )
    .returning({ id: agentRuns.id });
  return Boolean(updated);
}

export async function persistOpportunityResearchSuccess(
  db: DatabaseClient,
  input: {
    projectId: string;
    runId: string;
    materialDigest: string;
    output: OpportunityResearchWorkflowOutput;
    candidates: readonly PersistedOpportunityResearchCandidate[];
    provider: string;
    model: string;
    expectedExecutionEpoch: number;
    occurredAt?: Date;
  }
): Promise<{
  outputSha256: string;
  opportunityCount: number;
  stateStatus: "succeeded" | "paused";
  shortfalls: { defendAdvance: number; quickBuild: number; strategic: number };
}> {
  return db.transaction(async (tx) => {
    await lockProject(tx, input.projectId);
    const state = await lockResearchState(tx, input.projectId);
    const run = await lockOpportunityResearchRun(tx, input.projectId, input.runId);
    assertRunIdentity(run, input.materialDigest, input.projectId);
    const outputSha256 = canonicalAgentLedgerSha256(input.output);
    const workflowSteps = await loadOpportunityResearchWorkflowSteps(tx, input.projectId, input.runId);
    if (run.status === "succeeded") {
      if (run.outputSha256 !== outputSha256) {
        throw new OpportunityResearchPersistenceConflictError(
          "Succeeded workflow replay has a different output digest."
        );
      }
      assertCompletedOpportunityResearchLedger(workflowSteps, run.executionEpoch, input.output, outputSha256);
      const persistedCandidates = await tx
        .select({ id: opportunities.id })
        .from(opportunities)
        .where(and(eq(opportunities.projectId, input.projectId), eq(opportunities.agentRunId, input.runId)));
      return {
        outputSha256,
        opportunityCount: persistedCandidates.length,
        stateStatus: state.pausedAt ? "paused" : "succeeded",
        shortfalls: state.portfolioShortfallsJson
      };
    }
    if (
      run.status !== "running" ||
      run.executionEpoch !== input.expectedExecutionEpoch ||
      state.status !== "running" ||
      state.activeRunId !== input.runId
    ) {
      throw new OpportunityResearchPersistenceConflictError("Opportunity Research success lost lifecycle ownership.");
    }
    assertCompletedOpportunityResearchLedger(workflowSteps, input.expectedExecutionEpoch, input.output, outputSha256);
    const currentMaterial = await loadOpportunityResearchMaterial(tx, input.projectId);
    if (currentMaterial.materialDigest !== input.materialDigest || currentMaterial.readinessIssues.length > 0) {
      throw new OpportunityResearchPersistenceConflictError(
        "Opportunity Research material changed before persistence."
      );
    }
    const now = input.occurredAt ?? new Date();
    const existingCandidates = await tx
      .select({ candidateKey: opportunities.candidateKey })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.projectId, input.projectId),
          isNotNull(opportunities.candidateKey),
          ne(opportunities.status, "rejected")
        )
      );
    const existingKeys = new Set(
      existingCandidates
        .map((candidate) => candidate.candidateKey)
        .filter((candidateKey): candidateKey is string => candidateKey !== null)
    );
    const candidatesWithDerivedKeys = input.candidates.map((candidate) => ({
      ...candidate,
      candidateKey: normalizeOpportunityResearchKey({
        serviceId: candidate.serviceId,
        areaId: candidate.areaId,
        primaryKeyword: candidate.primaryKeyword
      })
    }));
    const preparedPortfolio = prepareOpportunityPortfolio(
      candidatesWithDerivedKeys.map((candidate) => ({
        ...candidate,
        stableKey: candidate.candidateKey,
        axes: {
          rankingMilestone: candidate.rankingMilestone,
          evidenceReadiness: candidate.evidenceReadiness,
          businessValue: candidate.businessValue,
          marketDifficulty: candidate.marketDifficulty,
          executionEffort: candidate.executionEffort,
          lane: candidate.lane
        }
      })),
      existingKeys
    );
    const candidatesToInsert = preparedPortfolio.candidates;
    const selection = preparedPortfolio.selection;
    const selectedById = new Map(selection.selected.map((candidate) => [candidate.id, candidate.portfolioOrder]));
    if (candidatesToInsert.length > 0) {
      await tx.insert(opportunities).values(
        candidatesToInsert.map((candidate) => ({
          id: candidate.id,
          projectId: candidate.projectId,
          agentRunId: candidate.agentRunId,
          areaId: candidate.areaId,
          serviceId: candidate.serviceId,
          primaryKeyword: candidate.primaryKeyword,
          rankingMilestone: candidate.rankingMilestone,
          evidenceReadiness: candidate.evidenceReadiness,
          businessValue: candidate.businessValue,
          marketDifficulty: candidate.marketDifficulty,
          executionEffort: candidate.executionEffort,
          lane: candidate.lane,
          policyVersion: candidate.policyVersion,
          researchMaterialDigest: candidate.researchMaterialDigest,
          candidateKey: candidate.candidateKey,
          evidenceJson: candidate.evidenceJson,
          status: "new" as const,
          portfolioSelected: selectedById.has(candidate.id),
          portfolioOrder: selectedById.get(candidate.id) ?? null,
          createdAt: now,
          updatedAt: now
        }))
      );
    }
    await tx.insert(agentRunEvents).values({
      projectId: input.projectId,
      agentRunId: input.runId,
      eventKey: "proposal.persisted",
      eventType: "proposal.persisted",
      executionEpoch: input.expectedExecutionEpoch,
      payloadJson: {
        opportunityCount: candidatesToInsert.length,
        duplicateCandidateCount: input.candidates.length - candidatesToInsert.length,
        selectedCount: selection.selected.length,
        shortfalls: selection.shortfalls
      },
      occurredAt: now
    });
    const [runUpdated] = await tx
      .update(agentRuns)
      .set({
        status: "succeeded",
        provider: input.provider,
        model: input.model,
        outputJson: input.output,
        outputSha256,
        completedAt: now,
        updatedAt: now
      })
      .where(
        and(
          eq(agentRuns.id, input.runId),
          eq(agentRuns.projectId, input.projectId),
          eq(agentRuns.status, "running"),
          eq(agentRuns.executionEpoch, input.expectedExecutionEpoch)
        )
      )
      .returning({ id: agentRuns.id });
    if (!runUpdated)
      throw new OpportunityResearchPersistenceConflictError("Workflow success lost its compare-and-set.");
    const stateStatus = state.pausedAt ? "paused" : "succeeded";
    const [stateUpdated] = await tx
      .update(projectOpportunityResearchStates)
      .set({
        status: stateStatus,
        activeRunId: null,
        materialDigest: input.materialDigest,
        materialDirty: false,
        lastSuccessfulDigest: input.materialDigest,
        lastRunAt: now,
        nextScheduledAt: state.pausedAt ? null : daysFrom(now, 7),
        portfolioShortfallsJson: selection.shortfalls,
        updatedAt: now
      })
      .where(
        and(
          eq(projectOpportunityResearchStates.projectId, input.projectId),
          eq(projectOpportunityResearchStates.status, "running"),
          eq(projectOpportunityResearchStates.activeRunId, input.runId)
        )
      )
      .returning({ projectId: projectOpportunityResearchStates.projectId });
    if (!stateUpdated)
      throw new OpportunityResearchPersistenceConflictError("Research success projection lost its compare-and-set.");
    await tx.insert(agentRunEvents).values({
      projectId: input.projectId,
      agentRunId: input.runId,
      eventKey: "run.succeeded",
      eventType: "run.succeeded",
      executionEpoch: input.expectedExecutionEpoch,
      payloadJson: { outputSha256 },
      occurredAt: now
    });
    return {
      outputSha256,
      opportunityCount: candidatesToInsert.length,
      stateStatus,
      shortfalls: selection.shortfalls
    };
  });
}

export async function failOpportunityResearchExecution(
  db: DatabaseClient,
  input: {
    projectId: string;
    runId: string;
    failureCode: string;
    failureMessage: string;
    needsResearch?: boolean;
    suppressAutomaticRetry?: boolean;
    recordRecoveryExhausted?: boolean;
    expectedExecutionEpoch?: number;
    expectedRecoveryCount?: number;
    staleBefore?: Date;
    occurredAt?: Date;
  }
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await lockProject(tx, input.projectId);
    const state = await lockResearchState(tx, input.projectId);
    const run = await lockOpportunityResearchRun(tx, input.projectId, input.runId);
    if (run.status === "failed") return false;
    if (!inArrayValue(run.status, ["queued", "running"])) return false;
    if (input.expectedExecutionEpoch !== undefined && run.executionEpoch !== input.expectedExecutionEpoch) return false;
    if (
      input.expectedRecoveryCount !== undefined &&
      (run.recoveryCount !== input.expectedRecoveryCount ||
        !input.staleBefore ||
        (run.status === "running" ? (run.lastHeartbeatAt ?? run.updatedAt) : run.updatedAt) > input.staleBefore ||
        state.activeRunId !== input.runId)
    ) {
      return false;
    }
    const now = input.occurredAt ?? new Date();
    const failedSteps = await tx
      .update(agentRunSteps)
      .set({
        status: "failed",
        executionEpoch: run.executionEpoch,
        failureCode: "parent_run_failed",
        failureMessage: "Parent Opportunity Research workflow was terminalized.",
        completedAt: now,
        updatedAt: now
      })
      .where(and(eq(agentRunSteps.agentRunId, input.runId), inArray(agentRunSteps.status, ["pending", "running"])))
      .returning({ id: agentRunSteps.id, executionEpoch: agentRunSteps.executionEpoch });
    for (const step of failedSteps) {
      await tx.insert(agentRunEvents).values({
        projectId: input.projectId,
        agentRunId: input.runId,
        agentRunStepId: step.id,
        eventKey: `step.failed.parent.${step.id}`,
        eventType: "step.failed",
        executionEpoch: step.executionEpoch,
        payloadJson: { failureCode: "parent_run_failed" },
        occurredAt: now
      });
    }
    const failureCode = input.failureCode.slice(0, 120);
    if (input.recordRecoveryExhausted && input.expectedRecoveryCount !== undefined) {
      await tx.insert(agentRunEvents).values({
        projectId: input.projectId,
        agentRunId: input.runId,
        eventKey: `recovery.exhausted.${input.expectedRecoveryCount}`,
        eventType: "recovery.exhausted",
        executionEpoch: run.executionEpoch,
        payloadJson: { recoveryCount: input.expectedRecoveryCount, failureCode },
        occurredAt: now
      });
    }
    const [runUpdated] = await tx
      .update(agentRuns)
      .set({
        status: "failed",
        failureCode,
        diagnosticsJson: { message: input.failureMessage.slice(0, 1_000) },
        completedAt: now,
        updatedAt: now
      })
      .where(
        and(
          eq(agentRuns.id, input.runId),
          eq(agentRuns.projectId, input.projectId),
          inArray(agentRuns.status, ["queued", "running"]),
          ...(input.expectedExecutionEpoch === undefined
            ? []
            : [eq(agentRuns.executionEpoch, input.expectedExecutionEpoch)]),
          ...(input.expectedRecoveryCount !== undefined
            ? [
                eq(agentRuns.recoveryCount, input.expectedRecoveryCount),
                lte(
                  sql<Date>`CASE
                    WHEN ${agentRuns.status} = 'running'
                      THEN COALESCE(${agentRuns.lastHeartbeatAt}, ${agentRuns.updatedAt})
                    ELSE ${agentRuns.updatedAt}
                  END`,
                  sql`${(input.staleBefore as Date).toISOString()}::timestamptz`
                )
              ]
            : [])
        )
      )
      .returning({ id: agentRuns.id });
    if (!runUpdated) return false;
    if (state.activeRunId === input.runId) {
      const status = state.pausedAt ? "paused" : input.needsResearch ? "needs_research" : "failed";
      await tx
        .update(projectOpportunityResearchStates)
        .set({
          status,
          activeRunId: null,
          materialDirty: input.needsResearch ? true : state.materialDirty,
          lastRunAt: now,
          nextScheduledAt:
            state.pausedAt || input.suppressAutomaticRetry ? null : input.needsResearch ? now : daysFrom(now, 1),
          updatedAt: now
        })
        .where(
          and(
            eq(projectOpportunityResearchStates.projectId, input.projectId),
            eq(projectOpportunityResearchStates.activeRunId, input.runId)
          )
        );
    }
    await tx.insert(agentRunEvents).values({
      projectId: input.projectId,
      agentRunId: input.runId,
      eventKey: `run.failed.${failureCode}`,
      eventType: "run.failed",
      executionEpoch: run.executionEpoch,
      payloadJson: { failureCode },
      occurredAt: now
    });
    return true;
  });
}

async function lockProject(tx: TransactionClient, projectId: string): Promise<void> {
  const rows = await tx.execute(sql`SELECT "id" FROM "projects" WHERE "id" = ${projectId} FOR UPDATE`);
  if (rows.length === 0) throw new OpportunityResearchPersistenceConflictError("Project was not found.");
}

async function lockResearchState(tx: TransactionClient, projectId: string) {
  await tx.execute(
    sql`SELECT "project_id" FROM "project_opportunity_research_states" WHERE "project_id" = ${projectId} FOR UPDATE`
  );
  const [state] = await tx
    .select()
    .from(projectOpportunityResearchStates)
    .where(eq(projectOpportunityResearchStates.projectId, projectId))
    .limit(1);
  if (!state) throw new OpportunityResearchPersistenceConflictError("Opportunity Research state was not found.");
  return state;
}

async function lockOpportunityResearchRun(tx: TransactionClient, projectId: string, runId: string) {
  await tx.execute(sql`SELECT "id" FROM "agent_runs" WHERE "id" = ${runId} AND "project_id" = ${projectId} FOR UPDATE`);
  const [run] = await tx
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.projectId, projectId)))
    .limit(1);
  if (!run || run.workflowName !== "opportunity_research") {
    throw new OpportunityResearchPersistenceConflictError("Opportunity Research run was not found.");
  }
  return run;
}

function assertRunIdentity(run: typeof agentRuns.$inferSelect, materialDigest: string, projectId: string): void {
  if (
    run.projectId !== projectId ||
    run.subjectId !== projectId ||
    run.task !== "opportunity_scout" ||
    run.workflowName !== "opportunity_research" ||
    run.workflowVersion !== opportunityResearchWorkflowVersion ||
    run.constraintProfileVersion !== opportunityResearchConstraintProfileVersion ||
    run.inputSha256 !== materialDigest
  ) {
    throw new OpportunityResearchPersistenceConflictError("Opportunity Research run identity does not match the job.");
  }
}

async function assertRecoveryDeliveryIdentity(
  tx: TransactionClient,
  run: typeof agentRuns.$inferSelect,
  input: {
    projectId: string;
    runId: string;
    triggerSource?: "user_action" | "material_dirty" | "weekly_scan" | "work_recovery";
    jobRunId?: string;
    expectedRecoveryCount?: number;
  }
): Promise<void> {
  if (!input.triggerSource || !input.jobRunId) {
    throw new OpportunityResearchPersistenceConflictError("Workflow delivery is missing its durable job audit.");
  }
  const [audit] = await tx
    .select({
      projectId: jobRuns.projectId,
      externalJobId: jobRuns.externalJobId,
      queueName: jobRuns.queueName,
      status: jobRuns.status,
      triggerSource: jobRuns.triggerSource,
      type: jobRuns.type,
      inputRef: jobRuns.inputRef,
      actorType: jobRuns.actorType,
      actorUserId: jobRuns.actorUserId
    })
    .from(jobRuns)
    .where(eq(jobRuns.id, input.jobRunId))
    .limit(1);
  const expectedAuditExternalJobId =
    input.triggerSource === "work_recovery" && input.expectedRecoveryCount !== undefined
      ? `${input.runId}:recovery:${input.expectedRecoveryCount}`
      : input.runId;
  if (
    !audit ||
    audit.projectId !== input.projectId ||
    audit.externalJobId !== expectedAuditExternalJobId ||
    audit.queueName !== "opportunity-research" ||
    !inArrayValue(audit.status, ["queued", "running"]) ||
    audit.type !== "opportunity_research" ||
    audit.inputRef !== input.runId
  ) {
    throw new OpportunityResearchPersistenceConflictError("Workflow delivery audit identity is invalid.");
  }
  if (input.triggerSource === "work_recovery") {
    if (input.expectedRecoveryCount === undefined) {
      throw new OpportunityResearchPersistenceConflictError("Recovered delivery is missing its recovery generation.");
    }
    if (
      run.recoveryCount !== input.expectedRecoveryCount ||
      audit.triggerSource !== "work_recovery" ||
      audit.actorType !== "system" ||
      audit.actorUserId !== null
    ) {
      throw new OpportunityResearchPersistenceConflictError(
        "Recovered delivery no longer owns the current recovery generation."
      );
    }
    return;
  }
  if (input.expectedRecoveryCount !== undefined) {
    throw new OpportunityResearchPersistenceConflictError("Non-recovery delivery supplied recovery ownership.");
  }
  if (
    run.executionRecoveryCount !== 0 ||
    audit.triggerSource !== input.triggerSource ||
    run.triggerSource !== input.triggerSource
  ) {
    throw new OpportunityResearchPersistenceConflictError("Original delivery no longer owns workflow execution.");
  }
  if (
    (input.triggerSource === "user_action" &&
      (audit.actorType !== "user" || !run.requestedByUserId || audit.actorUserId !== run.requestedByUserId)) ||
    (input.triggerSource !== "user_action" && (audit.actorType !== "system" || audit.actorUserId !== null))
  ) {
    throw new OpportunityResearchPersistenceConflictError("Workflow delivery actor identity is invalid.");
  }
}

async function loadOpportunityResearchWorkflowSteps(tx: TransactionClient, projectId: string, runId: string) {
  return tx
    .select({
      stepKey: agentRunSteps.stepKey,
      stepKind: agentRunSteps.stepKind,
      agentRole: agentRunSteps.agentRole,
      toolKey: agentRunSteps.toolKey,
      status: agentRunSteps.status,
      executionEpoch: agentRunSteps.executionEpoch,
      completedAt: agentRunSteps.completedAt,
      outputSha256: agentRunSteps.outputSha256,
      outputCanonicalText: agentRunSteps.outputCanonicalText,
      outputJson: agentRunSteps.outputJson
    })
    .from(agentRunSteps)
    .where(and(eq(agentRunSteps.agentRunId, runId), eq(agentRunSteps.projectId, projectId)));
}

function assertCompletedOpportunityResearchLedger(
  steps: Awaited<ReturnType<typeof loadOpportunityResearchWorkflowSteps>>,
  executionEpoch: number,
  output: OpportunityResearchWorkflowOutput,
  outputSha256: string
): void {
  type ExpectedStepIdentity =
    (typeof opportunityResearchStepIdentities)[keyof typeof opportunityResearchStepIdentities];
  const expected = new Map<string, ExpectedStepIdentity>(
    Object.values(opportunityResearchStepIdentities).map((identity) => [identity.stepKey, identity] as const)
  );
  if (steps.length !== expected.size) {
    throw new OpportunityResearchPersistenceConflictError(
      "Opportunity Research requires the exact canonical workflow step set."
    );
  }
  for (const step of steps) {
    if (
      expected.get(step.stepKey)?.stepKind !== step.stepKind ||
      expected.get(step.stepKey)?.agentRole !== step.agentRole ||
      expected.get(step.stepKey)?.toolKey !== step.toolKey ||
      step.status !== "succeeded" ||
      step.executionEpoch <= 0 ||
      step.executionEpoch > executionEpoch ||
      !step.outputSha256 ||
      !step.outputCanonicalText ||
      !step.outputJson
    ) {
      throw new OpportunityResearchPersistenceConflictError(
        "Opportunity Research workflow ledger is incomplete or belongs to an invalid execution history."
      );
    }
    if (canonicalAgentLedgerSha256(step.outputJson) !== step.outputSha256) {
      throw new OpportunityResearchPersistenceConflictError(
        "Opportunity Research workflow checkpoint digest does not match its canonical output."
      );
    }
    if (canonicalAgentLedgerText(step.outputJson) !== step.outputCanonicalText) {
      throw new OpportunityResearchPersistenceConflictError(
        "Opportunity Research workflow checkpoint canonical text does not match its output."
      );
    }
  }
  const researchPlan = steps.find((step) => step.stepKey === opportunityResearchStepKeys.researchPlan);
  const followUpCapture = steps.find((step) => step.stepKey === opportunityResearchStepKeys.followUpCapture);
  const strategy = steps.find((step) => step.stepKey === opportunityResearchStepKeys.strategy);
  if (
    !researchPlan?.completedAt ||
    !followUpCapture?.completedAt ||
    !strategy?.completedAt ||
    researchPlan.executionEpoch > followUpCapture.executionEpoch ||
    followUpCapture.executionEpoch > strategy.executionEpoch ||
    researchPlan.completedAt > followUpCapture.completedAt ||
    followUpCapture.completedAt > strategy.completedAt ||
    !strategy.outputJson ||
    strategy.outputSha256 !== outputSha256
  ) {
    throw new OpportunityResearchPersistenceConflictError(
      "Canonical workflow steps are out of order or the strategy step does not own final output truth."
    );
  }
  const storedOutput = OpportunityResearchWorkflowOutputSchema.safeParse(strategy.outputJson);
  if (
    !storedOutput.success ||
    canonicalAgentLedgerSha256(storedOutput.data) !== outputSha256 ||
    canonicalAgentLedgerSha256(output) !== outputSha256
  ) {
    throw new OpportunityResearchPersistenceConflictError("Strategy step output does not match final workflow truth.");
  }
}

function daysFrom(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1_000);
}

function inArrayValue<T>(value: T, options: readonly T[]): boolean {
  return options.includes(value);
}
