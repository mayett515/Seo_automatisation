import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  agentRunEvents,
  agentRuns,
  appendAgentRunEvent,
  bindAgentRunEvidenceSource,
  claimAgentRunStep,
  claimOpportunityResearchExecution,
  completeAgentRunStep,
  customers,
  failAgentRunStep,
  jobRuns,
  opportunities,
  persistOpportunityResearchSuccess,
  projectOpportunityResearchStates,
  projects,
  users,
  type DatabaseClient
} from "@localseo/db";
import { asc, eq } from "@localseo/db/query";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";
import { DatabaseService } from "../database/database.service.js";
import { QueueProducerService } from "../queue-producer.js";
import { OpportunityResearchService } from "./opportunity-research.module.js";
import { OpportunitiesService } from "./opportunities.module.js";
import { ProjectContextService } from "./project-context.module.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;
type QueueAddCall = { name: string; data: Record<string, unknown>; options: Record<string, unknown> };

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);

void describe(
  "Opportunity Research API lifecycle integration",
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

    void it("admits one revision-bound rerun and replays its idempotency key without duplicate transport", async () => {
      const fixture = await createReadyFixture(db);
      const queueService = new QueueProducerService(testDatabaseService(db));
      const queue = new FakeQueue();
      setOpportunityResearchQueue(queueService, queue);
      const service = new OpportunityResearchService(testDatabaseService(db), queueService);
      const state = await service.getState(fixture.projectId);
      assert.deepEqual(state.readinessIssues, []);

      const idempotencyKey = randomUUID();
      const first = await service.rerun(
        fixture.projectId,
        { expectedRowVersion: state.rowVersion, idempotencyKey },
        fixture.userId
      );
      const context = new ProjectContextService(testDatabaseService(db));
      const profile = await context.getBusinessProfile(fixture.projectId);
      assert.ok(profile.currentRevision);
      await context.updateBusinessProfile(
        fixture.projectId,
        {
          expectedRowVersion: profile.rowVersion,
          profile: {
            ...profile.currentRevision.profile,
            operatingNotes: ["Material changed after the admitted response was lost."]
          },
          services: profile.services.map((service) => service.name),
          areas: profile.areas.map((area) => area.name)
        },
        fixture.userId
      );
      const replay = await service.rerun(
        fixture.projectId,
        { expectedRowVersion: state.rowVersion, idempotencyKey },
        fixture.userId
      );

      assert.equal(first.status, "queued");
      assert.equal(replay.status, "already_active");
      assert.equal(replay.runId, first.runId);
      assert.equal(replay.createdAt, first.createdAt);
      assert.equal(replay.createdBy, fixture.userId);
      assert.equal(replay.materialDigest, first.materialDigest);
      assert.equal(queue.addCalls.length, 1);
      assert.equal(queue.addCalls[0]?.name, "opportunity_research");
      assert.equal(queue.addCalls[0]?.options.jobId, first.runId);
      assert.equal(queue.addCalls[0]?.data.runId, first.runId);
      const runs = await db.select().from(agentRuns).where(eq(agentRuns.projectId, fixture.projectId));
      assert.equal(runs.length, 1);
      assert.equal(runs[0]?.workflowName, "opportunity_research");
      const events = await db
        .select()
        .from(agentRunEvents)
        .where(eq(agentRunEvents.agentRunId, first.runId))
        .orderBy(asc(agentRunEvents.sequence));
      assert.deepEqual(
        events.map((event) => event.eventType),
        ["run.queued"]
      );
    });

    void it("does not project an active legacy scout run as Opportunity Research", async () => {
      const fixture = await createReadyFixture(db);
      await db.insert(agentRuns).values({
        projectId: fixture.projectId,
        subjectId: fixture.projectId,
        task: "opportunity_scout",
        status: "queued",
        triggerSource: "user_action"
      });
      const queueService = new QueueProducerService(testDatabaseService(db));
      const queue = new FakeQueue();
      setOpportunityResearchQueue(queueService, queue);
      const service = new OpportunityResearchService(testDatabaseService(db), queueService);
      const state = await service.getState(fixture.projectId);

      await assert.rejects(
        () =>
          service.rerun(
            fixture.projectId,
            { expectedRowVersion: state.rowVersion, idempotencyKey: randomUUID() },
            fixture.userId
          ),
        /legacy Opportunity Scout run is active/iu
      );
      assert.equal(queue.addCalls.length, 0);
      assert.equal((await db.select().from(agentRuns)).length, 1);
    });

    void it("keeps a paused project visible and rejects rerun without durable or transport work", async () => {
      const fixture = await createReadyFixture(db);
      const queueService = new QueueProducerService(testDatabaseService(db));
      const queue = new FakeQueue();
      setOpportunityResearchQueue(queueService, queue);
      const service = new OpportunityResearchService(testDatabaseService(db), queueService);
      const before = await service.getState(fixture.projectId);
      const paused = await service.updatePause(
        fixture.projectId,
        { expectedRowVersion: before.rowVersion, paused: true, reason: "Operator review" },
        fixture.userId
      );

      assert.equal(paused.status, "paused");
      assert.equal(paused.pauseReason, "Operator review");
      await assert.rejects(
        () =>
          service.rerun(
            fixture.projectId,
            { expectedRowVersion: paused.rowVersion, idempotencyKey: randomUUID() },
            fixture.userId
          ),
        /paused/iu
      );
      assert.equal(queue.addCalls.length, 0);
      assert.equal((await db.select().from(agentRuns)).length, 0);
      assert.equal((await db.select().from(jobRuns)).length, 0);
    });

    void it("terminalizes run and research-state truth when queue transport rejects admission", async () => {
      const fixture = await createReadyFixture(db);
      const queueService = new QueueProducerService(testDatabaseService(db));
      setOpportunityResearchQueue(queueService, new FakeQueue(new Error("redis unavailable")));
      const service = new OpportunityResearchService(testDatabaseService(db), queueService);
      const state = await service.getState(fixture.projectId);

      await assert.rejects(
        () =>
          service.rerun(
            fixture.projectId,
            { expectedRowVersion: state.rowVersion, idempotencyKey: randomUUID() },
            fixture.userId
          ),
        /redis unavailable/u
      );

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.projectId, fixture.projectId));
      const [storedState] = await db
        .select()
        .from(projectOpportunityResearchStates)
        .where(eq(projectOpportunityResearchStates.projectId, fixture.projectId));
      assert.equal(run?.status, "failed");
      assert.equal(run?.failureCode, "queue_enqueue_failed");
      assert.equal(storedState?.status, "failed");
      assert.equal(storedState?.activeRunId, null);
      const events = await db
        .select()
        .from(agentRunEvents)
        .where(eq(agentRunEvents.agentRunId, run?.id ?? ""))
        .orderBy(asc(agentRunEvents.sequence));
      assert.deepEqual(
        events.map((event) => event.eventType),
        ["run.queued", "run.failed"]
      );
    });

    void it("returns only the project-scoped bounded workflow timeline", async () => {
      const fixture = await createReadyFixture(db);
      const other = await createReadyFixture(db);
      const queueService = new QueueProducerService(testDatabaseService(db));
      setOpportunityResearchQueue(queueService, new FakeQueue());
      const service = new OpportunityResearchService(testDatabaseService(db), queueService);
      const state = await service.getState(fixture.projectId);
      const admitted = await service.rerun(
        fixture.projectId,
        { expectedRowVersion: state.rowVersion, idempotencyKey: randomUUID() },
        fixture.userId
      );
      assert.ok(admitted.materialDigest);
      const jobRunId = await loadOpportunityResearchJobRunId(db, admitted.runId);
      const execution = await claimOpportunityResearchExecution(db, {
        projectId: fixture.projectId,
        runId: admitted.runId,
        materialDigest: admitted.materialDigest,
        triggerSource: "user_action",
        jobRunId,
        executionClaimToken: "timeline-redaction:attempt-1"
      });
      assert.equal(execution.kind, "claimed");
      if (execution.kind !== "claimed") throw new Error("Expected Opportunity Research execution claim.");
      const step = await claimAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: admitted.runId,
        stepKey: "redaction_check",
        stepKind: "agent",
        agentRole: "research_agent",
        eventKey: "step.redaction-check.started",
        maxAttempts: 1,
        expectedExecutionEpoch: execution.executionEpoch
      });
      assert.equal(step.kind, "claimed");
      if (step.kind !== "claimed") throw new Error("Expected timeline test step claim.");
      await appendAgentRunEvent(db, {
        projectId: fixture.projectId,
        runId: admitted.runId,
        stepId: step.stepId,
        eventKey: "provider.raw-body.redacted",
        eventType: "tool.result.captured",
        payload: { rawProviderBody: "secret-provider-response" },
        expectedExecutionEpoch: execution.executionEpoch
      });
      await failAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: admitted.runId,
        stepId: step.stepId,
        expectedRowVersion: step.rowVersion,
        expectedExecutionEpoch: execution.executionEpoch,
        failureCode: "provider_rejected",
        failureMessage: "secret-provider-failure-detail",
        eventKey: "step.redaction-check.failed"
      });

      const timeline = await service.timeline(fixture.projectId, admitted.runId);
      assert.equal(timeline.projectId, fixture.projectId);
      assert.equal(timeline.runId, admitted.runId);
      assert.deepEqual(
        timeline.events.map((event) => event.eventType),
        ["run.queued", "run.started", "step.started", "tool.result.captured", "step.failed"]
      );
      assert.equal(timeline.steps[0]?.failureCode, "provider_rejected");
      assert.equal(Object.hasOwn(timeline.steps[0] ?? {}, "failureMessage"), false);
      assert.equal(
        timeline.events.some((event) => Object.hasOwn(event, "payload")),
        false
      );
      assert.equal(JSON.stringify(timeline).includes("secret-provider"), false);
      assert.deepEqual(timeline.evidence, []);
      await assert.rejects(() => service.timeline(other.projectId, admitted.runId), /not found/iu);
    });

    void it("projects persisted research candidates and their exact evidence citations into the Explorer", async () => {
      const fixture = await createReadyFixture(db);
      const opportunitiesService = new OpportunitiesService(testDatabaseService(db));
      const capturedProof = await opportunitiesService.createRankingProof(
        fixture.projectId,
        {
          query: "dachreinigung dachau",
          pageUrl: "https://example.test/dachreinigung-dachau",
          rank: 4,
          capturedAt: new Date().toISOString(),
          searchEngine: "google.de",
          device: "desktop"
        },
        fixture.userId
      );
      const proof = await opportunitiesService.updateRankingProofStatus(
        fixture.projectId,
        capturedProof.id,
        { status: "reviewed", expectedStatus: "captured", expectedRowVersion: capturedProof.rowVersion },
        fixture.userId
      );
      const queueService = new QueueProducerService(testDatabaseService(db));
      setOpportunityResearchQueue(queueService, new FakeQueue());
      const researchService = new OpportunityResearchService(testDatabaseService(db), queueService);
      const state = await researchService.getState(fixture.projectId);
      const admitted = await researchService.rerun(
        fixture.projectId,
        { expectedRowVersion: state.rowVersion, idempotencyKey: randomUUID() },
        fixture.userId
      );
      assert.ok(admitted.materialDigest);
      const jobRunId = await loadOpportunityResearchJobRunId(db, admitted.runId);
      const execution = await claimOpportunityResearchExecution(db, {
        projectId: fixture.projectId,
        runId: admitted.runId,
        materialDigest: admitted.materialDigest,
        triggerSource: "user_action",
        jobRunId,
        executionClaimToken: "api-projection-test:attempt-1"
      });
      assert.equal(execution.kind, "claimed");
      if (execution.kind !== "claimed") throw new Error("Expected Opportunity Research execution claim.");
      const researchPlan = await claimAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: admitted.runId,
        stepKey: "research-plan-agent.v2",
        stepKind: "agent",
        agentRole: "ResearchAgent",
        eventKey: "step.started.api-projection.research-plan",
        maxAttempts: 3,
        expectedExecutionEpoch: execution.executionEpoch
      });
      assert.equal(researchPlan.kind, "claimed");
      if (researchPlan.kind !== "claimed") throw new Error("Expected the research-plan step claim.");
      await completeAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: admitted.runId,
        stepId: researchPlan.stepId,
        expectedRowVersion: researchPlan.rowVersion,
        expectedExecutionEpoch: execution.executionEpoch,
        outputJson: { planned: true },
        eventKey: "step.succeeded.api-projection.research-plan"
      });
      const followUp = await claimAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: admitted.runId,
        stepKey: "follow-up-capture.v2",
        stepKind: "tool",
        toolKey: "public_web_search_follow_up",
        eventKey: "step.started.api-projection.follow-up",
        maxAttempts: 3,
        expectedExecutionEpoch: execution.executionEpoch
      });
      assert.equal(followUp.kind, "claimed");
      if (followUp.kind !== "claimed") throw new Error("Expected the follow-up step claim.");
      await completeAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: admitted.runId,
        stepId: followUp.stepId,
        expectedRowVersion: followUp.rowVersion,
        expectedExecutionEpoch: execution.executionEpoch,
        outputJson: { captures: [] },
        eventKey: "step.succeeded.api-projection.follow-up"
      });
      const strategy = await claimAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: admitted.runId,
        stepKey: "seo-strategy-agent.v2",
        stepKind: "agent",
        agentRole: "SeoStrategyAgent",
        eventKey: "step.started.api-projection.strategy",
        maxAttempts: 3,
        expectedExecutionEpoch: execution.executionEpoch
      });
      assert.equal(strategy.kind, "claimed");
      if (strategy.kind !== "claimed") throw new Error("Expected the strategy step claim.");
      await bindAgentRunEvidenceSource(db, {
        projectId: fixture.projectId,
        runId: admitted.runId,
        stepId: strategy.stepId,
        role: "cited",
        ordinal: 0,
        evidence: {
          evidenceKey: `ranking_proof:${proof.id}`,
          sourceKind: "ranking_proof",
          sourceId: proof.id,
          sourceVersion: "row-version:1"
        },
        expectedExecutionEpoch: execution.executionEpoch,
        eventKey: "evidence.cited.api-projection.strategy.0"
      });
      const candidate = {
        serviceId: fixture.serviceId,
        areaId: fixture.areaId,
        service: "Dachreinigung",
        area: "Dachau",
        primaryKeyword: "dachreinigung dachau",
        secondaryKeywords: ["dachpflege dachau"],
        suggestedRoute: "/dachreinigung-dachau",
        suggestedPageType: "normal_page" as const,
        businessValue: "high" as const,
        marketDifficulty: "medium" as const,
        executionEffort: "low" as const,
        evidenceKeys: [`ranking_proof:${proof.id}`],
        rationale: "Reviewed ranking evidence supports defending this service-area page.",
        missingEvidence: ["Confirm conversion value."],
        confidence: 0.8
      };
      const output = { candidates: [candidate], captures: [], research: { followUpQueries: [], findings: [] } };
      await completeAgentRunStep(db, {
        projectId: fixture.projectId,
        runId: admitted.runId,
        stepId: strategy.stepId,
        expectedRowVersion: strategy.rowVersion,
        expectedExecutionEpoch: execution.executionEpoch,
        outputJson: output,
        eventKey: "step.succeeded.api-projection.strategy"
      });
      await persistOpportunityResearchSuccess(db, {
        projectId: fixture.projectId,
        runId: admitted.runId,
        materialDigest: admitted.materialDigest,
        output,
        candidates: [
          {
            id: randomUUID(),
            projectId: fixture.projectId,
            agentRunId: admitted.runId,
            serviceId: fixture.serviceId,
            areaId: fixture.areaId,
            primaryKeyword: candidate.primaryKeyword,
            rankingMilestone: "top_5",
            evidenceReadiness: "reviewed_proof",
            businessValue: candidate.businessValue,
            marketDifficulty: candidate.marketDifficulty,
            executionEffort: candidate.executionEffort,
            lane: "defend_advance",
            policyVersion: "opportunity-portfolio.v1",
            researchMaterialDigest: admitted.materialDigest,
            evidenceJson: {
              workflowVersion: "opportunity-research.v2",
              candidate,
              derivedAxes: {
                rankingMilestone: "top_5",
                evidenceReadiness: "reviewed_proof",
                businessValue: candidate.businessValue,
                marketDifficulty: candidate.marketDifficulty,
                executionEffort: candidate.executionEffort,
                lane: "defend_advance"
              },
              citedEvidenceKeys: candidate.evidenceKeys
            }
          }
        ],
        provider: "test",
        model: "test",
        expectedExecutionEpoch: execution.executionEpoch
      });

      const list = await opportunitiesService.listOpportunities(fixture.projectId);

      assert.equal(list.opportunities.length, 1);
      assert.equal(list.opportunities[0]?.research?.candidate.service, "Dachreinigung");
      assert.deepEqual(list.opportunities[0]?.research?.candidate.missingEvidence, ["Confirm conversion value."]);
      assert.equal(list.opportunities[0]?.research?.citations[0]?.evidenceKey, `ranking_proof:${proof.id}`);
      assert.equal(list.opportunities[0]?.research?.citations[0]?.proofTier, "customer_safe_proof");
      assert.match(list.opportunities[0]?.research?.citations[0]?.summary ?? "", /Human-reviewed ranking proof/u);
      assert.equal(list.opportunities[0]?.evidenceJson, null);
      const persistedOpportunityId = list.opportunities[0]?.id;
      assert.ok(persistedOpportunityId);
      await assert.rejects(
        () =>
          db.transaction(async (tx) => {
            await tx
              .update(opportunities)
              .set({ primaryKeyword: "forged after persistence" })
              .where(eq(opportunities.id, persistedOpportunityId));
          }),
        postgresErrorMatches(/strategy and provenance are immutable/iu)
      );
      await assert.rejects(
        () =>
          db.transaction(async (tx) => {
            await tx
              .update(opportunities)
              .set({ status: "brief_created", updatedAt: new Date() })
              .where(eq(opportunities.id, persistedOpportunityId));
          }),
        postgresErrorMatches(/requires a durable same-project page proposal/iu)
      );
      await assert.rejects(
        () =>
          db.transaction(async (tx) => {
            await tx
              .update(opportunities)
              .set({
                status: "rejected",
                decidedByUserId: fixture.userId,
                statusReason: null,
                updatedAt: new Date()
              })
              .where(eq(opportunities.id, persistedOpportunityId));
          }),
        postgresErrorMatches(/require a reason/iu)
      );
      const [outsider] = await db
        .insert(users)
        .values({ email: `${randomUUID()}@example.test`, name: "Research Outsider" })
        .returning();
      assert.ok(outsider);
      await assert.rejects(
        () =>
          db.transaction(async (tx) => {
            await tx
              .update(opportunities)
              .set({ status: "held", decidedByUserId: outsider.id, updatedAt: new Date() })
              .where(eq(opportunities.id, persistedOpportunityId));
          }),
        postgresErrorMatches(/actor must have write authority/iu)
      );
      await assert.rejects(
        () =>
          db.transaction(async (tx) => {
            await tx.delete(opportunities).where(eq(opportunities.id, persistedOpportunityId));
          }),
        postgresErrorMatches(/durable product truth/iu)
      );
    });
  }
);

