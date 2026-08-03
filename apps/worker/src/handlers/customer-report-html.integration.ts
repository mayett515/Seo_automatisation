import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import type { ImmutableArtifactStoragePort, ImmutableArtifactStoredObject } from "@localseo/adapters";
import { CustomerReportSnapshotSchema, type CustomerReportSnapshot } from "@localseo/contracts";
import {
  customers,
  opportunities,
  projects,
  reportArtifacts,
  reportClaimEvidence,
  reportClaims,
  reportEvidenceItems,
  reportGenerationRuns,
  reportIssues,
  reports,
  users,
  type DatabaseClient
} from "@localseo/db";
import {
  assembleCustomerReportFactProjection,
  buildCustomerReportHtmlRenderManifest,
  canonicalizeCustomerReportFactProjection,
  canonicalizeCustomerReportHtmlRenderManifest,
  canonicalizeCustomerReportSnapshot,
  canonicalizeCustomerReportSourcePayload
} from "@localseo/domain";
import { and, eq, sql } from "drizzle-orm";
import type { JobsOptions } from "bullmq";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";
import { executeCustomerReportHtmlRender } from "./customer-report-html.js";
import {
  scanStaleWork,
  type WorkRecoveryQueue,
  type WorkRecoveryQueues,
  type WorkRecoveryTransportJob
} from "../work-recovery.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);

