import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { DuckDuckGoHtmlSearchAdapter } from "@localseo/adapters";
import {
  agentRunEvents,
  agentRunEvidenceItems,
  agentRunStepEvidenceLinks,
  agentRunSteps,
  agentRuns,
  areas,
  appendAgentRunEvent,
  bindAgentRunEvidenceSource,
  canonicalAgentLedgerSha256,
  canonicalAgentLedgerText,
  claimAgentRunStep,
  claimOpportunityResearchExecution,
  completeAgentRunStep,
  customers,
  failOpportunityResearchExecution,
  jobRuns,
  opportunities,
  persistOpportunityResearchSuccess,
  projects,
  projectKnowledgeDocuments,
  projectKnowledgeTaskScopes,
  projectKnowledgeVersions,
  projectOpportunityResearchStates,
  publicWebSearchCaptures,
  rankingProofs,
  renewOpportunityResearchExecutionHeartbeat,
  services,
  users,
  type DatabaseClient
} from "@localseo/db";
import { and, eq, sql } from "@localseo/db/query";
import {
  createIntegrationDatabaseClient,
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../packages/db/test-support/integration-database.js";
import type { OpportunityResearchPort } from "@localseo/ai";
import type { Job } from "bullmq";
import { handleOpportunityResearchJob, OpportunityResearchInProgressError } from "./handlers/opportunity-research.js";
import { PersistedDuckDuckGoPublicWebSearch } from "./public-web-search.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;
type SqlClient = IntegrationDatabase["sql"];

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);

