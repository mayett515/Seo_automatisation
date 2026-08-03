import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { buildCanonicalPageProposalOutputExample } from "@localseo/ai";
import { MockReasoningAdapter, type ObjectStoragePort } from "@localseo/adapters";
import {
  CustomerReportEvidencePacketSchema,
  CustomerReportNarrativePacketSchema,
  CustomerReportSnapshotSchema,
  type CustomerReportClaim,
  type CustomerReportNarrativeMode
} from "@localseo/contracts";
import {
  agentRuns,
  customers,
  deployments,
  opportunities,
  pageProposals,
  pageVersions,
  projects,
  rankingProofs,
  releasePlans,
  releaseVerificationChecks,
  releaseVerifications,
  reportClaims,
  reportEvidenceItems,
  reportGenerationRuns,
  reportIssues,
  reportLifecycleEvents,
  reports,
  rollbackPoints,
  users,
  type DatabaseClient
} from "@localseo/db";
import { eq } from "drizzle-orm";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";
import { executeCustomerReportGeneration } from "./customer-report.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);
const cutoff = new Date("2026-08-01T10:00:00.000Z");

void describe(
  "customer report generation worker database integration",
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

    void it("assembles and persists a bounded fact-only report from durable customer-safe sources", async () => {
      const fixture = await createFixture(db);
      const otherFixture = await createFixture(db);
      assert.notEqual(otherFixture.projectId, fixture.projectId);
      const result = await executeCustomerReportGeneration({
        db,
        data: { projectId: fixture.projectId, runId: fixture.runId },
        now: new Date("2026-08-01T10:05:00.000Z")
      });

      assert.equal(result.status, "persisted");
      const [run] = await db.select().from(reportGenerationRuns).where(eq(reportGenerationRuns.id, fixture.runId));
      assert.equal(run?.status, "succeeded");
      assert.match(run?.evidencePacketSha256 ?? "", /^[0-9a-f]{64}$/u);
      assert.match(run?.evidencePacketCanonicalText ?? "", /customer_report_evidence_packet\.v1/u);
      const packet = CustomerReportEvidencePacketSchema.parse(JSON.parse(run?.evidencePacketCanonicalText ?? "{}"));
      assert.ok(packet.evidence.every((item) => item.projectId === fixture.projectId));
      const rollbackEvidence = packet.evidence.filter((item) => item.sourceKind === "rollback");
      assert.equal(rollbackEvidence.length, 1);
      assert.equal(rollbackEvidence[0]?.rollbackPointId, fixture.rollbackPointId);
      assert.equal(rollbackEvidence[0]?.deploymentId, fixture.rolledBackDeploymentId);
      const [report] = await db.select().from(reports).where(eq(reports.sourceGenerationRunId, fixture.runId));
      assert.equal(report?.status, "draft");
      assert.equal(report?.narrativeMode, "fact_only");
      assert.ok(report);
      const claims = await db.select().from(reportClaims).where(eq(reportClaims.reportId, report.id));
      const evidence = await db.select().from(reportEvidenceItems).where(eq(reportEvidenceItems.reportId, report.id));
      assert.deepEqual(
        new Set(claims.map((row) => row.claimKind)),
        new Set([
          "ranking_result",
          "page_delivery",
          "provider_handoff",
          "live_health",
          "release_warning",
          "rollback_correction",
          "future_opportunity"
        ])
      );
      assert.deepEqual(
        new Set(evidence.map((row) => row.sourceKind)),
        new Set([
          "ranking_proof",
          "page_version",
          "deployment",
          "release_verification",
          "release_verification_check",
          "rollback",
          "opportunity"
        ])
      );
      const healthClaims = claims
        .map((row) => row.claimJson)
        .filter(
          (claim): claim is Extract<CustomerReportClaim, { kind: "live_health" }> => claim.kind === "live_health"
        );
      assert.equal(healthClaims.length, 2);
      assert.ok(healthClaims.every((claim) => claim.verificationId !== fixture.oldVerificationId));
      const [warning] = claims
        .map((row) => row.claimJson)
        .filter(
          (claim): claim is Extract<CustomerReportClaim, { kind: "release_warning" }> =>
            claim.kind === "release_warning"
        );
      assert.equal(warning?.checkKey, "http_status_check");
      assert.equal(warning?.title, "Eine veröffentlichte Seite war nicht erfolgreich erreichbar.");
      assert.doesNotMatch(warning?.summary ?? "", /operator|gsc|reconnect/iu);
      const handoffClaims = claims
        .map((row) => row.claimJson)
        .filter(
          (claim): claim is Extract<CustomerReportClaim, { kind: "provider_handoff" }> =>
            claim.kind === "provider_handoff"
        );
      assert.equal(handoffClaims.length, 1);
      assert.equal(handoffClaims[0]?.deploymentId, fixture.liveDeploymentId);
    });

    void it("persists only attributed bounded narrative from a report-scoped agent run", async () => {
      const fixture = await createFixture(db, { narrativeMode: "bounded_ai" });
      const storedInputs: unknown[] = [];
      const reasoning = new MockReasoningAdapter((input) => {
        const packet = CustomerReportNarrativePacketSchema.parse(input.inputJson);
        return {
          ok: true,
          provider: "mock",
          model: "bounded-report",
          outputJson: {
            schemaVersion: "customer_report_narrative_draft.v1",
            fragments: packet.slots.map((slot, index) => ({
              slotKey: slot.slotKey,
              text:
                slot.kind === "heading"
                  ? `Gepruefte Entwicklungen ${alphabeticSuffix(index)}`
                  : `Die geprueften Themen werden gemeinsam eingeordnet ${alphabeticSuffix(index)}`
            }))
          },
          diagnostics: { latencyMs: 12, finishReason: "stop" }
        };
      });
      const objectStorage: ObjectStoragePort = {
        putJson(input) {
          storedInputs.push(input.value);
          return Promise.resolve({ key: input.key });
        },
        getJson() {
          return Promise.reject(new Error("not used"));
        }
      };

      const result = await executeCustomerReportGeneration({
        db,
        data: { projectId: fixture.projectId, runId: fixture.runId },
        reasoning,
        objectStorage,
        now: new Date("2026-08-01T10:05:00.000Z")
      });

      assert.equal(result.status, "persisted");
      const [report] = await db.select().from(reports).where(eq(reports.sourceGenerationRunId, fixture.runId));
      const [agentRun] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.ok(report);
      assert.equal(report.id, fixture.runId);
      assert.equal(report.narrativeMode, "bounded_ai");
      assert.equal(report.sourceAgentRunId, fixture.runId);
      assert.equal(agentRun?.status, "succeeded");
      assert.equal(agentRun?.task, "report_narrative");
      assert.equal(agentRun?.subjectId, report.id);
      assert.equal(reasoning.calls[0]?.policy.canMutateProduction, false);
      assert.deepEqual(reasoning.calls[0]?.policy.allowedToolCategories, ["read_evidence", "analyze", "draft_content"]);
      assert.equal(storedInputs.length, 1);
      const snapshot = CustomerReportSnapshotSchema.parse(JSON.parse(report.snapshotCanonicalText));
      assert.ok(snapshot.narrative.length > 0);
      assert.deepEqual((agentRun?.outputJson as { fragments?: unknown })?.fragments, snapshot.narrative);

      await assert.rejects(
        db.update(reports).set({ sourceAgentRunId: null }).where(eq(reports.id, report.id)),
        postgresErrorMatches(/reports_narrative_provenance_shape_check|Bounded-AI reports require agent provenance/iu)
      );
      await assert.rejects(
        db
          .update(agentRuns)
          .set({ outputJson: { schemaVersion: "customer_report_narrative_output.v1", fragments: [] } })
          .where(eq(agentRuns.id, fixture.runId)),
        postgresErrorMatches(/Succeeded report narrative agent runs are immutable audit evidence/iu)
      );
    });

    void it("degrades bounded narrative failure to an honest fact-only report", async () => {
      const fixture = await createFixture(db, { narrativeMode: "bounded_ai" });
      const reasoning = new MockReasoningAdapter({
        ok: false,
        failureCode: "provider_error",
        provider: "mock",
        model: "unavailable",
        diagnostics: { latencyMs: 7, detail: "provider unavailable" }
      });
      const objectStorage: ObjectStoragePort = {
        putJson(input) {
          return Promise.resolve({ key: input.key });
        },
        getJson() {
          return Promise.reject(new Error("not used"));
        }
      };

      const result = await executeCustomerReportGeneration({
        db,
        data: { projectId: fixture.projectId, runId: fixture.runId },
        reasoning,
        objectStorage,
        now: new Date("2026-08-01T10:05:00.000Z")
      });

      assert.equal(result.status, "persisted");
      const [report] = await db.select().from(reports).where(eq(reports.sourceGenerationRunId, fixture.runId));
      const [agentRun] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(report?.narrativeMode, "fact_only");
      assert.equal(report?.sourceAgentRunId, null);
      assert.equal(agentRun?.status, "failed");
      assert.equal(agentRun?.failureCode, "provider_error");
      const [generation] = await db
        .select()
        .from(reportGenerationRuns)
        .where(eq(reportGenerationRuns.id, fixture.runId));
      assert.equal(generation?.status, "succeeded");
    });

    void it("keeps QA-rejected narrative out of report truth", async () => {
      const fixture = await createFixture(db, { narrativeMode: "bounded_ai" });
      const reasoning = new MockReasoningAdapter((input) => {
        const packet = CustomerReportNarrativePacketSchema.parse(input.inputJson);
        return {
          ok: true,
          provider: "mock",
          model: "unsafe-report",
          outputJson: {
            schemaVersion: "customer_report_narrative_draft.v1",
            fragments: packet.slots.map((slot) => ({ slotKey: slot.slotKey, text: "Garantiert Platz 1" }))
          },
          diagnostics: { latencyMs: 9 }
        };
      });
      const objectStorage: ObjectStoragePort = {
        putJson(input) {
          return Promise.resolve({ key: input.key });
        },
        getJson() {
          return Promise.reject(new Error("not used"));
        }
      };

      await executeCustomerReportGeneration({
        db,
        data: { projectId: fixture.projectId, runId: fixture.runId },
        reasoning,
        objectStorage,
        now: new Date("2026-08-01T10:05:00.000Z")
      });

      const [report] = await db.select().from(reports).where(eq(reports.sourceGenerationRunId, fixture.runId));
      const [agentRun] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(report?.narrativeMode, "fact_only");
      assert.equal(agentRun?.status, "failed");
      assert.equal(agentRun?.failureCode, "qa_rejected");
      assert.equal((agentRun?.diagnosticsJson as { gateId?: string })?.gateId, "fact_token");
    });

    void it("coalesces duplicate worker delivery into one draft and one lifecycle event", async () => {
      const fixture = await createFixture(db);

      const [first, second] = await Promise.all([
        executeCustomerReportGeneration({
          db,
          data: { projectId: fixture.projectId, runId: fixture.runId },
          now: new Date("2026-08-01T10:05:00.000Z")
        }),
        executeCustomerReportGeneration({
          db,
          data: { projectId: fixture.projectId, runId: fixture.runId },
          now: new Date("2026-08-01T10:05:00.000Z")
        })
      ]);

      assert.deepEqual(new Set([first.status, second.status]), new Set(["persisted", "replayed"]));
      assert.equal((await db.select().from(reports)).length, 1);
      assert.equal((await db.select().from(reportLifecycleEvents)).length, 1);
    });
  }
);