void describe(
  "customer report HTML artifact integration",
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

    void it("installs the current renderer identity without stranding historical artifact transitions", async () => {
      const [row] = await handle.sql<{ definition: string }[]>`
        SELECT pg_get_functiondef('enforce_report_artifact_write()'::regprocedure) AS "definition"
      `;

      assert.ok(row);
      assert.match(row.definition, /customer_report_html_renderer\.v2/u);
      assert.match(row.definition, /customer_report_stylesheet\.v2/u);
      assert.match(row.definition, /customer_report_html_renderer\.v1/u);
      assert.match(row.definition, /New report artifacts require the current renderer and stylesheet versions/u);
    });

    void it("stages one immutable artifact and replays the exact bytes", async () => {
      const fixture = await createReviewedReportArtifact(db, "HTML staging");
      const storage = new MemoryImmutableArtifactStorage();

      const first = await executeCustomerReportHtmlRender({ db, data: fixture.job, storage });
      const replay = await executeCustomerReportHtmlRender({ db, data: fixture.job, storage });

      assert.equal(first.status, "staged");
      assert.equal(replay.status, "already_staged");
      assert.equal(storage.writeCount, 1);
      const [artifact] = await db.select().from(reportArtifacts).where(eq(reportArtifacts.id, fixture.artifactId));
      assert.equal(artifact?.status, "staged");
      assert.ok(artifact?.storageKey?.endsWith(`${artifact.artifactSha256}.html`));
      assert.equal(artifact?.byteSize, storage.onlyBody()?.byteLength);
      assert.equal(artifact?.artifactSha256, sha256Bytes(storage.onlyBody() ?? new Uint8Array()));
    });

    void it("lets request-changes expire the artifact while rendering and prevents late attachment", async () => {
      const fixture = await createReviewedReportArtifact(db, "Review render race");
      const storage = new MemoryImmutableArtifactStorage(async () => {
        await returnReportToDraft(db, fixture);
      });

      const result = await executeCustomerReportHtmlRender({ db, data: fixture.job, storage });

      assert.equal(result.status, "expired");
      const [artifact] = await db.select().from(reportArtifacts).where(eq(reportArtifacts.id, fixture.artifactId));
      const [report] = await db.select().from(reports).where(eq(reports.id, fixture.reportId));
      assert.equal(artifact?.status, "expired");
      assert.equal(artifact?.artifactSha256, null);
      assert.equal(report?.status, "draft");
      assert.equal(storage.writeCount, 1);
    });

    void it("fails visible artifact truth when storage returns mismatched byte evidence", async () => {
      const fixture = await createReviewedReportArtifact(db, "Storage mismatch");
      const storage = new MemoryImmutableArtifactStorage(undefined, true);

      await assert.rejects(
        () => executeCustomerReportHtmlRender({ db, data: fixture.job, storage }),
        /did not preserve its immutable byte identity/u
      );
      const [artifact] = await db.select().from(reportArtifacts).where(eq(reportArtifacts.id, fixture.artifactId));
      assert.equal(artifact?.status, "failed");
      assert.equal(artifact?.failureCode, "storage_identity_mismatch");
    });

    void it("re-enqueues stale HTML rendering with the same artifact id", async () => {
      const fixture = await createReviewedReportArtifact(db, "Artifact recovery");
      await db
        .update(reportArtifacts)
        .set({ updatedAt: new Date("2026-08-02T09:00:00.000Z") })
        .where(eq(reportArtifacts.id, fixture.artifactId));
      const queues = recoveryQueues();

      const result = await scanStaleWork({
        db,
        queues,
        now: new Date("2026-08-02T10:00:00.000Z"),
        staleAfterMs: 60_000,
        maxRecoveryCount: 3,
        batchSize: 25
      });

      assert.equal(result.reEnqueued, 1);
      assert.equal(queues.report.addCalls[0]?.name, "customer_report_html_render");
      assert.equal(queues.report.addCalls[0]?.options.jobId, fixture.artifactId);
      assert.equal(queues.report.addCalls[0]?.data.artifactId, fixture.artifactId);
      assert.equal(queues.report.addCalls[0]?.data.reportId, fixture.reportId);
      const [artifact] = await db.select().from(reportArtifacts).where(eq(reportArtifacts.id, fixture.artifactId));
      assert.equal(artifact?.recoveryCount, 1);
    });

    void it("fails visible HTML artifact truth after bounded recovery exhaustion", async () => {
      const fixture = await createReviewedReportArtifact(db, "Artifact exhaustion");
      await db
        .update(reportArtifacts)
        .set({ recoveryCount: 3, updatedAt: new Date("2026-08-02T09:00:00.000Z") })
        .where(eq(reportArtifacts.id, fixture.artifactId));

      const result = await scanStaleWork({
        db,
        queues: recoveryQueues(),
        now: new Date("2026-08-02T10:00:00.000Z"),
        staleAfterMs: 60_000,
        maxRecoveryCount: 3,
        batchSize: 25
      });

      assert.equal(result.markedExecutionFailed, 1);
      const [artifact] = await db.select().from(reportArtifacts).where(eq(reportArtifacts.id, fixture.artifactId));
      assert.equal(artifact?.status, "failed");
      assert.equal(artifact?.failureCode, "work_recovery_exhausted");
    });
  }
);

type ReviewedReportArtifactFixture = {
  projectId: string;
  reportIssueId: string;
  reportId: string;
  artifactId: string;
  job: { projectId: string; reportId: string; artifactId: string };
};