void describe(
  "agent execution ledger integration",
  { skip: runIntegration ? false : "TEST_DATABASE_URL is not configured" },
  () => {
    let handle: IntegrationDatabase;
    let db: DatabaseClient;

    before(async () => {
      assert.ok(testDatabaseUrl);
      handle = await createIntegrationTestDatabase(testDatabaseUrl);
      db = handle.db;
    });

    beforeEach(async () => {
      await truncateIntegrationTables(handle.sql);
    });

    after(async () => {
      await handle?.close();
    });

    void it("persists step, evidence, event, and terminal run truth under digest-bound CAS", async () => {
      const fixture = await createFixture(db);
      assert.deepEqual(await claimFixtureExecution(db, fixture, "ledger-test:attempt-1"), {
        kind: "claimed",
        executionEpoch: 1,
        executionRecoveryCount: 0
      });
      const claim = await claimAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepKey: "research-plan-agent.v2",
        stepKind: "agent",
        agentRole: "ResearchAgent",
        eventKey: "step.research.collect_sources.started.1",
        maxAttempts: 3
      });
      assert.equal(claim.kind, "claimed");
      if (claim.kind !== "claimed") throw new Error("Expected the step claim to win.");

      await bindAgentRunEvidenceSource(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepId: claim.stepId,
        role: "input",
        ordinal: 0,
        eventKey: "evidence.ranking.bound",
        evidence: {
          evidenceKey: `ranking_proof:${fixture.proofId}`,
          sourceKind: "ranking_proof",
          sourceId: fixture.proofId,
          sourceVersion: "row-version:1"
        }
      });
      const stepOutput = { findings: [{ key: "ranking-gap", evidenceKey: `ranking_proof:${fixture.proofId}` }] };
      await completeAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepId: claim.stepId,
        expectedRowVersion: claim.rowVersion,
        outputJson: stepOutput,
        eventKey: "step.research.collect_sources.succeeded.1"
      });
      const output = { candidates: [], captures: [], research: { followUpQueries: [], findings: [] } };
      await completeRemainingCanonicalSteps(db, fixture, output);
      const outputSha256 = await markOpportunityResearchSucceeded(db, fixture, output);

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      const [step] = await db.select().from(agentRunSteps).where(eq(agentRunSteps.id, claim.stepId));
      const [evidence] = await db
        .select()
        .from(agentRunEvidenceItems)
        .where(eq(agentRunEvidenceItems.agentRunId, fixture.runId));
      const events = await db.select().from(agentRunEvents).where(eq(agentRunEvents.agentRunId, fixture.runId));
      assert.equal(run?.status, "succeeded");
      assert.equal(run?.outputSha256, outputSha256);
      assert.equal(step?.status, "succeeded");
      assert.equal(step?.outputSha256, canonicalAgentLedgerSha256(stepOutput));
      assert.equal(evidence?.sourceVersion, "row-version:1");
      assert.notEqual(evidence?.payloadSha256, "0".repeat(64));
      assert.equal(evidence?.observedAt.toISOString(), fixture.capturedAt.toISOString());
      assert.equal(evidence?.proofTier, "customer_safe_proof");
      assert.deepEqual(
        events.map((event) => event.eventType),
        [
          "run.queued",
          "run.started",
          "step.started",
          "evidence.bound",
          "step.succeeded",
          "step.started",
          "step.succeeded",
          "step.started",
          "step.succeeded",
          "run.succeeded"
        ]
      );
      await assert.rejects(
        () =>
          db
            .update(agentRunSteps)
            .set({ outputJson: { forged: true } })
            .where(eq(agentRunSteps.id, claim.stepId)),
        postgresErrorMatches(/canonical output must match output JSON|parent run is terminal|immutable/iu)
      );
    });

    void it("rejects checkpoint canonical-byte and digest corruption before workflow completion", async () => {
      const fixture = await createFixture(db);
      await claimFixtureExecution(db, fixture, "checkpoint-integrity:attempt-1");
      const claim = await claimAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepKey: "research-plan-agent.v2",
        stepKind: "agent",
        agentRole: "ResearchAgent",
        eventKey: "step.started.checkpoint-integrity",
        maxAttempts: 3,
        expectedExecutionEpoch: 1
      });
      assert.equal(claim.kind, "claimed");
      if (claim.kind !== "claimed") return;
      const output = { z: "last", a: "first" };
      await completeAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepId: claim.stepId,
        expectedRowVersion: claim.rowVersion,
        expectedExecutionEpoch: 1,
        outputJson: output,
        eventKey: "step.succeeded.checkpoint-integrity"
      });
      const [stored] = await db.select().from(agentRunSteps).where(eq(agentRunSteps.id, claim.stepId));
      assert.equal(stored?.outputCanonicalText, canonicalAgentLedgerText(output));

      await assert.rejects(
        () =>
          db
            .update(agentRunSteps)
            .set({ outputCanonicalText: '{"a":"changed","z":"last"}' })
            .where(eq(agentRunSteps.id, claim.stepId)),
        postgresErrorMatches(/canonical output must match output JSON/iu)
      );
      await assert.rejects(
        () =>
          db
            .update(agentRunSteps)
            .set({ outputSha256: "0".repeat(64) })
            .where(eq(agentRunSteps.id, claim.stepId)),
        postgresErrorMatches(/digest must match canonical output bytes/iu)
      );
    });

    void it("renews only the exact current Opportunity Research execution heartbeat", async () => {
      const fixture = await createFixture(db);
      const claimedAt = new Date("2026-08-09T10:00:00.000Z");
      const executionClaimToken = "heartbeat-owner:attempt-1";
      const claim = await claimOpportunityResearchExecution(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        materialDigest: fixture.materialDigest,
        triggerSource: "user_action",
        jobRunId: fixture.jobRunId,
        executionClaimToken,
        occurredAt: claimedAt
      });
      assert.deepEqual(claim, { kind: "claimed", executionEpoch: 1, executionRecoveryCount: 0 });

      assert.equal(
        await renewOpportunityResearchExecutionHeartbeat(db, {
          projectId: fixture.projectId,
          runId: fixture.runId,
          expectedExecutionEpoch: 1,
          expectedExecutionClaimToken: "stale-owner",
          expectedExecutionRecoveryCount: 0,
          occurredAt: new Date(claimedAt.getTime() + 1_000)
        }),
        false
      );
      assert.equal(
        await renewOpportunityResearchExecutionHeartbeat(db, {
          projectId: fixture.projectId,
          runId: fixture.runId,
          expectedExecutionEpoch: 1,
          expectedExecutionClaimToken: executionClaimToken,
          expectedExecutionRecoveryCount: 0,
          occurredAt: new Date(claimedAt.getTime() + 2_000)
        }),
        true
      );
      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.lastHeartbeatAt?.toISOString(), "2026-08-09T10:00:02.000Z");
    });

    void it("rejects direct prior-epoch workflow events after execution takeover", async () => {
      const fixture = await createFixture(db);
      await claimFixtureExecution(db, fixture, "prior-event:attempt-1");
      const recoveryJobRunId = await recordRecoveryClaim(db, fixture, 1);
      assert.deepEqual(
        await claimOpportunityResearchExecution(db, {
          projectId: fixture.projectId,
          runId: fixture.runId,
          materialDigest: fixture.materialDigest,
          triggerSource: "work_recovery",
          jobRunId: recoveryJobRunId,
          expectedRecoveryCount: 1,
          executionClaimToken: `${recoveryJobRunId}:attempt-1`
        }),
        { kind: "claimed", executionEpoch: 2, executionRecoveryCount: 1 }
      );

      await assert.rejects(
        () =>
          db.insert(agentRunEvents).values({
            projectId: fixture.projectId,
            agentRunId: fixture.runId,
            eventKey: "forged.prior-epoch.event",
            eventType: "recovery.claimed",
            executionEpoch: 1,
            payloadJson: { executionRecoveryCount: 0 },
            occurredAt: new Date()
          }),
        postgresErrorMatches(/must bind the current workflow execution epoch/iu)
      );
    });

    void it("locks an evidence source before the workflow run to prevent the recovery lock cycle", async () => {
      assert.ok(testDatabaseUrl);
      const fixture = await createFixture(db);
      await claimFixtureExecution(db, fixture, "evidence-lock-order:attempt-1");
      const claim = await claimAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepKey: "research-plan-agent.v2",
        stepKind: "agent",
        agentRole: "ResearchAgent",
        eventKey: "step.started.evidence-lock-order",
        maxAttempts: 3,
        expectedExecutionEpoch: 1
      });
      assert.equal(claim.kind, "claimed");
      if (claim.kind !== "claimed") return;

      const runBlocker = createIntegrationDatabaseClient(testDatabaseUrl);
      const evidenceHandle = createIntegrationDatabaseClient(testDatabaseUrl);
      const sourceContender = createIntegrationDatabaseClient(testDatabaseUrl);
      let heldRun: HeldDatabaseLock | undefined;
      let bindingDone: Promise<unknown> | undefined;
      let contenderDone: Promise<unknown> | undefined;
      let bindingSettled = false;
      let contenderSettled = false;

      try {
        heldRun = await startHeldAgentRunLock(runBlocker.sql, fixture.runId);
        const evidencePid = await backendPid(evidenceHandle.sql);
        bindingDone = bindAgentRunEvidenceSource(evidenceHandle.db, {
          projectId: fixture.projectId,
          runId: fixture.runId,
          stepId: claim.stepId,
          role: "input",
          ordinal: 0,
          eventKey: "evidence.bound.evidence-lock-order",
          expectedExecutionEpoch: 1,
          evidence: {
            evidenceKey: `ranking_proof:${fixture.proofId}`,
            sourceKind: "ranking_proof",
            sourceId: fixture.proofId,
            sourceVersion: "row-version:1"
          }
        }).finally(() => {
          bindingSettled = true;
        });
        await waitForBlockingPid(handle.sql, {
          blockedPid: evidencePid,
          blockingPid: heldRun.pid,
          isSettled: () => bindingSettled
        });

        const contenderPid = await backendPid(sourceContender.sql);
        contenderDone = sourceContender.sql
          .begin(async (tx) => {
            await tx`SELECT "id" FROM "ranking_proofs" WHERE "id" = ${fixture.proofId} FOR UPDATE`;
          })
          .finally(() => {
            contenderSettled = true;
          });
        await waitForBlockingPid(handle.sql, {
          blockedPid: contenderPid,
          blockingPid: evidencePid,
          isSettled: () => contenderSettled
        });

        heldRun.commit();
        await heldRun.done;
        await bindingDone;
        await contenderDone;
        const [evidence] = await db
          .select()
          .from(agentRunEvidenceItems)
          .where(eq(agentRunEvidenceItems.agentRunId, fixture.runId));
        const [proof] = await db.select().from(rankingProofs).where(eq(rankingProofs.id, fixture.proofId));
        assert.equal(evidence?.sourceId, fixture.proofId);
        assert.equal(proof?.rowVersion, 1);
      } finally {
        heldRun?.rollback();
        await heldRun?.done.catch(() => undefined);
        await bindingDone?.catch(() => undefined);
        await contenderDone?.catch(() => undefined);
        await runBlocker.close();
        await evidenceHandle.close();
        await sourceContender.close();
      }
    });

    void it("rejects event-key semantic reuse and cross-project evidence", async () => {
      const fixture = await createFixture(db);
      const other = await createFixture(db);
      await claimFixtureExecution(db, fixture, "event-reuse:attempt-1");
      await appendAgentRunEvent(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        eventKey: "qa.result",
        eventType: "qa.gate.passed",
        payload: { gate: "evidence" }
      });
      await assert.rejects(
        () =>
          appendAgentRunEvent(db, {
            projectId: fixture.projectId,
            runId: fixture.runId,
            eventKey: "qa.result",
            eventType: "qa.gate.failed",
            payload: { gate: "evidence" }
          }),
        postgresErrorMatches(/idempotency key/iu)
      );
      const claim = await claimAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepKey: "research.cross_project",
        stepKind: "qa",
        eventKey: "step.cross-project.started.1",
        maxAttempts: 1
      });
      assert.equal(claim.kind, "claimed");
      if (claim.kind !== "claimed") return;
      await assert.rejects(
        () =>
          bindAgentRunEvidenceSource(db, {
            projectId: fixture.projectId,
            runId: fixture.runId,
            stepId: claim.stepId,
            role: "input",
            ordinal: 0,
            eventKey: "evidence.cross-project",
            evidence: {
              evidenceKey: `ranking_proof:${other.proofId}`,
              sourceKind: "ranking_proof",
              sourceId: other.proofId,
              sourceVersion: "row-version:1"
            }
          }),
        postgresErrorMatches(/no longer current and admissible/iu)
      );
    });

    void it("rejects evidence binding after the selected ranking proof becomes invalidated", async () => {
      const fixture = await createFixture(db);
      await claimFixtureExecution(db, fixture, "source-version-drift:attempt-1");
      const claim = await claimAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepKey: "research.source-version-drift",
        stepKind: "qa",
        eventKey: "step.source-version-drift.started.1",
        maxAttempts: 1,
        expectedExecutionEpoch: 1
      });
      assert.equal(claim.kind, "claimed");
      if (claim.kind !== "claimed") return;

      await db
        .update(rankingProofs)
        .set({
          status: "invalidated",
          invalidatedAt: new Date(),
          invalidatedByUserId: fixture.userId,
          invalidationReason: "The selected proof was superseded before evidence binding."
        })
        .where(eq(rankingProofs.id, fixture.proofId));

      await assert.rejects(
        () =>
          bindAgentRunEvidenceSource(db, {
            projectId: fixture.projectId,
            runId: fixture.runId,
            stepId: claim.stepId,
            role: "input",
            ordinal: 0,
            eventKey: "evidence.source-version-drift",
            expectedExecutionEpoch: 1,
            evidence: {
              evidenceKey: `ranking_proof:${fixture.proofId}`,
              sourceKind: "ranking_proof",
              sourceId: fixture.proofId,
              sourceVersion: "row-version:1"
            }
          }),
        postgresErrorMatches(/no longer current and admissible/iu)
      );

      const evidence = await db
        .select()
        .from(agentRunEvidenceItems)
        .where(eq(agentRunEvidenceItems.agentRunId, fixture.runId));
      assert.equal(evidence.length, 0);
    });

    void it("rejects rebinding immutable evidence after its durable source becomes ineligible", async () => {
      const fixture = await createFixture(db);
      await claimFixtureExecution(db, fixture, "source-invalidation:attempt-1");
      const firstStep = await claimAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepKey: "research.source-before-invalidation",
        stepKind: "agent",
        agentRole: "ResearchAgent",
        eventKey: "step.source-before-invalidation.started",
        maxAttempts: 1,
        expectedExecutionEpoch: 1
      });
      assert.equal(firstStep.kind, "claimed");
      if (firstStep.kind !== "claimed") return;
      const bound = await bindAgentRunEvidenceSource(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepId: firstStep.stepId,
        role: "input",
        ordinal: 0,
        eventKey: "evidence.source-before-invalidation",
        expectedExecutionEpoch: 1,
        evidence: {
          evidenceKey: `ranking_proof:${fixture.proofId}`,
          sourceKind: "ranking_proof",
          sourceId: fixture.proofId,
          sourceVersion: "row-version:1"
        }
      });
      await db
        .update(rankingProofs)
        .set({
          status: "invalidated",
          invalidatedAt: new Date(),
          invalidatedByUserId: fixture.userId,
          invalidationReason: "The reviewed observation was superseded."
        })
        .where(eq(rankingProofs.id, fixture.proofId));
      const secondStep = await claimAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepKey: "research.source-after-invalidation",
        stepKind: "agent",
        agentRole: "ResearchAgent",
        eventKey: "step.source-after-invalidation.started",
        maxAttempts: 1,
        expectedExecutionEpoch: 1
      });
      assert.equal(secondStep.kind, "claimed");
      if (secondStep.kind !== "claimed") return;

      await assert.rejects(
        () =>
          bindAgentRunEvidenceSource(db, {
            projectId: fixture.projectId,
            runId: fixture.runId,
            stepId: secondStep.stepId,
            role: "input",
            ordinal: 0,
            eventKey: "evidence.source-after-invalidation",
            expectedExecutionEpoch: 1,
            evidence: {
              evidenceKey: `ranking_proof:${fixture.proofId}`,
              sourceKind: "ranking_proof",
              sourceId: fixture.proofId,
              sourceVersion: "row-version:1"
            }
          }),
        postgresErrorMatches(/no longer current and admissible/iu)
      );
      await assert.rejects(
        () =>
          db.insert(agentRunStepEvidenceLinks).values({
            projectId: fixture.projectId,
            agentRunId: fixture.runId,
            agentRunStepId: secondStep.stepId,
            evidenceItemId: bound.evidenceItemId,
            role: "input",
            ordinal: 0
          }),
        postgresErrorMatches(/no longer current and admissible/iu)
      );
    });

    void it("rejects operator-only knowledge at application and direct database evidence boundaries", async () => {
      const fixture = await createFixture(db);
      await claimFixtureExecution(db, fixture, "operator-only-knowledge:attempt-1");
      const step = await claimAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepKey: "research.operator-only-knowledge",
        stepKind: "agent",
        agentRole: "ResearchAgent",
        eventKey: "step.operator-only-knowledge.started",
        maxAttempts: 1,
        expectedExecutionEpoch: 1
      });
      assert.equal(step.kind, "claimed");
      if (step.kind !== "claimed") return;

      const [document] = await db
        .insert(projectKnowledgeDocuments)
        .values({ projectId: fixture.projectId, documentKey: `operator-only.${randomUUID()}` })
        .returning();
      assert.ok(document);
      const bodyMarkdown = "# Operator note\n\nThis context must remain outside model egress.";
      const contentSha256 = createHash("sha256").update(bodyMarkdown, "utf8").digest("hex");
      const [proposed] = await db
        .insert(projectKnowledgeVersions)
        .values({
          documentId: document.id,
          projectId: fixture.projectId,
          version: 1,
          title: "Operator note",
          bodyMarkdown,
          sourceKind: "human",
          modelUsePolicy: "operator_only",
          contentSha256,
          createdByUserId: fixture.userId
        })
        .returning();
      assert.ok(proposed);
      await db.insert(projectKnowledgeTaskScopes).values({
        projectId: fixture.projectId,
        versionId: proposed.id,
        taskScope: "opportunity_research"
      });
      const [approved] = await db
        .update(projectKnowledgeVersions)
        .set({ status: "approved", reviewedByUserId: fixture.userId, reviewedAt: new Date() })
        .where(eq(projectKnowledgeVersions.id, proposed.id))
        .returning();
      assert.ok(approved);
      await db
        .update(projectKnowledgeDocuments)
        .set({ currentApprovedVersionId: approved.id, updatedAt: new Date() })
        .where(eq(projectKnowledgeDocuments.id, document.id));
      const evidence = {
        evidenceKey: `knowledge_version:${approved.id}`,
        sourceKind: "knowledge_version" as const,
        sourceId: approved.id,
        sourceVersion: `sha256:${contentSha256}`
      };
      await assert.rejects(
        () =>
          bindAgentRunEvidenceSource(db, {
            projectId: fixture.projectId,
            runId: fixture.runId,
            stepId: step.stepId,
            role: "input",
            ordinal: 0,
            eventKey: "evidence.operator-only-knowledge",
            expectedExecutionEpoch: 1,
            evidence
          }),
        postgresErrorMatches(/no longer current and admissible/iu)
      );
      await assert.rejects(
        () =>
          db.insert(agentRunEvidenceItems).values({
            projectId: fixture.projectId,
            agentRunId: fixture.runId,
            evidenceKey: evidence.evidenceKey,
            sourceKind: evidence.sourceKind,
            sourceId: evidence.sourceId,
            sourceVersion: evidence.sourceVersion,
            executionEpoch: 1,
            payloadSha256: "0".repeat(64),
            observedAt: new Date(),
            proofTier: "supporting_context",
            evidenceJson: {}
          }),
        postgresErrorMatches(/no longer current and admissible/iu)
      );
    });

    void it("keeps the active owner alive on final-attempt redelivery and replays succeeded product truth", async () => {
      const fixture = await createFixture(db);
      const claim = await claimOpportunityResearchExecution(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        materialDigest: fixture.materialDigest,
        triggerSource: "user_action",
        jobRunId: fixture.jobRunId,
        executionClaimToken: `${fixture.jobRunId}:attempt-3`
      });
      assert.equal(claim.kind, "claimed");
      let portCalls = 0;
      const port: OpportunityResearchPort = {
        run: () => {
          portCalls += 1;
          throw new Error("The duplicate delivery must not call Mastra.");
        }
      };
      const job = opportunityResearchJob(fixture, 2, 3);
      await assert.rejects(() => handleOpportunityResearchJob(job, { db }, port), OpportunityResearchInProgressError);
      const [stillRunning] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(stillRunning?.status, "running");
      assert.equal(portCalls, 0);

      const output = { candidates: [], captures: [], research: { followUpQueries: [], findings: [] } };
      await completeCanonicalWorkflowSteps(db, fixture, output);
      const outputSha256 = await markOpportunityResearchSucceeded(db, fixture, output);
      const replay = await handleOpportunityResearchJob(opportunityResearchJob(fixture, 0, 3), { db }, port);
      assert.equal(replay.status, "succeeded");
      assert.equal(replay.replayed, true);
      assert.equal(replay.outputSha256, outputSha256);
      assert.equal(portCalls, 0);
    });

    void it("does not automatically reschedule unchanged material after a model egress block", async () => {
      const fixture = await createFixture(db);
      await claimFixtureExecution(db, fixture, "model-egress-blocked:attempt-1");

      assert.equal(
        await failOpportunityResearchExecution(db, {
          projectId: fixture.projectId,
          runId: fixture.runId,
          failureCode: "model_egress_blocked",
          failureMessage: "Model egress was blocked by deterministic policy.",
          needsResearch: false,
          suppressAutomaticRetry: true,
          expectedExecutionEpoch: 1
        }),
        true
      );

      const [state] = await db
        .select()
        .from(projectOpportunityResearchStates)
        .where(eq(projectOpportunityResearchStates.projectId, fixture.projectId));
      assert.equal(state?.status, "failed");
      assert.equal(state?.activeRunId, null);
      assert.equal(state?.nextScheduledAt, null);
    });

    void it("fences stale recovered deliveries by recovery generation and execution epoch", async () => {
      const fixture = await createFixture(db);
      await claimOpportunityResearchExecution(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        materialDigest: fixture.materialDigest,
        triggerSource: "user_action",
        jobRunId: fixture.jobRunId,
        executionClaimToken: "initial-delivery:attempt-1"
      });

      const firstRecoveryJobRunId = await recordRecoveryClaim(db, fixture, 1);
      const lateOriginal = await claimOpportunityResearchExecution(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        materialDigest: fixture.materialDigest,
        triggerSource: "user_action",
        jobRunId: fixture.jobRunId,
        executionClaimToken: "late-original-delivery:attempt-2"
      });
      assert.deepEqual(lateOriginal, { kind: "claimed", executionEpoch: 2, executionRecoveryCount: 0 });
      const firstRecovery = await claimOpportunityResearchExecution(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        materialDigest: fixture.materialDigest,
        triggerSource: "work_recovery",
        jobRunId: firstRecoveryJobRunId,
        expectedRecoveryCount: 1,
        executionClaimToken: `${firstRecoveryJobRunId}:attempt-1`
      });
      assert.deepEqual(firstRecovery, { kind: "claimed", executionEpoch: 3, executionRecoveryCount: 1 });
      const duplicateFirstRecovery = await claimOpportunityResearchExecution(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        materialDigest: fixture.materialDigest,
        triggerSource: "work_recovery",
        jobRunId: firstRecoveryJobRunId,
        expectedRecoveryCount: 1,
        executionClaimToken: `${firstRecoveryJobRunId}:attempt-1`
      });
      assert.deepEqual(duplicateFirstRecovery, { kind: "already_running" });

      const staleStep = await claimAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepKey: "research.recovery-epoch",
        stepKind: "agent",
        agentRole: "research_agent",
        eventKey: "step.recovery-epoch.started.1",
        maxAttempts: 3,
        expectedExecutionEpoch: 3
      });
      assert.equal(staleStep.kind, "claimed");
      if (staleStep.kind !== "claimed") return;

      const secondRecoveryJobRunId = await recordRecoveryClaim(db, fixture, 2);
      const secondRecovery = await claimOpportunityResearchExecution(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        materialDigest: fixture.materialDigest,
        triggerSource: "work_recovery",
        jobRunId: secondRecoveryJobRunId,
        expectedRecoveryCount: 2,
        executionClaimToken: `${secondRecoveryJobRunId}:attempt-1`
      });
      assert.deepEqual(secondRecovery, { kind: "claimed", executionEpoch: 4, executionRecoveryCount: 2 });

      await assert.rejects(
        () =>
          completeAgentRunStep(db, {
            projectId: fixture.projectId,
            runId: fixture.runId,
            stepId: staleStep.stepId,
            expectedRowVersion: staleStep.rowVersion,
            expectedExecutionEpoch: 3,
            outputJson: { stale: true },
            eventKey: "step.recovery-epoch.stale-success"
          }),
        /execution epoch no longer owns/iu
      );
      await assert.rejects(
        () =>
          appendAgentRunEvent(db, {
            projectId: fixture.projectId,
            runId: fixture.runId,
            expectedExecutionEpoch: 3,
            eventKey: "stale.execution.event",
            eventType: "qa.gate.passed"
          }),
        /execution epoch no longer owns/iu
      );
      assert.equal(
        await failOpportunityResearchExecution(db, {
          projectId: fixture.projectId,
          runId: fixture.runId,
          expectedExecutionEpoch: 3,
          failureCode: "stale_delivery_failed",
          failureMessage: "A stale delivery must not terminalize the current owner."
        }),
        false
      );
      await assert.rejects(
        () =>
          claimOpportunityResearchExecution(db, {
            projectId: fixture.projectId,
            runId: fixture.runId,
            materialDigest: fixture.materialDigest,
            triggerSource: "work_recovery",
            jobRunId: firstRecoveryJobRunId,
            expectedRecoveryCount: 1,
            executionClaimToken: `${firstRecoveryJobRunId}:attempt-2`
          }),
        /current recovery generation/iu
      );

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.status, "running");
      assert.equal(run?.executionEpoch, 4);
      assert.equal(run?.recoveryCount, 2);
    });

    void it("rejects Mastra success replay without the exact three canonical workflow steps", async () => {
      const fixture = await createFixture(db);
      await claimFixtureExecution(db, fixture, "zero-step-replay:attempt-1");
      const output = { candidates: [], captures: [], research: { followUpQueries: [], findings: [] } };
      await assert.rejects(
        () =>
          persistOpportunityResearchSuccess(db, {
            projectId: fixture.projectId,
            runId: fixture.runId,
            materialDigest: fixture.materialDigest,
            output,
            candidates: [],
            provider: "test",
            model: "test",
            expectedExecutionEpoch: 1
          }),
        /exact canonical workflow step set/iu
      );
      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.status, "running");
    });

    void it("reuses immutable succeeded checkpoints across a recovery execution epoch", async () => {
      const fixture = await createFixture(db);
      await claimFixtureExecution(db, fixture, "checkpoint-replay:attempt-1");
      const plan = await claimAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepKey: "research-plan-agent.v2",
        stepKind: "agent",
        agentRole: "ResearchAgent",
        eventKey: "step.started.checkpoint-replay.plan",
        maxAttempts: 3,
        expectedExecutionEpoch: 1
      });
      assert.equal(plan.kind, "claimed");
      if (plan.kind !== "claimed") return;
      await completeAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepId: plan.stepId,
        expectedRowVersion: plan.rowVersion,
        expectedExecutionEpoch: 1,
        outputJson: { planned: true },
        eventKey: "step.succeeded.checkpoint-replay.plan"
      });

      const recoveryJobRunId = await recordRecoveryClaim(db, fixture, 1);
      assert.deepEqual(
        await claimOpportunityResearchExecution(db, {
          projectId: fixture.projectId,
          runId: fixture.runId,
          materialDigest: fixture.materialDigest,
          triggerSource: "work_recovery",
          jobRunId: recoveryJobRunId,
          expectedRecoveryCount: 1,
          executionClaimToken: `${recoveryJobRunId}:attempt-1`
        }),
        { kind: "claimed", executionEpoch: 2, executionRecoveryCount: 1 }
      );
      assert.deepEqual(
        await claimAgentRunStep(db, {
          projectId: fixture.projectId,
          runId: fixture.runId,
          stepKey: "research-plan-agent.v2",
          stepKind: "agent",
          agentRole: "ResearchAgent",
          eventKey: "step.started.checkpoint-replay.plan",
          maxAttempts: 3,
          expectedExecutionEpoch: 2
        }),
        { kind: "already_succeeded", stepId: plan.stepId }
      );
      const output = { candidates: [], captures: [], research: { followUpQueries: [], findings: [] } };
      await completeRemainingCanonicalSteps(db, fixture, output, 2);
      await assert.rejects(
        () =>
          persistOpportunityResearchSuccess(db, {
            projectId: fixture.projectId,
            runId: fixture.runId,
            materialDigest: fixture.materialDigest,
            output,
            candidates: [],
            provider: "test",
            model: "test",
            expectedExecutionEpoch: 2
          }),
        /material changed before persistence/iu
      );
      await markOpportunityResearchSucceeded(db, fixture, output);
      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.status, "succeeded");
      assert.equal(run?.executionEpoch, 2);
    });

    void it("rejects direct SQL workflow success with unresolved or incomplete ledger truth", async () => {
      const fixture = await createFixture(db);
      await claimFixtureExecution(db, fixture, "direct-success-forgery:attempt-1");
      await db.insert(agentRunSteps).values({
        projectId: fixture.projectId,
        agentRunId: fixture.runId,
        stepKey: "research-plan-agent.v2",
        stepKind: "agent",
        agentRole: "ResearchAgent"
      });
      const output = { candidates: [], captures: [], research: { followUpQueries: [], findings: [] } };
      const outputSha256 = canonicalAgentLedgerSha256(output);
      const completedAt = new Date();
      await assert.rejects(
        () =>
          db.transaction(async (tx) => {
            await tx
              .update(agentRuns)
              .set({ status: "succeeded", outputJson: output, outputSha256, completedAt, updatedAt: completedAt })
              .where(eq(agentRuns.id, fixture.runId));
            await tx
              .update(projectOpportunityResearchStates)
              .set({
                status: "succeeded",
                activeRunId: null,
                lastSuccessfulDigest: fixture.materialDigest,
                updatedAt: completedAt
              })
              .where(eq(projectOpportunityResearchStates.projectId, fixture.projectId));
            await tx.insert(agentRunEvents).values({
              projectId: fixture.projectId,
              agentRunId: fixture.runId,
              eventKey: "run.succeeded",
              eventType: "run.succeeded",
              executionEpoch: 1,
              payloadJson: { outputSha256 },
              occurredAt: completedAt
            });
          }),
        /exact completed workflow ledger|unresolved workflow steps/iu
      );
      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      const [state] = await db
        .select()
        .from(projectOpportunityResearchStates)
        .where(eq(projectOpportunityResearchStates.projectId, fixture.projectId));
      assert.equal(run?.status, "running");
      assert.equal(state?.status, "running");
    });

    void it("rejects workflow success when a canonical step uses the wrong tool identity", async () => {
      const fixture = await createFixture(db);
      await claimFixtureExecution(db, fixture, "step-identity-forgery:attempt-1");
      const output = { candidates: [], captures: [], research: { followUpQueries: [], findings: [] } };
      const plan = await claimAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepKey: "research-plan-agent.v2",
        stepKind: "agent",
        agentRole: "ResearchAgent",
        eventKey: "step.started.step-identity-forgery.plan",
        maxAttempts: 3,
        expectedExecutionEpoch: 1
      });
      assert.equal(plan.kind, "claimed");
      if (plan.kind !== "claimed") return;
      await completeAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepId: plan.stepId,
        expectedRowVersion: plan.rowVersion,
        expectedExecutionEpoch: 1,
        outputJson: { planned: true },
        eventKey: "step.succeeded.step-identity-forgery.plan"
      });
      await completeRemainingCanonicalSteps(db, fixture, output, 1, "public_web_search");

      await assert.rejects(
        () =>
          persistOpportunityResearchSuccess(db, {
            projectId: fixture.projectId,
            runId: fixture.runId,
            materialDigest: fixture.materialDigest,
            output,
            candidates: [],
            provider: "test",
            model: "test",
            expectedExecutionEpoch: 1
          }),
        /invalid execution history/iu
      );
      await assert.rejects(
        () => markOpportunityResearchSucceeded(db, fixture, output),
        /exact completed workflow ledger/iu
      );
      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.status, "running");
    });

    void it("rejects cross-project research opportunities even when the source workflow succeeded", async () => {
      const fixture = await createFixture(db);
      const other = await createFixture(db);
      await claimFixtureExecution(db, fixture, "opportunity-source-truth:attempt-1");
      const output = { candidates: [], captures: [], research: { followUpQueries: [], findings: [] } };
      await completeCanonicalWorkflowSteps(db, fixture, output);
      await markOpportunityResearchSucceeded(db, fixture, output);
      const otherEntities = await createConfirmedEntityPair(db, other);

      await assert.rejects(
        () =>
          db.insert(opportunities).values({
            projectId: fixture.projectId,
            agentRunId: fixture.runId,
            serviceId: otherEntities.serviceId,
            areaId: otherEntities.areaId,
            primaryKeyword: "cross-project candidate",
            policyVersion: "opportunity-portfolio.v1",
            researchMaterialDigest: fixture.materialDigest,
            candidateKey: `cross-project:${randomUUID()}`,
            rankingMilestone: "unverified",
            evidenceReadiness: "supporting_context",
            businessValue: "medium",
            marketDifficulty: "medium",
            executionEffort: "medium",
            lane: "quick_win",
            evidenceJson: { workflowVersion: "opportunity-research.v2" }
          }),
        /confirmed same-project service and area truth/iu
      );
      assert.equal((await db.select().from(opportunities)).length, 0);
    });

    void it("reclaims prior-epoch running steps when a genuine transport retry takes execution ownership", async () => {
      const fixture = await createFixture(db);
      const initial = await claimOpportunityResearchExecution(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        materialDigest: fixture.materialDigest,
        triggerSource: "user_action",
        jobRunId: fixture.jobRunId,
        executionClaimToken: `${fixture.runId}:attempt-1`
      });
      assert.deepEqual(initial, { kind: "claimed", executionEpoch: 1, executionRecoveryCount: 0 });
      const firstStep = await claimAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepKey: "research.transport-retry",
        stepKind: "agent",
        agentRole: "research_agent",
        eventKey: "step.transport-retry.started",
        maxAttempts: 3,
        expectedExecutionEpoch: 1
      });
      assert.equal(firstStep.kind, "claimed");
      if (firstStep.kind !== "claimed") return;
      await bindAgentRunEvidenceSource(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepId: firstStep.stepId,
        role: "input",
        ordinal: 0,
        eventKey: "evidence.transport-retry.epoch-1",
        expectedExecutionEpoch: 1,
        evidence: {
          evidenceKey: `ranking_proof:${fixture.proofId}`,
          sourceKind: "ranking_proof",
          sourceId: fixture.proofId,
          sourceVersion: "row-version:1"
        }
      });

      const retry = await claimOpportunityResearchExecution(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        materialDigest: fixture.materialDigest,
        triggerSource: "user_action",
        jobRunId: fixture.jobRunId,
        executionClaimToken: `${fixture.runId}:attempt-2`
      });
      assert.deepEqual(retry, { kind: "claimed", executionEpoch: 2, executionRecoveryCount: 0 });
      const [superseded] = await db.select().from(agentRunSteps).where(eq(agentRunSteps.id, firstStep.stepId));
      assert.equal(superseded?.status, "failed");
      assert.equal(superseded?.failureCode, "execution_superseded");

      const retriedStep = await claimAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepKey: "research.transport-retry",
        stepKind: "agent",
        agentRole: "research_agent",
        eventKey: "step.transport-retry.started",
        maxAttempts: 3,
        expectedExecutionEpoch: 2
      });
      assert.equal(retriedStep.kind, "claimed");
      if (retriedStep.kind !== "claimed") return;
      assert.equal(retriedStep.attemptCount, 2);
      await bindAgentRunEvidenceSource(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepId: retriedStep.stepId,
        role: "input",
        ordinal: 0,
        eventKey: "evidence.transport-retry.epoch-2",
        expectedExecutionEpoch: 2,
        evidence: {
          evidenceKey: `ranking_proof:${fixture.proofId}`,
          sourceKind: "ranking_proof",
          sourceId: fixture.proofId,
          sourceVersion: "row-version:1"
        }
      });
      const evidence = await db
        .select()
        .from(agentRunEvidenceItems)
        .where(eq(agentRunEvidenceItems.agentRunId, fixture.runId));
      const links = await db
        .select()
        .from(agentRunStepEvidenceLinks)
        .where(eq(agentRunStepEvidenceLinks.agentRunStepId, retriedStep.stepId));
      assert.equal(evidence.length, 1);
      assert.equal(evidence[0]?.executionEpoch, 1);
      assert.equal(links.length, 1);
    });

    void it("rejects a stale provider response before capture persistence and binds current request identity", async () => {
      const fixture = await createFixture(db);
      const initial = await claimOpportunityResearchExecution(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        materialDigest: fixture.materialDigest,
        triggerSource: "user_action",
        jobRunId: fixture.jobRunId,
        executionClaimToken: "initial-search-delivery:attempt-1"
      });
      assert.deepEqual(initial, { kind: "claimed", executionEpoch: 1, executionRecoveryCount: 0 });

      let releaseProvider: (() => void) | undefined;
      const providerReleased = new Promise<void>((resolve) => {
        releaseProvider = resolve;
      });
      let markProviderStarted: (() => void) | undefined;
      const providerStarted = new Promise<void>((resolve) => {
        markProviderStarted = resolve;
      });
      let providerCalls = 0;
      const provider = new DuckDuckGoHtmlSearchAdapter({
        fetchImpl: async () => {
          providerCalls += 1;
          markProviderStarted?.();
          await providerReleased;
          return new Response(
            '<html lang="de"><div class="result"><a class="result__a" href="https://example.test/result">Result</a><div class="result__snippet">Evidence</div></div></html>',
            { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
          );
        }
      });
      const search = new PersistedDuckDuckGoPublicWebSearch(db, provider);
      const request = {
        projectId: fixture.projectId,
        runId: fixture.runId,
        executionEpoch: 1,
        query: "gebaeudereinigung dachau",
        requestedLocale: "de-DE",
        requestedRegion: "de-de",
        researchOrdinal: 1,
        round: 1,
        maxResults: 3
      } as const;
      const staleSearch = search.search(request);
      await providerStarted;

      const recoveryJobRunId = await recordRecoveryClaim(db, fixture, 1);
      const recovered = await claimOpportunityResearchExecution(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        materialDigest: fixture.materialDigest,
        triggerSource: "work_recovery",
        jobRunId: recoveryJobRunId,
        expectedRecoveryCount: 1,
        executionClaimToken: `${recoveryJobRunId}:attempt-1`
      });
      assert.deepEqual(recovered, { kind: "claimed", executionEpoch: 2, executionRecoveryCount: 1 });
      releaseProvider?.();

      await assert.rejects(staleSearch, /no longer owns/iu);
      assert.equal((await db.select().from(publicWebSearchCaptures)).length, 0);

      const currentCapture = await search.search({ ...request, executionEpoch: 2 });
      assert.equal(currentCapture.executionEpoch, 2);
      assert.equal(currentCapture.requestedRegion, "de-de");
      assert.equal(currentCapture.maxResults, 3);
      assert.equal(currentCapture.results[0]?.url, "https://example.test/result");
      assert.equal(providerCalls, 2);
      const [persistedCapture] = await db
        .select()
        .from(publicWebSearchCaptures)
        .where(eq(publicWebSearchCaptures.id, currentCapture.id));
      assert.equal(persistedCapture?.executionEpoch, 2);
      assert.equal(persistedCapture?.requestedRegion, "de-de");
      assert.equal(persistedCapture?.maxResults, 3);
      const evidenceStep = await claimAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepKey: "research.capture-identity",
        stepKind: "qa",
        eventKey: "step.capture-identity.started",
        maxAttempts: 1,
        expectedExecutionEpoch: 2
      });
      assert.equal(evidenceStep.kind, "claimed");
      if (evidenceStep.kind !== "claimed") return;
      await bindAgentRunEvidenceSource(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepId: evidenceStep.stepId,
        role: "captured",
        ordinal: 0,
        evidence: {
          evidenceKey: `public_web_search_capture:${currentCapture.id}`,
          sourceKind: "public_web_search_capture",
          sourceId: currentCapture.id,
          sourceVersion: `captured-at:${currentCapture.capturedAt}`
        },
        expectedExecutionEpoch: 2,
        eventKey: "evidence.capture-identity.bound"
      });
      const [captureEvidence] = await db
        .select()
        .from(agentRunEvidenceItems)
        .where(eq(agentRunEvidenceItems.sourceId, currentCapture.id));
      assert.equal(captureEvidence?.executionEpoch, 2);
    });

    void it("requires lifecycle events and freezes terminal workflow truth", async () => {
      const fixture = await createFixture(db);
      await assert.rejects(
        () =>
          db
            .update(projectOpportunityResearchStates)
            .set({ status: "failed", activeRunId: null })
            .where(eq(projectOpportunityResearchStates.projectId, fixture.projectId)),
        /cannot abandon an active workflow run/iu
      );
      await assert.rejects(
        () =>
          db
            .update(agentRuns)
            .set({
              status: "running",
              startedAt: new Date(),
              executionEpoch: 1,
              executionClaimToken: "forged-without-event",
              updatedAt: new Date()
            })
            .where(eq(agentRuns.id, fixture.runId)),
        /requires its exact durable event/iu
      );
      await claimFixtureExecution(db, fixture, "lifecycle-test:attempt-1");
      await assert.rejects(
        () =>
          db.insert(agentRunEvents).values({
            projectId: fixture.projectId,
            agentRunId: fixture.runId,
            eventKey: "qa.stale-epoch",
            eventType: "qa.gate.passed",
            executionEpoch: 0,
            payloadJson: {}
          }),
        /current workflow execution epoch/iu
      );
      await assert.rejects(
        () =>
          db.insert(agentRunEvidenceItems).values({
            projectId: fixture.projectId,
            agentRunId: fixture.runId,
            evidenceKey: `ranking_proof:${fixture.proofId}`,
            sourceKind: "ranking_proof",
            sourceId: fixture.proofId,
            sourceVersion: "row-version:1",
            executionEpoch: 0,
            payloadSha256: "0".repeat(64),
            observedAt: fixture.capturedAt,
            proofTier: "internal_signal",
            evidenceJson: {}
          }),
        /current running workflow execution epoch/iu
      );
      const runningStep = await claimAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepKey: "research.running",
        stepKind: "agent",
        eventKey: "step.research.running.started.1",
        maxAttempts: 3
      });
      assert.equal(runningStep.kind, "claimed");
      if (runningStep.kind !== "claimed") return;
      const [pendingStep] = await db
        .insert(agentRunSteps)
        .values({
          projectId: fixture.projectId,
          agentRunId: fixture.runId,
          stepKey: "research.pending",
          stepKind: "qa"
        })
        .returning();
      assert.ok(pendingStep);
      const bound = await bindAgentRunEvidenceSource(db, {
        projectId: fixture.projectId,
        runId: fixture.runId,
        stepId: runningStep.stepId,
        role: "input",
        ordinal: 0,
        eventKey: "evidence.before.failure",
        evidence: {
          evidenceKey: `ranking_proof:${fixture.proofId}`,
          sourceKind: "ranking_proof",
          sourceId: fixture.proofId,
          sourceVersion: "row-version:1"
        }
      });
      assert.equal(
        await failOpportunityResearchExecution(db, {
          projectId: fixture.projectId,
          runId: fixture.runId,
          failureCode: "test_terminal",
          failureMessage: "Terminalized by the integration test.",
          expectedExecutionEpoch: 1
        }),
        true
      );
      const steps = await db.select().from(agentRunSteps).where(eq(agentRunSteps.agentRunId, fixture.runId));
      assert.equal(
        steps.every((step) => step.status === "failed"),
        true
      );
      const terminalizedPendingStep = steps.find((step) => step.id === pendingStep.id);
      assert.equal(terminalizedPendingStep?.executionEpoch, 1);
      const [pendingFailureEvent] = await db
        .select()
        .from(agentRunEvents)
        .where(eq(agentRunEvents.eventKey, `step.failed.parent.${pendingStep.id}`));
      assert.equal(pendingFailureEvent?.executionEpoch, 1);
      await assert.rejects(
        () =>
          db
            .update(agentRuns)
            .set({ diagnosticsJson: { forged: true } })
            .where(eq(agentRuns.id, fixture.runId)),
        /terminal workflow runs are immutable/iu
      );
      await assert.rejects(() => db.delete(agentRuns).where(eq(agentRuns.id, fixture.runId)), /durable audit truth/iu);
      await assert.rejects(
        () =>
          db.insert(agentRunEvents).values({
            projectId: fixture.projectId,
            agentRunId: fixture.runId,
            eventKey: "run.failed.duplicate",
            eventType: "run.failed",
            executionEpoch: 1,
            payloadJson: { failureCode: "test_terminal" },
            occurredAt: steps[0]?.completedAt ?? new Date()
          }),
        /terminal workflow lifecycle event already exists|exact terminal event/iu
      );
      await assert.rejects(
        () =>
          db.insert(agentRunStepEvidenceLinks).values({
            projectId: fixture.projectId,
            agentRunId: fixture.runId,
            agentRunStepId: pendingStep.id,
            evidenceItemId: bound.evidenceItemId,
            role: "cited",
            ordinal: 1
          }),
        /running workflow and step/iu
      );
    });

    void it("rejects same-project research opportunities absent from succeeded strategy output", async () => {
      const fixture = await createFixture(db);
      await claimFixtureExecution(db, fixture, "forged-opportunity:attempt-1");
      const output = { candidates: [], captures: [], research: { followUpQueries: [], findings: [] } };
      await completeCanonicalWorkflowSteps(db, fixture, output);
      await markOpportunityResearchSucceeded(db, fixture, output);
      const entities = await createConfirmedEntityPair(db, fixture);

      await assert.rejects(
        () =>
          db.insert(opportunities).values({
            projectId: fixture.projectId,
            agentRunId: fixture.runId,
            serviceId: entities.serviceId,
            areaId: entities.areaId,
            primaryKeyword: "fabricated same-project candidate",
            policyVersion: "opportunity-portfolio.v1",
            researchMaterialDigest: fixture.materialDigest,
            candidateKey: `fabricated:${randomUUID()}`,
            rankingMilestone: "unverified",
            evidenceReadiness: "supporting_context",
            businessValue: "medium",
            marketDifficulty: "medium",
            executionEffort: "medium",
            lane: "build_cluster",
            evidenceJson: {
              workflowVersion: "opportunity-research.v2",
              candidate: {
                serviceId: entities.serviceId,
                areaId: entities.areaId,
                service: "Fabricated service",
                area: "Fabricated area",
                primaryKeyword: "fabricated same-project candidate",
                secondaryKeywords: [],
                suggestedPageType: "normal_page",
                businessValue: "medium",
                marketDifficulty: "medium",
                executionEffort: "medium",
                evidenceKeys: [`ranking_proof:${fixture.proofId}`],
                rationale: "Fabricated",
                missingEvidence: [],
                confidence: 0.5
              },
              derivedAxes: {
                rankingMilestone: "unverified",
                evidenceReadiness: "supporting_context",
                businessValue: "medium",
                marketDifficulty: "medium",
                executionEffort: "medium",
                lane: "build_cluster"
              },
              citedEvidenceKeys: [`ranking_proof:${fixture.proofId}`]
            }
          }),
        /must match exact succeeded strategy output truth/iu
      );
    });
  }
);

