import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MockReasoningAdapter,
  NotConfiguredReasoningAdapter,
  OpenCodeGoReasoningAdapter,
  type ObjectStoragePort
} from "@localseo/adapters";
import {
  OpportunityScoutOutputSchema,
  type GscSearchAnalyticsRow,
  type OpportunityScoutOutput
} from "@localseo/contracts";
import { UnrecoverableError, type Job } from "bullmq";
import {
  DeployConfigurationError,
  DeployEvidenceError,
  ManualReconciliationRequiredError,
  ProviderDeployTerminalStatusError
} from "./handlers/deploy.js";
import { GscSyncFailureError } from "./handlers/gsc-sync.js";
import {
  executeOpportunityScout,
  OpportunityScoutConfigurationError,
  OpportunityScoutEvidenceError,
  OpportunityScoutProviderError,
  OpportunityScoutWorkflowError,
  parseOpportunityScoutJobData,
  type OpportunityScoutRepository
} from "./handlers/opportunity-scout.js";
import { RollbackConfigurationError, RollbackEvidenceError, RollbackProviderFailedError } from "./handlers/rollback.js";
import {
  executeWebsiteImport,
  parseWebsiteImportJobData,
  WebsiteImportConfigurationError,
  WebsiteImportEvidenceError
} from "./handlers/website-import.js";
import {
  classifyOpportunitySignals,
  createReasoningAdapter,
  isTerminalWorkerError,
  parseGscSyncJobData,
  routeJob,
  toWorkerRethrowError
} from "./handlers.js";

void describe("parseGscSyncJobData", () => {
  void it("accepts valid GSC sync job data", () => {
    assert.deepEqual(
      parseGscSyncJobData({
        projectId: "project-1",
        syncRunId: "sync-1"
      }),
      {
        projectId: "project-1",
        syncRunId: "sync-1"
      }
    );
  });

  void it("preserves optional actor metadata", () => {
    assert.deepEqual(
      parseGscSyncJobData({
        projectId: "project-1",
        syncRunId: "sync-1",
        jobRunId: "job-run-1",
        triggeredByUserId: "user-1",
        triggerSource: "user_action"
      }),
      {
        projectId: "project-1",
        syncRunId: "sync-1",
        jobRunId: "job-run-1",
        triggeredByUserId: "user-1",
        triggerSource: "user_action"
      }
    );
  });

  void it("rejects missing sync identifiers", () => {
    assert.throws(() => parseGscSyncJobData({ projectId: "project-1" }), /requires projectId and syncRunId/u);
  });
});

void describe("parseWebsiteImportJobData", () => {
  void it("accepts valid website import job data", () => {
    assert.deepEqual(
      parseWebsiteImportJobData({
        projectId: "project-1",
        importRunId: "import-1",
        sourceUrl: "https://example.test/",
        triggeredByUserId: "user-1",
        triggerSource: "user_action"
      }),
      {
        projectId: "project-1",
        importRunId: "import-1",
        sourceUrl: "https://example.test/",
        triggeredByUserId: "user-1",
        triggerSource: "user_action"
      }
    );
  });

  void it("rejects missing import run identifiers", () => {
    assert.throws(
      () =>
        parseWebsiteImportJobData({
          projectId: "project-1",
          sourceUrl: "https://example.test/"
        }),
      /require projectId, importRunId, and sourceUrl/u
    );
  });
});

void describe("parseOpportunityScoutJobData", () => {
  void it("accepts valid opportunity scout job data", () => {
    assert.deepEqual(
      parseOpportunityScoutJobData({
        projectId: "project-1",
        runId: "run-1",
        maxBriefs: 6,
        jobRunId: "job-run-1",
        triggeredByUserId: "user-1",
        triggerSource: "user_action"
      }),
      {
        projectId: "project-1",
        runId: "run-1",
        maxBriefs: 6,
        jobRunId: "job-run-1",
        triggeredByUserId: "user-1",
        triggerSource: "user_action"
      }
    );
  });

  void it("rejects missing opportunity scout identifiers", () => {
    assert.throws(() => parseOpportunityScoutJobData({ projectId: "project-1" }), /require projectId and runId/u);
  });
});