async function createReviewedReportArtifact(db: DatabaseClient, name: string): Promise<ReviewedReportArtifactFixture> {
  const suffix = randomUUID();
  const [user] = await db
    .insert(users)
    .values({ email: `${suffix}@example.test`, name })
    .returning();
  assert.ok(user);
  const [customer] = await db
    .insert(customers)
    .values({ name: `${name} Customer` })
    .returning();
  assert.ok(customer);
  const [project] = await db.insert(projects).values({ customerId: customer.id, name }).returning();
  assert.ok(project);
  const [opportunity] = await db
    .insert(opportunities)
    .values({
      projectId: project.id,
      primaryKeyword: "fassadenreinigung dachau",
      classification: "near_term_target",
      status: "monitoring",
      score: 70
    })
    .returning();
  assert.ok(opportunity);

  const snapshot = reportSnapshot(project.id, opportunity.id, opportunity.updatedAt.toISOString());
  const snapshotCanonicalText = canonicalizeCustomerReportSnapshot(snapshot);
  const snapshotSha256 = sha256Text(snapshotCanonicalText);
  const reportIssueId = randomUUID();
  const runId = randomUUID();
  const reportId = randomUUID();
  const artifactId = randomUUID();
  const claim = snapshot.factProjection.claims[0];
  const evidence = snapshot.factProjection.evidence[0];
  assert.ok(claim);
  assert.ok(evidence);
  const manifest = buildCustomerReportHtmlRenderManifest({
    projectId: project.id,
    reportId,
    snapshotSha256,
    reportSchemaVersion: snapshot.schemaVersion,
    templateVersion: snapshot.templateVersion,
    locale: snapshot.identity.locale,
    timezone: snapshot.identity.timezone
  });
  const manifestCanonicalText = canonicalizeCustomerReportHtmlRenderManifest(manifest);
  const manifestSha256 = sha256Text(manifestCanonicalText);

  await db.transaction(async (tx) => {
    await tx.insert(reportIssues).values({
      id: reportIssueId,
      projectId: project.id,
      reportKind: "monthly_seo_progress",
      period: "2026-07",
      locale: "de-DE",
      timezone: "Europe/Berlin",
      createdByUserId: user.id
    });
    await tx.insert(reportGenerationRuns).values({
      id: runId,
      projectId: project.id,
      reportIssueId,
      status: "queued",
      narrativeMode: "fact_only",
      idempotencyKey: randomUUID(),
      queueJobId: runId,
      requestedByUserId: user.id,
      baseIssueRowVersion: 0,
      evidenceCutoffAt: new Date(snapshot.evidenceCutoffAt),
      assemblerVersion: snapshot.assemblerVersion,
      reportSchemaVersion: snapshot.schemaVersion,
      eligibilityPolicyVersion: snapshot.eligibilityPolicyVersion,
      actionSelectionPolicyVersion: snapshot.actionSelectionPolicyVersion,
      customerSafetyPolicyVersion: "customer_report_safety.v1"
    });
    await tx.insert(reports).values({
      id: reportId,
      projectId: project.id,
      reportIssueId,
      versionNumber: 1,
      status: "draft",
      snapshotCanonicalText,
      snapshotSha256,
      factProjectionSha256: snapshot.factProjectionSha256,
      schemaVersion: snapshot.schemaVersion,
      assemblerVersion: snapshot.assemblerVersion,
      eligibilityPolicyVersion: snapshot.eligibilityPolicyVersion,
      actionSelectionPolicyVersion: snapshot.actionSelectionPolicyVersion,
      narrativePolicyVersion: snapshot.narrativePolicyVersion,
      templateVersion: snapshot.templateVersion,
      narrativeMode: snapshot.narrativeMode,
      sourceGenerationRunId: runId,
      createdByActorType: "system"
    });
    await tx
      .update(reportGenerationRuns)
      .set({ status: "validating", startedAt: new Date("2026-08-02T09:55:00.000Z") })
      .where(eq(reportGenerationRuns.id, runId));
    const claimId = randomUUID();
    const evidenceId = randomUUID();
    await tx.insert(reportClaims).values({
      id: claimId,
      reportId,
      projectId: project.id,
      claimKey: claim.claimKey,
      claimKind: claim.kind,
      section: claim.section,
      ordinal: 0,
      claimJson: claim
    });
    await tx.insert(reportEvidenceItems).values({
      id: evidenceId,
      reportId,
      projectId: project.id,
      evidenceKey: evidence.evidenceKey,
      sourceKind: evidence.sourceKind,
      sourceId: evidence.sourceId,
      sourceVersion: evidence.sourceVersion,
      proofTier: evidence.proofTier,
      observedAt: new Date(evidence.observedAt),
      selectedAtCutoff: new Date(evidence.selectedAtCutoff),
      payloadSha256: evidence.payloadSha256,
      opportunityId: opportunity.id,
      evidenceJson: evidence
    });
    await tx.insert(reportClaimEvidence).values({
      reportId,
      projectId: project.id,
      claimId,
      evidenceId
    });
    await tx
      .update(reportIssues)
      .set({ currentCandidateReportId: reportId, rowVersion: 1 })
      .where(eq(reportIssues.id, reportIssueId));
    await tx.insert(reportArtifacts).values({
      id: artifactId,
      projectId: project.id,
      reportId,
      format: "html",
      status: "pending",
      snapshotSha256,
      renderManifestJson: manifest,
      renderManifestCanonicalText: manifestCanonicalText,
      renderManifestSha256: manifestSha256,
      queueJobId: artifactId,
      requestedByUserId: user.id,
      requestId: randomUUID()
    });
    await tx
      .update(reports)
      .set({
        status: "ready_for_review",
        reviewedSnapshotSha256: snapshotSha256,
        readyAt: new Date("2026-08-02T10:00:00.000Z"),
        rowVersion: 1
      })
      .where(eq(reports.id, reportId));
    await tx
      .update(reportGenerationRuns)
      .set({ status: "succeeded", resultReportId: reportId, finishedAt: new Date("2026-08-02T10:00:00.000Z") })
      .where(eq(reportGenerationRuns.id, runId));
  });

  return {
    projectId: project.id,
    reportIssueId,
    reportId,
    artifactId,
    job: { projectId: project.id, reportId, artifactId }
  };
}