async function createFixture(db: DatabaseClient) {
  const [user] = await db
    .insert(users)
    .values({ email: `${randomUUID()}@example.test`, name: "Ledger Operator" })
    .returning();
  assert.ok(user);
  const [customer] = await db
    .insert(customers)
    .values({ name: `Ledger ${randomUUID()}`, ownerUserId: user.id })
    .returning();
  assert.ok(customer);
  const [project] = await db
    .insert(projects)
    .values({ customerId: customer.id, name: `Ledger ${randomUUID()}` })
    .returning();
  assert.ok(project);
  const inputSha256 = canonicalAgentLedgerSha256({ projectId: project.id });
  const run = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(agentRuns)
      .values({
        projectId: project.id,
        subjectId: project.id,
        task: "opportunity_scout",
        status: "queued",
        workflowName: "opportunity_research",
        workflowVersion: "opportunity-research.v2",
        constraintProfileVersion: "opportunity-research-policy.v1",
        requestedByUserId: user.id,
        triggerSource: "user_action",
        idempotencyKey: randomUUID(),
        inputSha256
      })
      .returning();
    assert.ok(inserted);
    await tx.insert(agentRunEvents).values({
      projectId: project.id,
      agentRunId: inserted.id,
      eventKey: "run.queued",
      eventType: "run.queued",
      executionEpoch: 0,
      payloadJson: { materialDigest: inputSha256 },
      occurredAt: inserted.createdAt
    });
    await tx.insert(projectOpportunityResearchStates).values({
      projectId: project.id,
      status: "queued",
      materialDigest: inputSha256,
      activeRunId: inserted.id
    });
    const jobRunId = randomUUID();
    await tx.insert(jobRuns).values({
      id: jobRunId,
      projectId: project.id,
      externalJobId: inserted.id,
      queueName: "opportunity-research",
      type: "opportunity_research",
      status: "queued",
      inputRef: inserted.id,
      actorType: "user",
      actorUserId: user.id,
      triggerSource: "user_action"
    });
    return { run: inserted, jobRunId };
  });
  assert.ok(run.run);
  const capturedAt = new Date(Date.now() - 24 * 60 * 60 * 1_000);
  const query = "gebaeudereinigung dachau";
  const pageUrl = "https://example.test/gebaeudereinigung-dachau/";
  const [captured] = await db
    .insert(rankingProofs)
    .values({
      projectId: project.id,
      query,
      pageUrl,
      rank: 4,
      capturedAt,
      createdByUserId: user.id
    })
    .returning();
  assert.ok(captured);
  const [reviewed] = await db
    .update(rankingProofs)
    .set({ status: "reviewed", reviewedAt: new Date(capturedAt.getTime() + 5 * 60_000), reviewedByUserId: user.id })
    .where(eq(rankingProofs.id, captured.id))
    .returning();
  assert.ok(reviewed);
  return {
    projectId: project.id,
    userId: user.id,
    runId: run.run.id,
    jobRunId: run.jobRunId,
    materialDigest: inputSha256,
    proofId: reviewed.id,
    query,
    pageUrl,
    capturedAt
  };
}