void describe("classifyOpportunitySignals", () => {
  void it("flags impression/no-click and page-two opportunity signals", () => {
    assert.deepEqual(
      classifyOpportunitySignals(
        row({
          clicks: 0,
          impressions: 12,
          pageUrl: "https://example.test/dachreinigung-dachau/",
          position: 17
        })
      ),
      ["impressions_no_clicks", "positions_11_100", "service_location_query"]
    );
  });

  void it("flags wrong-page service-location matches after German normalization", () => {
    assert.deepEqual(
      classifyOpportunitySignals(
        row({
          query: "Entrümpelung Dachau",
          pageUrl: "https://example.test/entruempelung-muenchen/",
          clicks: 1,
          impressions: 30,
          position: 8
        })
      ),
      ["service_location_query", "wrong_page_service_location"]
    );
  });
});

void describe("routeJob", () => {
  void it("routes deploy jobs to the deploy handler instead of returning success metadata", async () => {
    await assert.rejects(
      routeJob({
        id: "deploy-job-1",
        queueName: "deploy",
        name: "deploy",
        data: {
          projectId: "project-1",
          releasePlanId: "release-1",
          deploymentKey: "release_plan:release-1"
        }
      } as Job),
      /DATABASE_URL is required for deploy jobs/u
    );
  });

  void it("routes rollback jobs to the rollback handler instead of returning success metadata", async () => {
    await assert.rejects(
      routeJob({
        id: "rollback-job-1",
        queueName: "rollback",
        name: "rollback",
        data: {
          projectId: "project-1",
          releasePlanId: "release-1",
          deploymentId: "deployment-1",
          rollbackPointId: "rollback-point-1"
        }
      } as Job),
      /DATABASE_URL is required for rollback jobs/u
    );
  });

  void it("routes website import jobs to the import handler instead of returning success metadata", async () => {
    await assert.rejects(
      routeJob({
        id: "website-import-job-1",
        queueName: "website-import",
        name: "website_import",
        data: {
          projectId: "project-1",
          importRunId: "import-1",
          sourceUrl: "https://example.test/"
        }
      } as Job),
      /DATABASE_URL is required for website import jobs/u
    );
  });

  void it("routes opportunity scout jobs to the scout handler instead of returning success metadata", async () => {
    await assert.rejects(
      routeJob({
        id: "opportunity-scout-job-1",
        queueName: "opportunity-scout",
        name: "opportunity_scout",
        data: {
          projectId: "project-1",
          runId: "run-1"
        }
      } as Job),
      /DATABASE_URL is required for opportunity scout jobs/u
    );
  });

  void it("fails unknown jobs honestly instead of returning success metadata", async () => {
    await assert.rejects(
      routeJob({
        id: "unknown-job-1",
        queueName: "seo-qa",
        name: "score",
        data: {}
      } as Job),
      /Worker job is not implemented: seo-qa:score/u
    );
  });
});

void describe("createReasoningAdapter", () => {
  void it("uses the mock adapter unless a real provider is explicitly selected", () => {
    const adapter = createReasoningAdapter({
      AI_REASONING_PROVIDER: "mock",
      AI_REASONING_MODEL: "glm-5.2",
      AI_REASONING_OPENCODE_GO_API_KEY: undefined,
      AI_REASONING_OPENCODE_GO_ENDPOINT: "https://opencode.ai/zen/go/v1/chat/completions"
    });

    assert.ok(adapter instanceof MockReasoningAdapter);
  });

  void it("degrades to a not-configured adapter when the real provider key is missing", () => {
    const adapter = createReasoningAdapter({
      AI_REASONING_PROVIDER: "opencode_go",
      AI_REASONING_MODEL: "glm-5.2",
      AI_REASONING_OPENCODE_GO_API_KEY: undefined,
      AI_REASONING_OPENCODE_GO_ENDPOINT: "https://opencode.ai/zen/go/v1/chat/completions"
    });

    assert.ok(adapter instanceof NotConfiguredReasoningAdapter);
  });

  void it("creates the OpenCode Go adapter only with explicit provider config", () => {
    const adapter = createReasoningAdapter({
      AI_REASONING_PROVIDER: "opencode_go",
      AI_REASONING_MODEL: "glm-5.2",
      AI_REASONING_OPENCODE_GO_API_KEY: "test-key",
      AI_REASONING_OPENCODE_GO_ENDPOINT: "https://opencode.ai/zen/go/v1/chat/completions"
    });

    assert.ok(adapter instanceof OpenCodeGoReasoningAdapter);
  });
});