function reportSnapshot(projectId: string, opportunityId: string, observedAt: string): CustomerReportSnapshot {
  const payload = {
    sourceKind: "opportunity",
    id: opportunityId,
    projectId,
    classification: "near_term_target",
    status: "monitoring",
    title: "fassadenreinigung dachau",
    score: 70,
    updatedAt: observedAt
  };
  const sourceDigest = sha256Text(canonicalizeCustomerReportSourcePayload(payload));
  const cutoff = "2026-08-01T10:00:00.000Z";
  const factProjection = assembleCustomerReportFactProjection({
    schemaVersion: "customer_report_evidence_packet.v1",
    identity: {
      projectId,
      reportKind: "monthly_seo_progress",
      period: "2026-07",
      locale: "de-DE",
      timezone: "Europe/Berlin"
    },
    assembledAt: cutoff,
    evidenceCutoffAt: cutoff,
    evidence: [
      {
        evidenceKey: `opportunity:${opportunityId}`,
        projectId,
        sourceId: opportunityId,
        sourceVersion: sourceDigest,
        observedAt,
        selectedAtCutoff: cutoff,
        payloadSha256: sourceDigest,
        customerLabel: "fassadenreinigung dachau",
        sourceKind: "opportunity",
        proofTier: "supporting_context",
        opportunityId,
        classification: "near_term_target",
        status: "monitoring",
        title: "fassadenreinigung dachau"
      }
    ]
  });
  return CustomerReportSnapshotSchema.parse({
    schemaVersion: "customer_report_snapshot.v1",
    identity: {
      projectId,
      reportKind: "monthly_seo_progress",
      period: "2026-07",
      locale: "de-DE",
      timezone: "Europe/Berlin"
    },
    generatedAt: cutoff,
    evidenceCutoffAt: cutoff,
    assemblerVersion: "customer_report_assembler.v1",
    eligibilityPolicyVersion: "customer_report_eligibility.v1",
    actionSelectionPolicyVersion: "customer_report_actions.v1",
    narrativePolicyVersion: "customer_report_narrative.v1",
    templateVersion: "customer_report_html.v1",
    narrativeMode: "fact_only",
    title: "Local SEO Fortschritt Juli 2026",
    factProjectionSha256: sha256Text(canonicalizeCustomerReportFactProjection(factProjection)),
    factProjection,
    narrative: []
  });
}