async function claimFixtureExecution(
  db: DatabaseClient,
  fixture: { projectId: string; runId: string; materialDigest: string; jobRunId: string },
  executionClaimToken: string
) {
  return claimOpportunityResearchExecution(db, {
    projectId: fixture.projectId,
    runId: fixture.runId,
    materialDigest: fixture.materialDigest,
    triggerSource: "user_action",
    jobRunId: fixture.jobRunId,
    executionClaimToken
  });
}

async function createConfirmedEntityPair(
  db: DatabaseClient,
  fixture: { projectId: string; userId: string }
): Promise<{ serviceId: string; areaId: string }> {
  const [service] = await db
    .insert(services)
    .values({ projectId: fixture.projectId, name: `Service ${randomUUID()}` })
    .returning();
  const [area] = await db
    .insert(areas)
    .values({ projectId: fixture.projectId, name: `Area ${randomUUID()}`, kind: "city" })
    .returning();
  assert.ok(service && area);
  const confirmedAt = new Date();
  await db
    .update(services)
    .set({ status: "confirmed", confirmedAt, confirmedByUserId: fixture.userId })
    .where(eq(services.id, service.id));
  await db
    .update(areas)
    .set({ status: "confirmed", confirmedAt, confirmedByUserId: fixture.userId })
    .where(eq(areas.id, area.id));
  return { serviceId: service.id, areaId: area.id };
}

