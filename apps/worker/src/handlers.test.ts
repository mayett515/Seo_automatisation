import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MockReasoningAdapter,
  MockSerpScoutAdapter,
  NotConfiguredReasoningAdapter,
  OpenCodeGoReasoningAdapter,
  type CrawlerPort,
  type ObjectStoragePort,
  type SerpScoutResult
} from "@localseo/adapters";
import {
  PageProposalJsonSchema,
  OpportunityScoutOutputSchema,
  type GscSearchAnalyticsRow,
  type OpportunityScoutOutput,
  type PageProposalJson,
  type SerpSnapshot
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
import {
  executePageProposal,
  PageProposalConfigurationError,
  PageProposalEvidenceError,
  PageProposalPersistenceEligibilityError,
  PageProposalWorkflowError,
  parsePageProposalJobData,
  type PageProposalRepository
} from "./handlers/page-proposal.js";
import { RollbackConfigurationError, RollbackEvidenceError, RollbackProviderFailedError } from "./handlers/rollback.js";
import {
  executeSerpScout,
  parseSerpScoutJobData,
  SerpScoutConfigurationError,
  SerpScoutEvidenceError,
  SerpScoutProviderError,
  SerpScoutTerminalError,
  type SerpScoutRepository
} from "./handlers/serp-scout.js";
import {
  executeTechnicalAudit,
  parseTechnicalAuditJobData,
  TechnicalAuditConfigurationError,
  TechnicalAuditEvidenceError,
  type TechnicalAuditRepository
} from "./handlers/technical-audit.js";
import {
  ReleaseVerificationConfigurationError,
  ReleaseVerificationEvidenceError
} from "./handlers/release-verification.js";
import {
  executeWebsiteImport,
  parseWebsiteImportJobData,
  WebsiteImportConfigurationError,
  WebsiteImportEvidenceError
} from "./handlers/website-import.js";
import {
  classifyOpportunitySignals,
  createObjectStorageAdapter,
  createReasoningAdapter,
  isTerminalWorkerError,
  parseGscSyncJobData,
  parseReleaseVerificationJobData,
  routeJob,
  toWorkerRethrowError
} from "./handlers.js";

void describe("createObjectStorageAdapter", () => {
  void it("fails closed instead of using filesystem object storage in production", () => {
    assert.throws(
      () =>
        createObjectStorageAdapter({
          NODE_ENV: "production",
          S3_BUCKET: undefined,
          AWS_REGION: "eu-central-1",
          LOCAL_OBJECT_STORAGE_DIR: ".local-object-storage"
        }),
      /Production worker storage requires S3_BUCKET/u
    );
  });
});

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

void describe("parseTechnicalAuditJobData", () => {
  void it("accepts valid technical audit job data", () => {
    assert.deepEqual(
      parseTechnicalAuditJobData({
        projectId: "project-1",
        auditRunId: "audit-1",
        sourceUrl: "https://example.test/",
        jobRunId: "job-run-1",
        triggeredByUserId: "user-1",
        triggerSource: "user_action"
      }),
      {
        projectId: "project-1",
        auditRunId: "audit-1",
        sourceUrl: "https://example.test/",
        jobRunId: "job-run-1",
        triggeredByUserId: "user-1",
        triggerSource: "user_action"
      }
    );
  });

  void it("rejects missing technical audit identifiers", () => {
    assert.throws(
      () =>
        parseTechnicalAuditJobData({
          projectId: "project-1",
          sourceUrl: "https://example.test/"
        }),
      /require projectId, auditRunId, and sourceUrl/u
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

void describe("parsePageProposalJobData", () => {
  void it("accepts valid page proposal job data", () => {
    assert.deepEqual(
      parsePageProposalJobData({
        projectId: "project-1",
        runId: "run-1",
        opportunityId: "opportunity-1",
        jobRunId: "job-run-1",
        triggeredByUserId: "user-1",
        triggerSource: "user_action"
      }),
      {
        projectId: "project-1",
        runId: "run-1",
        opportunityId: "opportunity-1",
        jobRunId: "job-run-1",
        triggeredByUserId: "user-1",
        triggerSource: "user_action"
      }
    );
  });

  void it("rejects missing page proposal identifiers", () => {
    assert.throws(
      () => parsePageProposalJobData({ projectId: "project-1", runId: "run-1" }),
      /require projectId, runId, and opportunityId/u
    );
  });
});

void describe("parseSerpScoutJobData", () => {
  void it("accepts valid SERP scout job data", () => {
    assert.deepEqual(
      parseSerpScoutJobData({
        projectId: "project-1",
        snapshotId: "snapshot-1",
        query: "dachdecker dachau",
        searchEngine: "google",
        device: "desktop",
        maxResults: 10,
        jobRunId: "job-run-1",
        triggeredByUserId: "user-1",
        triggerSource: "user_action"
      }),
      {
        projectId: "project-1",
        snapshotId: "snapshot-1",
        query: "dachdecker dachau",
        searchEngine: "google",
        device: "desktop",
        maxResults: 10,
        jobRunId: "job-run-1",
        triggeredByUserId: "user-1",
        triggerSource: "user_action"
      }
    );
  });

  void it("rejects missing SERP scout identifiers", () => {
    assert.throws(() => parseSerpScoutJobData({ projectId: "project-1" }), /require projectId, snapshotId, and query/u);
  });
});

void describe("parseReleaseVerificationJobData", () => {
  void it("accepts valid release verification job data", () => {
    assert.deepEqual(
      parseReleaseVerificationJobData({
        projectId: "project-1",
        releasePlanId: "release-1",
        deploymentId: "deployment-1",
        verificationId: "verification-1",
        jobRunId: "job-run-1",
        triggeredByUserId: "user-1",
        triggerSource: "user_action"
      }),
      {
        projectId: "project-1",
        releasePlanId: "release-1",
        deploymentId: "deployment-1",
        verificationId: "verification-1",
        jobRunId: "job-run-1",
        triggeredByUserId: "user-1",
        triggerSource: "user_action"
      }
    );
  });

  void it("rejects missing release verification identifiers", () => {
    assert.throws(
      () => parseReleaseVerificationJobData({ projectId: "project-1" }),
      /require projectId, releasePlanId, deploymentId, and verificationId/u
    );
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

  void it("routes page generation jobs to the page proposal handler instead of returning success metadata", async () => {
    await assert.rejects(
      routeJob({
        id: "page-generation-job-1",
        queueName: "page-generation",
        name: "page_generation",
        data: {
          projectId: "project-1",
          runId: "run-1",
          opportunityId: "opportunity-1"
        }
      } as Job),
      /DATABASE_URL is required for page proposal jobs/u
    );
  });

  void it("routes media processing jobs to the deterministic media handler", async () => {
    await assert.rejects(
      routeJob({
        id: "10000000-0000-4000-8000-000000000001",
        queueName: "media-processing",
        name: "media_processing",
        data: {
          projectId: "10000000-0000-4000-8000-000000000002",
          assetId: "10000000-0000-4000-8000-000000000001"
        }
      } as Job),
      /DATABASE_URL is required for media processing jobs/u
    );
  });

  void it("routes SERP scout jobs to the SERP handler instead of returning success metadata", async () => {
    await assert.rejects(
      routeJob({
        id: "serp-scout-job-1",
        queueName: "serp-scout",
        name: "serp_scout",
        data: {
          projectId: "project-1",
          snapshotId: "snapshot-1",
          query: "dachdecker dachau"
        }
      } as Job),
      /DATABASE_URL is required for SERP scout jobs/u
    );
  });

  void it("routes technical audit jobs to the audit handler instead of returning success metadata", async () => {
    await assert.rejects(
      routeJob({
        id: "technical-audit-job-1",
        queueName: "technical-audit",
        name: "technical_audit",
        data: {
          projectId: "project-1",
          auditRunId: "audit-1",
          sourceUrl: "https://example.test/"
        }
      } as Job),
      /DATABASE_URL is required for technical audit jobs/u
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
    assert.equal(isTerminalWorkerError(new PageProposalConfigurationError("missing database")), true);
    assert.equal(isTerminalWorkerError(new PageProposalEvidenceError("missing run")), true);
    assert.equal(isTerminalWorkerError(new PageProposalWorkflowError("qa_rejected")), true);
    assert.equal(isTerminalWorkerError(new SerpScoutConfigurationError("missing database")), true);
    assert.equal(isTerminalWorkerError(new SerpScoutEvidenceError("wrong snapshot")), true);
    assert.equal(isTerminalWorkerError(new SerpScoutTerminalError("captcha_blocked")), true);
    assert.equal(isTerminalWorkerError(new SerpScoutProviderError("provider_timeout")), false);
    assert.equal(isTerminalWorkerError(new TechnicalAuditConfigurationError("missing database")), true);
    assert.equal(isTerminalWorkerError(new TechnicalAuditEvidenceError("missing audit run")), true);
    assert.equal(isTerminalWorkerError(new ReleaseVerificationConfigurationError("missing database")), true);
    assert.equal(isTerminalWorkerError(new ReleaseVerificationEvidenceError("missing verification run")), true);
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
    assert.ok(toWorkerRethrowError(new PageProposalWorkflowError("qa_rejected")) instanceof UnrecoverableError);
    assert.ok(toWorkerRethrowError(new SerpScoutTerminalError("captcha_blocked")) instanceof UnrecoverableError);
    assert.ok(toWorkerRethrowError(new TechnicalAuditEvidenceError("missing audit run")) instanceof UnrecoverableError);
    assert.ok(
      toWorkerRethrowError(new ReleaseVerificationEvidenceError("missing verification run")) instanceof
        UnrecoverableError
    );
    assert.equal(toWorkerRethrowError(new Error("provider timeout")) instanceof UnrecoverableError, false);
    assert.equal(
      toWorkerRethrowError(new OpportunityScoutProviderError("provider_timeout")) instanceof UnrecoverableError,
      false
    );
    assert.equal(
      toWorkerRethrowError(new SerpScoutProviderError("provider_timeout")) instanceof UnrecoverableError,
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

void describe("executeTechnicalAudit", () => {
  void it("derives and stores technical audit findings from crawl evidence", async () => {
    const calls: string[] = [];
    const completed: { findingCount?: number } = {};
    const repository: TechnicalAuditRepository = {
      loadRun() {
        calls.push("loadRun");
        return Promise.resolve({
          id: "audit-1",
          projectId: "project-1",
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
        calls.push("markCompleted");
        completed.findingCount = input.findings.length;
        return Promise.resolve();
      },
      markFailed() {
        calls.push("markFailed");
        return Promise.resolve();
      }
    };

    const result = await executeTechnicalAudit({
      data: {
        projectId: "project-1",
        auditRunId: "audit-1",
        sourceUrl: "https://example.test/"
      },
      repository,
      crawler: fakeCrawler({
        pages: [
          {
            url: "https://example.test/noindex/",
            route: "/noindex/",
            status: 200,
            title: "Noindex",
            metaDescription: "Noindex page",
            h1: "Noindex",
            canonical: "https://example.test/noindex/",
            robots: "noindex",
            internalLinks: ["/"],
            images: [],
            schemaTypes: ["LocalBusiness"]
          }
        ]
      })
    });

    assert.deepEqual(calls, ["loadRun", "markRunning", "markCompleted"]);
    assert.equal(result.status, "completed");
    assert.equal(result.findingCount, 1);
    assert.equal(completed.findingCount, 1);
  });
});

void describe("executeSerpScout", () => {
  void it("captures a SERP snapshot with the mock adapter", async () => {
    const repository = new FakeSerpScoutRepository();
    const adapter = new MockSerpScoutAdapter();

    const result = await executeSerpScout({
      data: {
        projectId: "project-1",
        snapshotId: "snapshot-1",
        query: "dachdecker dachau",
        searchEngine: "google",
        device: "desktop",
        maxResults: 10
      },
      repository,
      serpScout: adapter,
      timeoutMs: 15_000
    });

    assert.equal(result.status, "captured");
    assert.equal(result.snapshotId, "snapshot-1");
    assert.equal(repository.snapshot?.id, "snapshot-1");
    assert.equal(repository.snapshot?.projectId, "project-1");
    assert.equal(repository.snapshot?.results.length, 1);
    assert.equal(adapter.calls[0]?.timeoutMs, 15_000);
    assert.equal(adapter.calls[0]?.snapshotId, "snapshot-1");
  });

  void it("no-ops when the snapshot was already captured", async () => {
    const repository = new FakeSerpScoutRepository();
    repository.existing = {
      id: "snapshot-1",
      projectId: "project-1",
      agentRunId: null,
      status: "captured",
      query: "dachdecker dachau",
      searchEngine: "google",
      device: "desktop",
      locale: null,
      region: null,
      cacheKey: "google:desktop:default-locale:default-region:dachdecker dachau",
      provider: "mock",
      resultsJson: [
        {
          rank: 1,
          type: "organic",
          title: "Existing result",
          url: "https://example.com/",
          domain: "example.com"
        }
      ],
      serpFeaturesJson: [],
      engineErrorsJson: [],
      artifactRefsJson: [],
      capturedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const adapter = new MockSerpScoutAdapter();

    const result = await executeSerpScout({
      data: {
        projectId: "project-1",
        snapshotId: "snapshot-1",
        query: "dachdecker dachau",
        searchEngine: "google",
        device: "desktop",
        maxResults: 10
      },
      repository,
      serpScout: adapter,
      timeoutMs: 15_000
    });

    assert.equal(result.status, "already_captured");
    assert.equal(result.resultCount, 1);
    assert.equal(adapter.calls.length, 0);
  });

  void it("persists retryable provider failures and lets BullMQ retry", async () => {
    const repository = new FakeSerpScoutRepository();
    const adapter = new MockSerpScoutAdapter({
      ok: false,
      failureCode: "provider_timeout",
      diagnostics: { latencyMs: 15_000, detail: "timeout" }
    });

    await assert.rejects(
      executeSerpScout({
        data: {
          projectId: "project-1",
          snapshotId: "snapshot-1",
          query: "dachdecker dachau",
          searchEngine: "google",
          device: "desktop",
          maxResults: 10
        },
        repository,
        serpScout: adapter,
        timeoutMs: 15_000
      }),
      SerpScoutProviderError
    );

    assert.equal(repository.failure?.failureCode, "provider_timeout");
  });

  void it("persists terminal SERP failures without retry", async () => {
    const repository = new FakeSerpScoutRepository();
    const adapter = new MockSerpScoutAdapter({
      ok: false,
      failureCode: "captcha_blocked",
      diagnostics: { latencyMs: 5, detail: "captcha" }
    });

    await assert.rejects(
      executeSerpScout({
        data: {
          projectId: "project-1",
          snapshotId: "snapshot-1",
          query: "dachdecker dachau",
          searchEngine: "google",
          device: "desktop",
          maxResults: 10
        },
        repository,
        serpScout: adapter,
        timeoutMs: 15_000
      }),
      SerpScoutTerminalError
    );

    assert.equal(repository.failure?.failureCode, "captcha_blocked");
  });

  void it("persists invalid adapter snapshots as terminal failures", async () => {
    const repository = new FakeSerpScoutRepository();
    const invalidResult = {
      ok: true,
      snapshot: {
        id: "snapshot-1",
        projectId: "project-1",
        status: "captured"
      },
      diagnostics: { latencyMs: 2 }
    } as unknown as SerpScoutResult;
    const adapter = new MockSerpScoutAdapter(invalidResult);

    await assert.rejects(
      executeSerpScout({
        data: {
          projectId: "project-1",
          snapshotId: "snapshot-1",
          query: "dachdecker dachau",
          searchEngine: "google",
          device: "desktop",
          maxResults: 10
        },
        repository,
        serpScout: adapter,
        timeoutMs: 15_000
      }),
      SerpScoutTerminalError
    );

    assert.equal(repository.failure?.failureCode, "adapter_invalid_snapshot");
    assert.equal(repository.snapshot, undefined);
  });

  void it("persists wrong-project adapter snapshots as terminal failures", async () => {
    const repository = new FakeSerpScoutRepository();
    const adapter = new MockSerpScoutAdapter((input) => ({
      ok: true,
      snapshot: {
        id: "wrong-snapshot",
        projectId: input.projectId,
        status: "captured",
        query: input.query,
        searchEngine: input.searchEngine,
        device: input.device,
        cacheKey: "google:desktop:default-locale:default-region:dachdecker dachau",
        capturedAt: new Date("2026-07-05T00:00:00.000Z").toISOString(),
        provider: "mock",
        results: [],
        serpFeatures: [],
        engineErrors: [],
        artifactRefs: []
      },
      diagnostics: { latencyMs: 2 }
    }));

    await assert.rejects(
      executeSerpScout({
        data: {
          projectId: "project-1",
          snapshotId: "snapshot-1",
          query: "dachdecker dachau",
          searchEngine: "google",
          device: "desktop",
          maxResults: 10
        },
        repository,
        serpScout: adapter,
        timeoutMs: 15_000
      }),
      SerpScoutTerminalError
    );

    assert.equal(repository.failure?.failureCode, "adapter_invalid_snapshot");
    assert.equal(repository.snapshot, undefined);
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

void describe("executePageProposal", () => {
  void it("persists a preview page proposal and succeeds the run", async () => {
    const repository = new FakePageProposalRepository();
    const reasoning = new MockReasoningAdapter({
      ok: true,
      provider: "mock",
      model: "mock-page-proposal",
      outputJson: validPageProposalJson(),
      diagnostics: { latencyMs: 18, finishReason: "stop" }
    });
    const storage = new MemoryObjectStorage();

    const result = await executePageProposal({
      data: { projectId: "project-1", runId: "run-1", opportunityId: "opportunity-1" },
      repository,
      reasoning,
      objectStorage: storage,
      reasoningTimeoutMs: 60_000
    });

    assert.equal(result.status, "succeeded");
    assert.equal(result.pageProposalId, "proposal-1");
    assert.equal(result.pageVersionId, "version-1");
    assert.equal(repository.run.status, "succeeded");
    assert.equal(repository.persistedOutput?.route, "/dachreinigung-muenchen/");
    assert.equal(repository.failed, undefined);
    assert.equal(reasoning.calls[0]?.task, "page_brief_draft");
    assert.equal(reasoning.calls[0]?.outputSchemaName, "PageProposalJson");
    assert.equal(reasoning.calls[0]?.policy.canMutateProduction, false);
    assert.deepEqual(reasoning.calls[0]?.policy.allowedToolCategories, [
      "read_evidence",
      "read_registry",
      "analyze",
      "draft_content",
      "draft_page_json",
      "render_preview"
    ]);
    assert.equal(reasoning.calls[0]?.timeoutMs, 60_000);
    assert.equal(storage.values.size, 1);
    assert.match([...storage.values.keys()][0] ?? "", /page-proposal-input\.json$/u);
  });

  void it("marks schema mismatches failed without persisting proposals", async () => {
    const repository = new FakePageProposalRepository();

    await assert.rejects(
      executePageProposal({
        data: { projectId: "project-1", runId: "run-1", opportunityId: "opportunity-1" },
        repository,
        reasoning: new MockReasoningAdapter({
          ok: true,
          provider: "mock",
          model: "mock-page-proposal",
          outputJson: { not: "PageProposalJson" },
          diagnostics: { latencyMs: 5 }
        }),
        objectStorage: new MemoryObjectStorage()
      }),
      /output_schema_mismatch/u
    );

    assert.equal(repository.failed?.failureCode, "output_schema_mismatch");
    assert.equal(repository.persistedOutput, undefined);
  });

  void it("marks route collisions failed before persistence", async () => {
    const repository = new FakePageProposalRepository();
    repository.existingRoutes = ["/dachreinigung-muenchen/"];

    await assert.rejects(
      executePageProposal({
        data: { projectId: "project-1", runId: "run-1", opportunityId: "opportunity-1" },
        repository,
        reasoning: new MockReasoningAdapter({
          ok: true,
          provider: "mock",
          model: "mock-page-proposal",
          outputJson: validPageProposalJson(),
          diagnostics: { latencyMs: 5 }
        }),
        objectStorage: new MemoryObjectStorage()
      }),
      /qa_rejected:route_collision/u
    );

    assert.equal(repository.failed?.failureCode, "qa_rejected");
    assert.equal(recordFromUnknown(repository.failed?.diagnostics).gateId, "route_collision");
    assert.equal(repository.persistedOutput, undefined);
  });

  void it("marks preview render failures failed before persistence", async () => {
    const repository = new FakePageProposalRepository();

    await assert.rejects(
      executePageProposal({
        data: { projectId: "project-1", runId: "run-1", opportunityId: "opportunity-1" },
        repository,
        reasoning: new MockReasoningAdapter({
          ok: true,
          provider: "mock",
          model: "mock-page-proposal",
          outputJson: validPageProposalJson(),
          diagnostics: { latencyMs: 5 }
        }),
        objectStorage: new MemoryObjectStorage(),
        renderPreview: () => {
          throw new Error("preview render failed");
        }
      }),
      /qa_rejected:preview_render/u
    );

    assert.equal(repository.failed?.failureCode, "qa_rejected");
    assert.equal(recordFromUnknown(repository.failed?.diagnostics).gateId, "preview_render");
    assert.equal(repository.persistedOutput, undefined);
  });

  void it("marks late opportunity lifecycle conflicts failed without persisting proposals", async () => {
    const repository = new FakePageProposalRepository();
    repository.persistSuccessError = new PageProposalPersistenceEligibilityError(
      "Opportunity is no longer eligible for page proposal persistence."
    );

    await assert.rejects(
      executePageProposal({
        data: { projectId: "project-1", runId: "run-1", opportunityId: "opportunity-1" },
        repository,
        reasoning: new MockReasoningAdapter({
          ok: true,
          provider: "mock",
          model: "mock-page-proposal",
          outputJson: validPageProposalJson(),
          diagnostics: { latencyMs: 5 }
        }),
        objectStorage: new MemoryObjectStorage()
      }),
      /qa_rejected:opportunity_lifecycle/u
    );

    assert.equal(repository.failed?.failureCode, "qa_rejected");
    assert.equal(recordFromUnknown(repository.failed?.diagnostics).gateId, "opportunity_lifecycle");
    assert.equal(repository.persistedOutput, undefined);
  });

  void it("marks missing reasoning provider config as a terminal page proposal failure", async () => {
    const repository = new FakePageProposalRepository();

    await assert.rejects(
      executePageProposal({
        data: { projectId: "project-1", runId: "run-1", opportunityId: "opportunity-1" },
        repository,
        reasoning: new NotConfiguredReasoningAdapter(),
        objectStorage: new MemoryObjectStorage()
      }),
      PageProposalConfigurationError
    );

    assert.equal(repository.failed?.failureCode, "provider_not_configured");
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

type FakeSerpSnapshotRow = NonNullable<Awaited<ReturnType<SerpScoutRepository["loadSnapshot"]>>>;

class FakeSerpScoutRepository implements SerpScoutRepository {
  existing: FakeSerpSnapshotRow | undefined;
  snapshot: SerpSnapshot | undefined;
  failure: Parameters<SerpScoutRepository["persistFailure"]>[0] | undefined;

  loadSnapshot(): Promise<FakeSerpSnapshotRow | undefined> {
    return Promise.resolve(this.existing);
  }

  persistSnapshot(snapshot: SerpSnapshot): Promise<void> {
    this.snapshot = snapshot;
    return Promise.resolve();
  }

  persistFailure(input: Parameters<SerpScoutRepository["persistFailure"]>[0]): Promise<void> {
    this.failure = input;
    return Promise.resolve();
  }
}

function fakeCrawler(overrides: Partial<Awaited<ReturnType<CrawlerPort["crawlWebsite"]>>> = {}): CrawlerPort {
  return {
    crawlWebsite(input) {
      return Promise.resolve({
        projectId: input.projectId,
        sourceUrl: input.sourceUrl,
        artifactKey: `website-imports/${input.projectId}/${input.importRunId ?? "crawl"}.json`,
        crawledAt: "2026-07-05T00:00:00.000Z",
        discoveredRoutes: ["/"],
        pages: [
          {
            url: input.sourceUrl,
            route: "/",
            status: 200,
            internalLinks: [],
            images: [],
            schemaTypes: []
          }
        ],
        skippedUrls: [],
        ...overrides
      });
    }
  };
}

class FakeOpportunityScoutRepository implements OpportunityScoutRepository {
  run: FakeAgentRun = {
    id: "run-1",
    projectId: "project-1",
    subjectId: null,
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
    recoveryCount: 0,
    lastRecoveryAt: null,
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
        maxBriefs: 6,
        gsc: { rows: [], signals: [] },
        tracking: { recentEvents: [] },
        rankingProofs: [],
        serpSnapshots: [],
        technicalAuditFindings: [],
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

class FakePageProposalRepository implements PageProposalRepository {
  run: FakeAgentRun = {
    id: "run-1",
    projectId: "project-1",
    subjectId: "opportunity-1",
    task: "page_brief_draft",
    status: "queued",
    failureCode: null,
    provider: null,
    model: null,
    inputRef: null,
    outputJson: null,
    usageJson: null,
    diagnosticsJson: null,
    latencyMs: null,
    recoveryCount: 0,
    lastRecoveryAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  existingRoutes: string[] = [];
  persistedOutput: Parameters<PageProposalRepository["persistSuccess"]>[0]["output"] | undefined;
  persistSuccessError: Error | undefined;
  failed: Parameters<PageProposalRepository["markFailed"]>[0] | undefined;

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

  loadEvidence(): ReturnType<PageProposalRepository["loadEvidence"]> {
    return Promise.resolve({
      packet: {
        projectId: "project-1",
        runId: "run-1",
        generatedAt: "2026-07-07T00:00:00.000Z",
        opportunity: {
          id: "opportunity-1",
          primaryKeyword: "dachreinigung muenchen",
          service: "Dachreinigung",
          locationName: "Muenchen",
          suggestedRoute: "/dachreinigung-muenchen/",
          uniquenessRationale: "Muenchen has dedicated Dachreinigung intent.",
          evidenceJson: {}
        },
        existingRoutes: this.existingRoutes,
        registrySummary: []
      },
      resolvableEvidence: [{ sourceType: "gsc_row", sourceId: "gsc-row-1" }],
      existingRoutes: this.existingRoutes
    });
  }

  persistSuccess(input: Parameters<PageProposalRepository["persistSuccess"]>[0]): Promise<{
    pageProposalId: string;
    pageVersionId: string;
    route: string;
    versionNumber: number;
  }> {
    if (this.persistSuccessError) {
      return Promise.reject(this.persistSuccessError);
    }

    this.persistedOutput = input.output;
    this.run.status = "succeeded";
    return Promise.resolve({
      pageProposalId: "proposal-1",
      pageVersionId: "version-1",
      route: input.output.route,
      versionNumber: 1
    });
  }

  markFailed(input: Parameters<PageProposalRepository["markFailed"]>[0]): Promise<void> {
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

function validPageProposalJson(overrides: Partial<PageProposalJson> = {}): PageProposalJson {
  return PageProposalJsonSchema.parse({
    schemaVersion: 1,
    projectId: "project-1",
    opportunityId: "opportunity-1",
    route: "/dachreinigung-muenchen/",
    primaryKeyword: "dachreinigung muenchen",
    evidenceRefs: [{ sourceType: "gsc_row", sourceId: "gsc-row-1" }],
    proposalRationale: "A dedicated Muenchen page addresses local Dachreinigung intent.",
    generation: { source: "agent", agentRunId: "run-1" },
    page: {
      schemaVersion: 1,
      route: "/dachreinigung-muenchen/",
      pageType: "service_area_page",
      target: {
        service: "Dachreinigung",
        location: "Muenchen",
        primaryKeyword: "dachreinigung muenchen",
        secondaryKeywords: ["dach reinigen muenchen"]
      },
      seo: {
        title: "Dachreinigung Muenchen",
        metaDescription: "Lokale Dachreinigung in Muenchen mit klarer Beratung und schneller Anfrage.",
        canonicalPath: "/dachreinigung-muenchen/",
        robots: "noindex",
        jsonLd: [],
        sitemapReady: true
      },
      sections: [
        {
          id: "header-1",
          type: "Header",
          registryKey: "Header.default",
          schemaVersion: 1,
          zone: "frame_top",
          order: 0,
          variant: "default",
          props: { brandName: "Muster Dachservice", navItems: [{ label: "Kontakt", href: "/kontakt/" }] }
        },
        {
          id: "hero-1",
          type: "Hero",
          registryKey: "Hero.default",
          schemaVersion: 1,
          zone: "hero",
          order: 1,
          variant: "default",
          props: {
            h1: "Dachreinigung in Muenchen",
            lead: "Gruendliche Dachreinigung fuer Immobilien in Muenchen.",
            primaryCtaLabel: "Anfragen",
            primaryCtaHref: "/kontakt/"
          }
        },
        {
          id: "intro-1",
          type: "ServiceIntro",
          registryKey: "ServiceIntro.default",
          schemaVersion: 1,
          zone: "body_intro",
          order: 2,
          variant: "default",
          props: {
            heading: "Lokale Dachpflege mit sauberem Ablauf",
            body: "Die Seite beantwortet Muenchner Suchintention mit Service, Ablauf und Kontaktmoeglichkeit."
          }
        },
        {
          id: "description-1",
          type: "ServiceDescription",
          registryKey: "ServiceDescription.default",
          schemaVersion: 1,
          zone: "body_main",
          order: 3,
          variant: "default",
          props: {
            heading: "Was die Dachreinigung umfasst",
            paragraphs: ["Moos, Schmutz und Ablagerungen werden geprueft und schonend entfernt."]
          }
        },
        {
          id: "benefits-1",
          type: "BenefitsGrid",
          registryKey: "BenefitsGrid.default",
          schemaVersion: 1,
          zone: "body_main",
          order: 4,
          variant: "default",
          props: {
            heading: "Vorteile",
            benefits: [
              { title: "Lokale Anfahrt", body: "Termine in Muenchen und Umgebung." },
              { title: "Klare Beratung", body: "Vor der Reinigung wird der Zustand nachvollziehbar besprochen." }
            ]
          }
        },
        {
          id: "faq-1",
          type: "FAQ",
          registryKey: "FAQ.default",
          schemaVersion: 1,
          zone: "body_late",
          order: 5,
          variant: "default",
          props: {
            heading: "Haeufige Fragen",
            items: [
              { question: "Wann lohnt sich eine Dachreinigung?", answer: "Wenn Moos oder Schmutz sichtbar sind." }
            ]
          }
        },
        {
          id: "areas-1",
          type: "ServiceAreaList",
          registryKey: "ServiceAreaList.default",
          schemaVersion: 1,
          zone: "body_late",
          order: 6,
          variant: "default",
          props: { heading: "Einsatzgebiet", areas: [{ name: "Muenchen", route: "/dachreinigung-muenchen/" }] }
        },
        {
          id: "cta-1",
          type: "FinalCTA",
          registryKey: "FinalCTA.default",
          schemaVersion: 1,
          zone: "cta_late",
          order: 7,
          variant: "default",
          props: {
            heading: "Dachreinigung anfragen",
            body: "Beschreiben Sie kurz das Objekt und wir melden uns.",
            ctaLabel: "Kontakt aufnehmen",
            ctaHref: "/kontakt/"
          }
        },
        {
          id: "footer-1",
          type: "Footer",
          registryKey: "Footer.default",
          schemaVersion: 1,
          zone: "frame_bottom",
          order: 8,
          variant: "default",
          props: { businessName: "Muster Dachservice", legalLinks: [{ label: "Impressum", href: "/impressum/" }] }
        }
      ],
      internalLinks: ["/kontakt/", "/impressum/"],
      evidenceRefs: [{ sourceType: "gsc_row", sourceId: "gsc-row-1" }],
      uniquenessRationale: "Muenchen bekommt eine eigenstaendige Dachreinigung-Seite mit lokalem Anfragefokus.",
      generation: { source: "agent", agentRunId: "run-1" }
    },
    ...overrides
  });
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