void describe("isTerminalWorkerError", () => {
  void it("treats deploy configuration and evidence errors as terminal worker failures", () => {
    assert.equal(isTerminalWorkerError(new DeployConfigurationError("missing adapter")), true);
    assert.equal(isTerminalWorkerError(new DeployEvidenceError("not deployable")), true);
    assert.equal(isTerminalWorkerError(new ManualReconciliationRequiredError("manual reconciliation")), true);
    assert.equal(isTerminalWorkerError(new ProviderDeployTerminalStatusError("failed")), true);
    assert.equal(isTerminalWorkerError(new RollbackConfigurationError("missing hosting site")), true);
    assert.equal(isTerminalWorkerError(new RollbackEvidenceError("missing rollback evidence")), true);
    assert.equal(isTerminalWorkerError(new RollbackProviderFailedError("provider failed")), true);
    assert.equal(isTerminalWorkerError(new WebsiteImportConfigurationError("missing database")), true);
    assert.equal(isTerminalWorkerError(new WebsiteImportEvidenceError("missing import run")), true);
    assert.equal(isTerminalWorkerError(new OpportunityScoutConfigurationError("missing database")), true);
    assert.equal(isTerminalWorkerError(new OpportunityScoutEvidenceError("missing run")), true);
    assert.equal(isTerminalWorkerError(new OpportunityScoutWorkflowError("qa_rejected")), true);
    assert.equal(isTerminalWorkerError(new OpportunityScoutProviderError("provider_timeout")), false);
    assert.equal(
      isTerminalWorkerError(new GscSyncFailureError("google_refresh_token_invalid", { reconnectRequired: true })),
      true
    );
    assert.equal(isTerminalWorkerError(new GscSyncFailureError("google_oauth_refresh_failed")), false);
    assert.equal(isTerminalWorkerError(new Error("provider timeout")), false);
  });

  void it("maps terminal worker errors to BullMQ unrecoverable errors", () => {
    const mapped = toWorkerRethrowError(new DeployEvidenceError("not deployable"));

    assert.ok(mapped instanceof UnrecoverableError);
    assert.equal(mapped.message, "not deployable");
    assert.ok(
      toWorkerRethrowError(
        new GscSyncFailureError("refresh_token_decrypt_failed", { reconnectRequired: true })
      ) instanceof UnrecoverableError
    );
    assert.ok(toWorkerRethrowError(new ProviderDeployTerminalStatusError("rolled_back")) instanceof UnrecoverableError);
    assert.ok(toWorkerRethrowError(new WebsiteImportEvidenceError("missing import run")) instanceof UnrecoverableError);
    assert.ok(toWorkerRethrowError(new OpportunityScoutWorkflowError("qa_rejected")) instanceof UnrecoverableError);
    assert.equal(toWorkerRethrowError(new Error("provider timeout")) instanceof UnrecoverableError, false);
    assert.equal(
      toWorkerRethrowError(new OpportunityScoutProviderError("provider_timeout")) instanceof UnrecoverableError,
      false
    );
  });
});