async function completeCanonicalWorkflowSteps(
  db: DatabaseClient,
  fixture: { projectId: string; runId: string },
  output: Record<string, unknown>
): Promise<void> {
  const plan = await claimAgentRunStep(db, {
    projectId: fixture.projectId,
    runId: fixture.runId,
    stepKey: "research-plan-agent.v2",
    stepKind: "agent",
    agentRole: "ResearchAgent",
    eventKey: "step.started.research-plan-agent.v2",
    maxAttempts: 3,
    expectedExecutionEpoch: 1
  });
  assert.equal(plan.kind, "claimed");
  if (plan.kind !== "claimed") throw new Error("Expected research-plan step claim.");
  await completeAgentRunStep(db, {
    projectId: fixture.projectId,
    runId: fixture.runId,
    stepId: plan.stepId,
    expectedRowVersion: plan.rowVersion,
    expectedExecutionEpoch: 1,
    outputJson: { planned: true },
    eventKey: "step.succeeded.research-plan-agent.v2"
  });
  await completeRemainingCanonicalSteps(db, fixture, output);
}

async function completeRemainingCanonicalSteps(
  db: DatabaseClient,
  fixture: { projectId: string; runId: string },
  output: Record<string, unknown>,
  executionEpoch = 1,
  followUpToolKey = "public_web_search_follow_up"
): Promise<void> {
  const followUp = await claimAgentRunStep(db, {
    projectId: fixture.projectId,
    runId: fixture.runId,
    stepKey: "follow-up-capture.v2",
    stepKind: "tool",
    toolKey: followUpToolKey,
    eventKey: "step.started.follow-up-capture.v2",
    maxAttempts: 3,
    expectedExecutionEpoch: executionEpoch
  });
  assert.equal(followUp.kind, "claimed");
  if (followUp.kind !== "claimed") throw new Error("Expected follow-up step claim.");
  await completeAgentRunStep(db, {
    projectId: fixture.projectId,
    runId: fixture.runId,
    stepId: followUp.stepId,
    expectedRowVersion: followUp.rowVersion,
    expectedExecutionEpoch: executionEpoch,
    outputJson: { captures: [] },
    eventKey: "step.succeeded.follow-up-capture.v2"
  });

  const strategy = await claimAgentRunStep(db, {
    projectId: fixture.projectId,
    runId: fixture.runId,
    stepKey: "seo-strategy-agent.v2",
    stepKind: "agent",
    agentRole: "SeoStrategyAgent",
    eventKey: "step.started.seo-strategy-agent.v2",
    maxAttempts: 3,
    expectedExecutionEpoch: executionEpoch
  });
  assert.equal(strategy.kind, "claimed");
  if (strategy.kind !== "claimed") throw new Error("Expected strategy step claim.");
  await completeAgentRunStep(db, {
    projectId: fixture.projectId,
    runId: fixture.runId,
    stepId: strategy.stepId,
    expectedRowVersion: strategy.rowVersion,
    expectedExecutionEpoch: executionEpoch,
    outputJson: output,
    eventKey: "step.succeeded.seo-strategy-agent.v2"
  });
}