async function returnReportToDraft(db: DatabaseClient, fixture: ReviewedReportArtifactFixture): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT "id" FROM "report_issues" WHERE "id" = ${fixture.reportIssueId} FOR UPDATE`);
    await tx.execute(sql`SELECT "id" FROM "reports" WHERE "id" = ${fixture.reportId} FOR UPDATE`);
    await tx.execute(sql`SELECT "id" FROM "report_artifacts" WHERE "id" = ${fixture.artifactId} FOR UPDATE`);
    const now = new Date("2026-08-02T10:05:00.000Z");
    await tx
      .update(reportArtifacts)
      .set({ status: "expired", expiredAt: now, updatedAt: now })
      .where(eq(reportArtifacts.id, fixture.artifactId));
    const [report] = await tx.select().from(reports).where(eq(reports.id, fixture.reportId)).limit(1);
    assert.ok(report);
    await tx
      .update(reports)
      .set({
        status: "draft",
        reviewedSnapshotSha256: null,
        readyAt: null,
        rowVersion: report.rowVersion + 1,
        updatedAt: now
      })
      .where(and(eq(reports.id, fixture.reportId), eq(reports.rowVersion, report.rowVersion)));
  });
}

class MemoryImmutableArtifactStorage implements ImmutableArtifactStoragePort {
  readonly objects = new Map<string, { body: Uint8Array; metadata: ImmutableArtifactStoredObject }>();
  writeCount = 0;

  constructor(
    private readonly beforeReturn?: () => Promise<void>,
    private readonly returnMismatchedEvidence = false
  ) {}

  async putImmutableArtifact(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
    sha256: string;
  }): Promise<ImmutableArtifactStoredObject> {
    const existing = this.objects.get(input.key);
    if (!existing) {
      this.writeCount += 1;
      this.objects.set(input.key, {
        body: new Uint8Array(input.body),
        metadata: {
          key: input.key,
          contentType: input.contentType,
          contentLength: input.body.byteLength,
          sha256: input.sha256
        }
      });
    }
    await this.beforeReturn?.();
    const stored = this.objects.get(input.key)?.metadata;
    assert.ok(stored);
    return this.returnMismatchedEvidence ? { ...stored, contentLength: stored.contentLength + 1 } : stored;
  }

  readImmutableArtifact(input: { key: string; maxBytes: number }): Promise<Uint8Array> {
    const object = this.objects.get(input.key);
    if (!object || object.body.byteLength > input.maxBytes) throw new Error("object not readable");
    return Promise.resolve(new Uint8Array(object.body));
  }

  headImmutableArtifact(input: { key: string }): Promise<ImmutableArtifactStoredObject | undefined> {
    return Promise.resolve(this.objects.get(input.key)?.metadata);
  }

  onlyBody(): Uint8Array | undefined {
    return [...this.objects.values()][0]?.body;
  }
}

type TestRecoveryQueues = WorkRecoveryQueues & { report: TestRecoveryQueue };

function recoveryQueues(): TestRecoveryQueues {
  const shared = new TestRecoveryQueue();
  return {
    "page-generation": new TestRecoveryQueue(),
    "media-processing": new TestRecoveryQueue(),
    "release-verification": new TestRecoveryQueue(),
    report: shared
  };
}

class TestRecoveryQueue implements WorkRecoveryQueue {
  readonly jobs = new Map<string, WorkRecoveryTransportJob>();
  readonly addCalls: Array<{ name: string; data: Record<string, unknown>; options: JobsOptions }> = [];

  getJob(jobId: string): Promise<WorkRecoveryTransportJob | undefined> {
    return Promise.resolve(this.jobs.get(jobId));
  }

  add(name: string, data: Record<string, unknown>, options: JobsOptions): Promise<void> {
    this.addCalls.push({ name, data, options });
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