async function createReadyFixture(
  db: DatabaseClient
): Promise<{ projectId: string; userId: string; serviceId: string; areaId: string }> {
  const [user] = await db
    .insert(users)
    .values({ email: `${randomUUID()}@example.test`, name: "Research Operator" })
    .returning();
  assert.ok(user);
  const [customer] = await db
    .insert(customers)
    .values({ name: `Research ${randomUUID()}`, ownerUserId: user.id })
    .returning();
  assert.ok(customer);
  const [project] = await db
    .insert(projects)
    .values({ customerId: customer.id, name: `Research ${randomUUID()}` })
    .returning();
  assert.ok(project);

  const context = new ProjectContextService(testDatabaseService(db));
  const draft = await context.updateBusinessProfile(
    project.id,
    {
      expectedRowVersion: 0,
      profile: {
        businessName: "Research GmbH",
        websiteUrl: "https://example.test/",
        differentiators: [],
        targetCustomers: [],
        operatingNotes: []
      },
      services: ["Dachreinigung"],
      areas: ["Dachau"]
    },
    user.id
  );
  assert.ok(draft.currentRevision && draft.services[0] && draft.areas[0]);
  await context.confirmBusinessProfile(
    project.id,
    {
      expectedRowVersion: draft.rowVersion,
      expectedRevisionId: draft.currentRevision.id,
      serviceIds: [draft.services[0].id],
      areaIds: [draft.areas[0].id]
    },
    user.id
  );
  const opportunitiesService = new OpportunitiesService(testDatabaseService(db));
  const capturedProof = await opportunitiesService.createRankingProof(
    project.id,
    {
      query: "dachreinigung dachau",
      pageUrl: "https://example.test/dachreinigung-dachau/",
      rank: 4,
      capturedAt: new Date().toISOString(),
      searchEngine: "google.de",
      device: "desktop"
    },
    user.id
  );
  await opportunitiesService.updateRankingProofStatus(
    project.id,
    capturedProof.id,
    { status: "reviewed", expectedStatus: "captured", expectedRowVersion: capturedProof.rowVersion },
    user.id
  );
  return {
    projectId: project.id,
    userId: user.id,
    serviceId: draft.services[0].id,
    areaId: draft.areas[0].id
  };
}