async function markOpportunityResearchSucceeded(
  db: DatabaseClient,
  fixture: { projectId: string; runId: string; materialDigest: string },
  output: Record<string, unknown>
): Promise<string> {
  const outputSha256 = canonicalAgentLedgerSha256(output);
  const completedAt = new Date();
  await db.transaction(async (tx) => {
    const [currentRun] = await tx
      .select({ executionEpoch: agentRuns.executionEpoch })
      .from(agentRuns)
      .where(eq(agentRuns.id, fixture.runId))
      .limit(1);
    assert.ok(currentRun);
    await tx
      .update(agentRuns)
      .set({ status: "succeeded", outputJson: output, outputSha256, completedAt, updatedAt: completedAt })
      .where(eq(agentRuns.id, fixture.runId));
    await tx
      .update(projectOpportunityResearchStates)
      .set({
        status: "succeeded",
        activeRunId: null,
        lastSuccessfulDigest: fixture.materialDigest,
        updatedAt: completedAt
      })
      .where(eq(projectOpportunityResearchStates.projectId, fixture.projectId));
    await tx.insert(agentRunEvents).values({
      projectId: fixture.projectId,
      agentRunId: fixture.runId,
      eventKey: "run.succeeded",
      eventType: "run.succeeded",
      executionEpoch: currentRun.executionEpoch,
      payloadJson: { outputSha256 },
      occurredAt: completedAt
    });
  });
  return outputSha256;
}