async function createFixture(
  db: DatabaseClient,
  input: { narrativeMode?: CustomerReportNarrativeMode } = {}
): Promise<{
  projectId: string;
  runId: string;
  liveDeploymentId: string;
  oldVerificationId: string;
  rolledBackDeploymentId: string;
  rollbackPointId: string;
}> {
  const suffix = randomUUID();
  const [user] = await db
    .insert(users)
    .values({ email: `${suffix}@example.test`, name: "Report Operator" })
    .returning();
  assert.ok(user);
  const [customer] = await db.insert(customers).values({ name: "Report Customer" }).returning();
  assert.ok(customer);
  const [project] = await db.insert(projects).values({ customerId: customer.id, name: "Report Project" }).returning();
  assert.ok(project);
  await db.insert(rankingProofs).values({
    projectId: project.id,
    query: "dachreinigung dachau",
    pageUrl: "https://example.test/dachreinigung-dachau/",
    rank: 3,
    capturedAt: new Date("2026-07-25T09:00:00.000Z"),
    searchEngine: "google",
    device: "mobile",
    locale: "de-DE",
    status: "reviewed",
    createdByUserId: user.id,
    createdAt: new Date("2026-07-25T09:00:00.000Z"),
    updatedAt: new Date("2026-07-25T09:00:00.000Z")
  });
  const [opportunity] = await db
    .insert(opportunities)
    .values({
      projectId: project.id,
      primaryKeyword: "fassadenreinigung dachau",
      classification: "near_term_target",
      status: "monitoring",
      score: 70,
      createdAt: new Date("2026-07-20T09:00:00.000Z"),
      updatedAt: new Date("2026-07-30T09:00:00.000Z")
    })
    .returning();
  assert.ok(opportunity);

  const generatedPage = buildCanonicalPageProposalOutputExample({
    projectId: project.id,
    opportunityId: opportunity.id,
    agentRunId: randomUUID()
  }).page;
  const [proposal] = await db
    .insert(pageProposals)
    .values({
      projectId: project.id,
      opportunityId: opportunity.id,
      route: generatedPage.route,
      primaryKeyword: generatedPage.target.primaryKeyword,
      uniquenessRationale: generatedPage.uniquenessRationale ?? "Customer report page.",
      status: "approved",
      sitemapReady: generatedPage.seo.sitemapReady,
      createdAt: new Date("2026-07-10T09:00:00.000Z"),
      updatedAt: new Date("2026-07-10T09:00:00.000Z")
    })
    .returning();
  assert.ok(proposal);
  await db.insert(pageVersions).values({
    pageProposalId: proposal.id,
    versionNumber: 1,
    status: "released",
    pageJson: generatedPage,
    approvedAt: new Date("2026-07-10T09:00:00.000Z"),
    createdAt: new Date("2026-07-10T09:00:00.000Z"),
    updatedAt: new Date("2026-07-10T09:00:00.000Z")
  });

  const [livePlan] = await db
    .insert(releasePlans)
    .values({
      projectId: project.id,
      status: "live",
      summary: "Customer report live release",
      deployedAt: new Date("2026-07-20T09:00:00.000Z"),
      createdAt: new Date("2026-07-19T09:00:00.000Z"),
      updatedAt: new Date("2026-07-25T09:00:00.000Z")
    })
    .returning();
  assert.ok(livePlan);
  const [liveDeployment] = await db
    .insert(deployments)
    .values({
      projectId: project.id,
      releasePlanId: livePlan.id,
      deploymentKey: `release_plan:${livePlan.id}`,
      provider: "netlify",
      providerDeployId: `deploy-${livePlan.id}`,
      providerOperationStatus: "recorded",
      status: "live_with_warnings",
      verificationStatus: "live_with_warnings",
      createdAt: new Date("2026-07-20T09:00:00.000Z"),
      updatedAt: new Date("2026-07-25T09:00:00.000Z")
    })
    .returning();
  assert.ok(liveDeployment);
  const [oldVerification] = await db
    .insert(releaseVerifications)
    .values({
      releasePlanId: livePlan.id,
      deploymentId: liveDeployment.id,
      status: "live_healthy",
      summary: "Superseded health result.",
      checkedAt: new Date("2026-07-24T09:00:00.000Z"),
      createdAt: new Date("2026-07-24T09:00:00.000Z"),
      updatedAt: new Date("2026-07-24T09:00:00.000Z")
    })
    .returning();
  assert.ok(oldVerification);
  const [latestVerification] = await db
    .insert(releaseVerifications)
    .values({
      releasePlanId: livePlan.id,
      deploymentId: liveDeployment.id,
      status: "live_with_warnings",
      summary: "Latest health result.",
      checkedAt: new Date("2026-07-25T09:00:00.000Z"),
      createdAt: new Date("2026-07-25T09:00:00.000Z"),
      updatedAt: new Date("2026-07-25T09:00:00.000Z")
    })
    .returning();
  assert.ok(latestVerification);
  await db.insert(releaseVerificationChecks).values([
    {
      verificationId: latestVerification.id,
      checkKey: "http_status_check",
      scope: "domain",
      severity: "warning",
      result: "failed",
      message: "Operator detail that must not be copied.",
      checkedAt: new Date("2026-07-25T09:00:00.000Z"),
      createdAt: new Date("2026-07-25T09:00:00.000Z"),
      updatedAt: new Date("2026-07-25T09:00:00.000Z")
    },
    {
      verificationId: latestVerification.id,
      checkKey: "gsc_connection_check",
      scope: "gsc",
      severity: "warning",
      result: "failed",
      message: "Reconnect Search Console.",
      checkedAt: new Date("2026-07-25T09:00:00.000Z"),
      createdAt: new Date("2026-07-25T09:00:00.000Z"),
      updatedAt: new Date("2026-07-25T09:00:00.000Z")
    },
    {
      verificationId: latestVerification.id,
      checkKey: "verification_execution_error",
      scope: "project",
      severity: "blocker",
      result: "failed",
      message: "Internal execution detail.",
      checkedAt: new Date("2026-07-25T09:00:00.000Z"),
      createdAt: new Date("2026-07-25T09:00:00.000Z"),
      updatedAt: new Date("2026-07-25T09:00:00.000Z")
    }
  ]);

  const [rollbackPlan] = await db
    .insert(releasePlans)
    .values({
      projectId: project.id,
      status: "rolled_back",
      summary: "Customer report rollback release",
      deployedAt: new Date("2026-07-15T09:00:00.000Z"),
      createdAt: new Date("2026-07-14T09:00:00.000Z"),
      updatedAt: new Date("2026-07-23T09:00:00.000Z")
    })
    .returning();
  assert.ok(rollbackPlan);
  const [rolledBackDeployment] = await db
    .insert(deployments)
    .values({
      projectId: project.id,
      releasePlanId: rollbackPlan.id,
      deploymentKey: `release_plan:${rollbackPlan.id}`,
      provider: "netlify",
      providerDeployId: `restored-${rollbackPlan.id}`,
      providerOperationStatus: "recorded",
      status: "rolled_back",
      verificationStatus: "live_healthy",
      createdAt: new Date("2026-07-15T09:00:00.000Z"),
      updatedAt: new Date("2026-07-23T09:00:00.000Z")
    })
    .returning();
  assert.ok(rolledBackDeployment);
  const [rollbackSourceDeployment] = await db
    .insert(deployments)
    .values({
      projectId: project.id,
      releasePlanId: null,
      deploymentKey: `rollback_source:${rollbackPlan.id}`,
      provider: "netlify",
      providerDeployId: `source-${rollbackPlan.id}`,
      providerOperationStatus: "recorded",
      status: "live_healthy",
      verificationStatus: "live_healthy",
      createdAt: new Date("2026-06-15T09:00:00.000Z"),
      updatedAt: new Date("2026-07-23T09:00:00.000Z")
    })
    .returning();
  assert.ok(rollbackSourceDeployment);
  const [rollbackPoint] = await db
    .insert(rollbackPoints)
    .values({
      projectId: project.id,
      releasePlanId: rollbackPlan.id,
      deploymentId: rollbackSourceDeployment.id,
      artifactKey: "rollback/report-test.json",
      providerDeployId: `source-${rollbackPlan.id}`,
      evidenceJson: {
        rollbackExecution: {
          status: "completed",
          operationAttemptId: randomUUID(),
          providerResultStatus: "succeeded",
          providerDeployId: `restored-${rollbackPlan.id}`,
          sourceProviderDeployId: `source-${rollbackPlan.id}`,
          targetProviderDeployId: `target-${rollbackPlan.id}`,
          rolledBackFromProviderDeployId: `target-${rollbackPlan.id}`,
          executedAt: "2026-07-22T09:00:00.000Z",
          restoredProviderDeployId: `restored-${rollbackPlan.id}`,
          liveUrl: "https://example.test/",
          evidence: null
        }
      },
      createdAt: new Date("2026-07-14T09:00:00.000Z"),
      updatedAt: new Date("2026-07-22T09:00:00.000Z")
    })
    .returning();
  assert.ok(rollbackPoint);
  await db.insert(rollbackPoints).values({
    projectId: project.id,
    releasePlanId: rollbackPlan.id,
    deploymentId: rollbackSourceDeployment.id,
    artifactKey: "rollback/preflight-only-report-test.json",
    providerDeployId: `preflight-only-${rollbackPlan.id}`,
    evidenceJson: { source: "release_preflight_rollback_point_preparation" },
    createdAt: new Date("2026-07-14T09:00:00.000Z"),
    updatedAt: new Date("2026-07-21T09:00:00.000Z")
  });
  await db.insert(releaseVerifications).values({
    releasePlanId: rollbackPlan.id,
    deploymentId: rolledBackDeployment.id,
    status: "live_healthy",
    summary: "Post-rollback health result.",
    checkedAt: new Date("2026-07-23T09:00:00.000Z"),
    createdAt: new Date("2026-07-23T09:00:00.000Z"),
    updatedAt: new Date("2026-07-23T09:00:00.000Z")
  });
  const [issue] = await db
    .insert(reportIssues)
    .values({
      projectId: project.id,
      reportKind: "monthly_seo_progress",
      period: "2026-07",
      locale: "de-DE",
      timezone: "Europe/Berlin",
      createdByUserId: user.id
    })
    .returning();
  assert.ok(issue);
  const runId = randomUUID();
  await db.insert(reportGenerationRuns).values({
    id: runId,
    projectId: project.id,
    reportIssueId: issue.id,
    status: "queued",
    narrativeMode: input.narrativeMode ?? "fact_only",
    idempotencyKey: randomUUID(),
    queueJobId: runId,
    requestedByUserId: user.id,
    baseIssueRowVersion: issue.rowVersion,
    evidenceCutoffAt: cutoff,
    assemblerVersion: "customer_report_assembler.v1",
    reportSchemaVersion: "customer_report_snapshot.v1",
    eligibilityPolicyVersion: "customer_report_eligibility.v1",
    actionSelectionPolicyVersion: "customer_report_actions.v1",
    customerSafetyPolicyVersion: "customer_report_safety.v1"
  });
  return {
    projectId: project.id,
    runId,
    liveDeploymentId: liveDeployment.id,
    oldVerificationId: oldVerification.id,
    rolledBackDeploymentId: rolledBackDeployment.id,
    rollbackPointId: rollbackPoint.id
  };
}

function alphabeticSuffix(index: number): string {
  return `${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}`;
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