async function loadOpportunityResearchJobRunId(db: DatabaseClient, runId: string): Promise<string> {
  const [audit] = await db.select({ id: jobRuns.id }).from(jobRuns).where(eq(jobRuns.externalJobId, runId)).limit(1);
  assert.ok(audit);
  return audit.id;
}

function testDatabaseService(db: DatabaseClient): DatabaseService {
  return {
    get db() {
      return db;
    },
    requireDb: () => db,
    isConfigured: () => true,
    ping: () => Promise.resolve("up"),
    onModuleDestroy: () => Promise.resolve()
  } as unknown as DatabaseService;
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

function setOpportunityResearchQueue(service: QueueProducerService, queue: FakeQueue): void {
  (service as unknown as { queues: { "opportunity-research"?: unknown } }).queues["opportunity-research"] = queue;
}

class FakeQueue {
  readonly addCalls: QueueAddCall[] = [];

  constructor(private readonly addError?: Error) {}

  getJob(): Promise<undefined> {
    return Promise.resolve(undefined);
  }

  add(name: string, data: Record<string, unknown>, options: Record<string, unknown>): Promise<{ id?: string }> {
    if (this.addError) return Promise.reject(this.addError);
    this.addCalls.push({ name, data, options });
    return Promise.resolve({ id: typeof options.jobId === "string" ? options.jobId : undefined });
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