async function recordRecoveryClaim(
  db: DatabaseClient,
  fixture: { projectId: string; runId: string },
  recoveryCount: number
): Promise<string> {
  return db.transaction(async (tx) => {
    const now = new Date();
    await tx.insert(agentRunEvents).values({
      projectId: fixture.projectId,
      agentRunId: fixture.runId,
      eventKey: `recovery.claimed.${recoveryCount}`,
      eventType: "recovery.claimed",
      executionEpoch:
        (
          await tx
            .select({ executionEpoch: agentRuns.executionEpoch })
            .from(agentRuns)
            .where(eq(agentRuns.id, fixture.runId))
            .limit(1)
        )[0]?.executionEpoch ?? 0,
      payloadJson: { recoveryCount },
      occurredAt: now
    });
    const [updated] = await tx
      .update(agentRuns)
      .set({
        recoveryCount: sql<number>`${agentRuns.recoveryCount} + 1`,
        lastRecoveryAt: now,
        lastHeartbeatAt: sql<Date>`CASE
          WHEN ${agentRuns.status} = 'running' THEN ${now.toISOString()}::timestamptz
          ELSE ${agentRuns.lastHeartbeatAt}
        END`,
        updatedAt: now
      })
      .where(and(eq(agentRuns.id, fixture.runId), eq(agentRuns.recoveryCount, recoveryCount - 1)))
      .returning({ recoveryCount: agentRuns.recoveryCount });
    assert.equal(updated?.recoveryCount, recoveryCount);
    const jobRunId = randomUUID();
    await tx.insert(jobRuns).values({
      id: jobRunId,
      projectId: fixture.projectId,
      externalJobId: `${fixture.runId}:recovery:${recoveryCount}`,
      queueName: "opportunity-research",
      type: "opportunity_research",
      status: "queued",
      inputRef: fixture.runId,
      actorType: "system",
      triggerSource: "work_recovery"
    });
    return jobRunId;
  });
}