void describe("executeWebsiteImport", () => {
  void it("stores completed crawl evidence through the repository", async () => {
    const calls: string[] = [];

    const result = await executeWebsiteImport({
      data: {
        projectId: "project-1",
        importRunId: "import-1",
        sourceUrl: "https://example.test/"
      },
      repository: {
        loadRun() {
          calls.push("loadRun");
          return Promise.resolve({
            id: "import-1",
            projectId: "project-1",
            mainWebsiteId: "main-1",
            sourceUrl: "https://example.test/",
            status: "queued",
            artifactKey: null,
            summaryJson: null,
            failureJson: null,
            startedAt: null,
            completedAt: null,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        },
        markRunning() {
          calls.push("markRunning");
          return Promise.resolve();
        },
        markCompleted(input) {
          calls.push(`markCompleted:${input.snapshot.artifactKey}`);
          return Promise.resolve();
        },
        markFailed() {
          calls.push("markFailed");
          return Promise.resolve();
        }
      },
      crawler: {
        crawlWebsite() {
          calls.push("crawlWebsite");
          return Promise.resolve({
            projectId: "project-1",
            sourceUrl: "https://example.test/",
            artifactKey: "website-imports/project-1/import-1.json",
            crawledAt: new Date().toISOString(),
            discoveredRoutes: ["/"],
            pages: [
              {
                url: "https://example.test/",
                route: "/",
                status: 200,
                internalLinks: [],
                images: [],
                schemaTypes: []
              }
            ],
            skippedUrls: []
          });
        }
      }
    });

    assert.deepEqual(calls, [
      "loadRun",
      "markRunning",
      "crawlWebsite",
      "markCompleted:website-imports/project-1/import-1.json"
    ]);
    assert.equal(result.status, "completed");
    assert.equal(result.artifactKey, "website-imports/project-1/import-1.json");
  });
});

void describe("executeOpportunityScout", () => {
  void it("persists accepted opportunities and succeeds the run", async () => {
    const repository = new FakeOpportunityScoutRepository();
    const reasoning = new MockReasoningAdapter({
      ok: true,
      provider: "mock",
      model: "mock-opportunity-scout",
      outputJson: validOpportunityScoutOutput(),
      diagnostics: { latencyMs: 12, finishReason: "stop" }
    });
    const storage = new MemoryObjectStorage();

    const result = await executeOpportunityScout({
      data: { projectId: "project-1", runId: "run-1" },
      repository,
      reasoning,
      objectStorage: storage,
      reasoningTimeoutMs: 45_000
    });

    assert.equal(result.status, "succeeded");
    assert.equal(result.opportunityCount, 1);
    assert.equal(repository.run.status, "succeeded");
    assert.equal(repository.persistedOutput?.briefs.length, 1);
    assert.equal(repository.failed, undefined);
    assert.equal(reasoning.calls[0]?.policy.canMutateProduction, false);
    assert.equal(reasoning.calls[0]?.timeoutMs, 45_000);
    assert.equal(storage.values.size, 1);
  });

  void it("marks adapter failures failed but retryable", async () => {
    const repository = new FakeOpportunityScoutRepository();

    await assert.rejects(
      executeOpportunityScout({
        data: { projectId: "project-1", runId: "run-1" },
        repository,
        reasoning: new MockReasoningAdapter({
          ok: false,
          provider: "mock",
          failureCode: "provider_timeout",
          diagnostics: { latencyMs: 120_000, detail: "timeout" }
        }),
        objectStorage: new MemoryObjectStorage()
      }),
      /provider_timeout/u
    );

    assert.equal(repository.failed?.failureCode, "provider_timeout");
    assert.equal(repository.persistedOutput, undefined);
  });

  void it("marks missing reasoning provider config as a terminal run failure", async () => {
    const repository = new FakeOpportunityScoutRepository();

    await assert.rejects(
      executeOpportunityScout({
        data: { projectId: "project-1", runId: "run-1" },
        repository,
        reasoning: new NotConfiguredReasoningAdapter(),
        objectStorage: new MemoryObjectStorage()
      }),
      OpportunityScoutConfigurationError
    );

    assert.equal(repository.failed?.failureCode, "provider_not_configured");
    assert.equal(repository.failed?.diagnostics.detail, "ai_reasoning_provider_not_configured");
    assert.equal(repository.persistedOutput, undefined);
  });

  void it("marks schema mismatches failed without persisting opportunities", async () => {
    const repository = new FakeOpportunityScoutRepository();

    await assert.rejects(
      executeOpportunityScout({
        data: { projectId: "project-1", runId: "run-1" },
        repository,
        reasoning: new MockReasoningAdapter({
          ok: true,
          provider: "mock",
          model: "mock-opportunity-scout",
          outputJson: { not: "the schema" },
          diagnostics: { latencyMs: 5 }
        }),
        objectStorage: new MemoryObjectStorage()
      }),
      /output_schema_mismatch/u
    );

    assert.equal(repository.failed?.failureCode, "output_schema_mismatch");
    assert.equal(repository.persistedOutput, undefined);
  });

  void it("marks QA rejection failed without persisting opportunities", async () => {
    const repository = new FakeOpportunityScoutRepository();

    await assert.rejects(
      executeOpportunityScout({
        data: { projectId: "project-1", runId: "run-1" },
        repository,
        reasoning: new MockReasoningAdapter({
          ok: true,
          provider: "mock",
          model: "mock-opportunity-scout",
          outputJson: validOpportunityScoutOutput({
            classification: "proven_win",
            recommendedAction: "monitor"
          }),
          diagnostics: { latencyMs: 5 }
        }),
        objectStorage: new MemoryObjectStorage()
      }),
      /qa_rejected:proof_gate/u
    );

    assert.equal(repository.failed?.failureCode, "qa_rejected");
    assert.ok(recordFromUnknown(repository.failed?.outputJson).raw);
    assert.equal(repository.persistedOutput, undefined);
  });
});

function row(input: Partial<GscSearchAnalyticsRow>): GscSearchAnalyticsRow {
  return {
    projectId: "project-1",
    propertyUrl: "https://example.test/",
    query: "dachreinigung dachau",
    pageUrl: "https://example.test/dachreinigung/",
    clicks: 0,
    impressions: 0,
    ctr: 0,
    position: 1,
    ...input
  };
}

type FakeAgentRun = NonNullable<Awaited<ReturnType<OpportunityScoutRepository["loadRun"]>>>;

class FakeOpportunityScoutRepository implements OpportunityScoutRepository {
  run: FakeAgentRun = {
    id: "run-1",
    projectId: "project-1",
    task: "opportunity_scout",
    status: "queued",
    failureCode: null,
    provider: null,
    model: null,
    inputRef: null,
    outputJson: null,
    usageJson: null,
    diagnosticsJson: null,
    latencyMs: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  persistedOutput: Parameters<OpportunityScoutRepository["persistSuccess"]>[0]["output"] | undefined;
  failed: Parameters<OpportunityScoutRepository["markFailed"]>[0] | undefined;

  loadRun(): Promise<FakeAgentRun> {
    return Promise.resolve(this.run);
  }

  markRunning(): Promise<boolean> {
    this.run.status = "running";
    return Promise.resolve(true);
  }

  recordInputRef(input: { inputRef: string }): Promise<void> {
    this.run.inputRef = input.inputRef;
    return Promise.resolve();
  }

  loadEvidence(): ReturnType<OpportunityScoutRepository["loadEvidence"]> {
    return Promise.resolve({
      packet: {
        projectId: "project-1",
        generatedAt: "2026-07-03T00:00:00.000Z",
        gsc: { rows: [], signals: [] },
        tracking: { recentEvents: [] },
        rankingProofs: [],
        existingRoutes: [],
        existingOpportunityKeys: []
      },
      resolvableEvidence: [{ sourceType: "gsc_row", sourceId: "gsc-row-1" }],
      existingRoutes: [],
      existingOpportunityKeys: []
    });
  }

  persistSuccess(
    input: Parameters<OpportunityScoutRepository["persistSuccess"]>[0]
  ): Promise<{ opportunityCount: number }> {
    this.persistedOutput = input.output;
    this.run.status = "succeeded";
    return Promise.resolve({ opportunityCount: input.output.briefs.length });
  }

  markFailed(input: Parameters<OpportunityScoutRepository["markFailed"]>[0]): Promise<void> {
    this.failed = input;
    this.run.status = "failed";
    return Promise.resolve();
  }
}

class MemoryObjectStorage implements ObjectStoragePort {
  readonly values = new Map<string, unknown>();

  putJson(input: { key: string; value: unknown }): Promise<{ key: string }> {
    this.values.set(input.key, input.value);
    return Promise.resolve({ key: input.key });
  }

  getJson(input: { key: string }): Promise<unknown> {
    return Promise.resolve(this.values.get(input.key));
  }
}

function validOpportunityScoutOutput(
  overrides: Partial<OpportunityScoutOutput["briefs"][number]> = {}
): OpportunityScoutOutput {
  return OpportunityScoutOutputSchema.parse({
    briefs: [
      {
        projectId: "project-1",
        classification: "near_term_target",
        service: "Entruempelung",
        location: {
          name: "Dachau",
          kind: "city",
          adjacencyReason: "gsc_testing_signal",
          existingClusterStrength: "weak",
          evidence: []
        },
        primaryKeyword: "entruempelung dachau",
        secondaryKeywords: [],
        suggestedRoute: "/entruempelung-dachau/",
        suggestedPageType: "normal_page",
        evidence: [
          {
            sourceType: "gsc_row",
            sourceId: "gsc-row-1",
            summary: "GSC shows impressions for Dachau intent.",
            strength: "medium",
            proofTier: "internal_signal"
          }
        ],
        competitorObservations: [],
        groupHints: [],
        hubSpokeRole: "spoke",
        uniquenessRationale: "Dachau has distinct local intent and a wrong-page signal.",
        cannibalizationRisk: { level: "low", conflictingRoutes: [] },
        missingEvidence: ["Manual SERP proof"],
        confidence: 0.72,
        recommendedAction: "create_brief",
        ...overrides
      }
    ],
    groups: []
  });
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