type HeldDatabaseLock = {
  pid: number;
  done: Promise<void>;
  commit: () => void;
  rollback: () => void;
};

async function startHeldAgentRunLock(sqlClient: SqlClient, runId: string): Promise<HeldDatabaseLock> {
  const locked = deferred<{ pid: number }>();
  const finish = deferred<"commit" | "rollback">();
  const done = sqlClient.begin(async (tx) => {
    const pid = await backendPid(tx);
    await tx`SELECT "id" FROM "agent_runs" WHERE "id" = ${runId} FOR UPDATE`;
    locked.resolve({ pid });
    if ((await finish.promise) === "rollback") throw new Error("Rollback held agent-run lock.");
  });
  void done.catch((error: unknown) => locked.reject(error));
  const { pid } = await locked.promise;
  return {
    pid,
    done,
    commit: () => finish.resolve("commit"),
    rollback: () => finish.resolve("rollback")
  };
}

async function backendPid(sqlClient: SqlClient): Promise<number> {
  const [row] = await sqlClient<{ pid: number }[]>`SELECT pg_backend_pid()::int AS pid`;
  assert.ok(row);
  return row.pid;
}

async function waitForBlockingPid(
  sqlClient: SqlClient,
  input: { blockedPid: number; blockingPid: number; isSettled: () => boolean }
): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (input.isSettled()) throw new Error("The blocked operation settled before the lock wait was observed.");
    const [row] = await sqlClient<{ blocking_pids: number[] }[]>`
      SELECT pg_blocking_pids(${input.blockedPid}) AS blocking_pids
    `;
    if (row?.blocking_pids.includes(input.blockingPid)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for backend ${input.blockedPid} to be blocked by ${input.blockingPid}.`);
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function postgresErrorMatches(pattern: RegExp): (error: unknown) => boolean {
  return (error) => {
    const messages: string[] = [];
    let current: unknown = error;
    while (current && typeof current === "object") {
      const record = current as { message?: unknown; cause?: unknown };
      if (typeof record.message === "string") messages.push(record.message);
      current = record.cause;
    }
    assert.match(messages.join("\n"), pattern);
    return true;
  };
}

function opportunityResearchJob(
  fixture: { projectId: string; runId: string; materialDigest: string; jobRunId: string },
  attemptsMade: number,
  attempts: number
): Job {
  return {
    queueName: "opportunity-research",
    name: "opportunity_research",
    data: {
      projectId: fixture.projectId,
      runId: fixture.runId,
      materialDigest: fixture.materialDigest,
      triggerSource: "user_action",
      jobRunId: fixture.jobRunId
    },
    attemptsMade,
    opts: { attempts }
  } as Job;
}
