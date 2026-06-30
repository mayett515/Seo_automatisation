import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ObjectStoragePort, SiteHostingPort } from "@localseo/adapters";
import type { DeployJobData, ReleaseCheck } from "@localseo/contracts";
import { buildReleaseDeploymentKey } from "@localseo/domain";
import {
  buildReleaseArtifactKey,
  executeDeploy,
  parseDeployJobData,
  type DeployContext,
  type DeployRepository,
  type DeploymentRow,
  type ReleasePlanRow
} from "./deploy.js";

void describe("parseDeployJobData", () => {
  void it("accepts deploy jobs with a stable deployment key", () => {
    const releasePlanId = "release-1";

    assert.deepEqual(
      parseDeployJobData({
        projectId: "project-1",
        releasePlanId,
        deploymentKey: buildReleaseDeploymentKey(releasePlanId),
        triggeredByUserId: "user-1",
        triggerSource: "user_action"
      }),
      {
        projectId: "project-1",
        releasePlanId,
        deploymentKey: buildReleaseDeploymentKey(releasePlanId),
        triggeredByUserId: "user-1",
        triggerSource: "user_action"
      }
    );
  });

  void it("rejects deployment keys that do not match the release plan", () => {
    assert.throws(
      () =>
        parseDeployJobData({
          projectId: "project-1",
          releasePlanId: "release-1",
          deploymentKey: "release_plan:other-release"
        }),
      /deploymentKey does not match releasePlanId/u
    );
  });
});

void describe("executeDeploy", () => {
  void it("creates a deployment ledger row and persists provider success", async () => {
    const data = deployJobData();
    const repository = createRepository();
    const result = await executeDeploy({
      data,
      jobId: data.deploymentKey,
      objectStorage: createObjectStorage(),
      repository,
      siteHosting: createSiteHosting({
        status: "ready",
        providerDeployId: "provider-deploy-1",
        liveUrls: ["https://example.test/"]
      })
    });

    assert.equal(result.status, "provider_succeeded");
    assert.equal(result.providerDeployId, "provider-deploy-1");
    assert.equal(repository.started.length, 1);
    assert.equal(repository.providerStarted.length, 1);
    assert.equal(repository.providerSucceeded.length, 1);
    assert.equal(repository.failed.length, 0);
  });

  void it("marks deployment and release failed when hosting is not configured", async () => {
    const data = deployJobData();
    const repository = createRepository();

    await assert.rejects(
      executeDeploy({
        data,
        jobId: data.deploymentKey,
        objectStorage: createObjectStorage(),
        repository,
        siteHosting: createSiteHosting({
          status: "not_configured",
          message: "Site hosting is not configured.",
          liveUrls: []
        })
      }),
      /Site hosting is not configured/u
    );

    assert.equal(repository.started.length, 1);
    assert.equal(repository.providerStarted.length, 0);
    assert.equal(repository.providerSucceeded.length, 0);
    assert.equal(repository.failed.length, 1);
  });

  void it("marks provider begin failures for manual reconciliation after the in-flight marker", async () => {
    const data = deployJobData();
    const repository = createRepository();

    await assert.rejects(
      executeDeploy({
        data,
        isFinalAttempt: false,
        jobId: data.deploymentKey,
        objectStorage: createObjectStorage(),
        repository,
        siteHosting: createSiteHosting(new Error("provider timeout"))
      }),
      /manual reconciliation/u
    );

    assert.equal(repository.started.length, 1);
    assert.equal(repository.providerStarted.length, 0);
    assert.equal(repository.manualReconciliation.length, 1);
    assert.equal(repository.providerSucceeded.length, 0);
    assert.equal(repository.failed.length, 0);
  });

  void it("persists provider ids for newly pending provider deploys without marking success", async () => {
    const data = deployJobData();
    const repository = createRepository();

    await assert.rejects(
      executeDeploy({
        data,
        isFinalAttempt: false,
        jobId: data.deploymentKey,
        objectStorage: createObjectStorage(),
        repository,
        siteHosting: createSiteHosting({
          status: "pending",
          providerDeployId: "provider-deploy-1",
          liveUrls: ["https://example.test/"]
        })
      }),
      /Provider deploy is pending/u
    );

    assert.equal(repository.started.length, 1);
    assert.equal(repository.providerStarted.length, 1);
    assert.equal(repository.providerPending.length, 1);
    assert.equal(repository.providerSucceeded.length, 0);
    assert.equal(repository.failed.length, 0);
  });

  void it("marks upload failures failed on the final attempt after the provider id is recorded", async () => {
    const data = deployJobData();
    const repository = createRepository();

    await assert.rejects(
      executeDeploy({
        data,
        isFinalAttempt: true,
        jobId: data.deploymentKey,
        objectStorage: createObjectStorage(),
        repository,
        siteHosting: createSiteHosting(
          {
            status: "ready",
            providerDeployId: "provider-deploy-1",
            liveUrls: ["https://example.test/"]
          },
          undefined,
          { uploadError: new Error("upload failed") }
        )
      }),
      /upload failed/u
    );

    assert.equal(repository.started.length, 1);
    assert.equal(repository.providerStarted.length, 1);
    assert.equal(repository.providerSucceeded.length, 0);
    assert.equal(repository.failed.length, 1);
  });

  void it("replays an already successful deployment without creating another provider deploy", async () => {
    const data = deployJobData();
    const repository = createRepository(
      deployContext({
        existingDeployment: deploymentRow({
          status: "provider_succeeded",
          providerDeployId: "provider-deploy-1"
        })
      })
    );
    const result = await executeDeploy({
      data,
      jobId: data.deploymentKey,
      objectStorage: createObjectStorage(),
      repository,
      siteHosting: createSiteHosting(new Error("provider should not be called"))
    });

    assert.equal(result.status, "already_deployed");
    assert.equal(repository.started.length, 0);
    assert.equal(repository.releaseLiveCount, 1);
  });

  void it("marks manual reconciliation when a previous provider mutation was in flight without a provider id", async () => {
    const data = deployJobData();
    const repository = createRepository(
      deployContext({
        existingDeployment: deploymentRow({
          status: "deploying",
          providerOperationStatus: "in_flight",
          providerDeployId: null
        })
      })
    );

    await assert.rejects(
      executeDeploy({
        data,
        jobId: data.deploymentKey,
        objectStorage: createObjectStorage(),
        repository,
        siteHosting: createSiteHosting(new Error("provider should not be called"))
      }),
      /manual reconciliation is required/u
    );

    assert.equal(repository.started.length, 0);
    assert.equal(repository.providerInFlight.length, 0);
    assert.equal(repository.manualReconciliation.length, 1);
    assert.equal(repository.failed.length, 0);
  });

  void it("reconciles an existing provider deploy before creating another deploy", async () => {
    const data = deployJobData();
    const repository = createRepository(
      deployContext({
        existingDeployment: deploymentRow({
          status: "deploying",
          providerDeployId: "provider-deploy-1"
        })
      })
    );
    const result = await executeDeploy({
      data,
      jobId: data.deploymentKey,
      objectStorage: createObjectStorage(),
      repository,
      siteHosting: createSiteHosting(new Error("provider should not create another deploy"), {
        providerDeployId: "provider-deploy-1",
        status: "ready",
        liveUrls: ["https://example.test/"]
      })
    });

    assert.equal(result.status, "provider_succeeded");
    assert.equal(result.reconciled, true);
    assert.equal(repository.started.length, 0);
    assert.equal(repository.providerStarted.length, 0);
    assert.equal(repository.providerSucceeded.length, 1);
  });

  void it("resumes upload from persisted provider evidence while reconciling a pending deploy", async () => {
    const data = deployJobData();
    const resumeToken = { adapter: "test", requiredDigests: ["digest-1"] };
    const uploadCalls: Array<Parameters<SiteHostingPort["uploadDeployFiles"]>[0]> = [];
    const repository = createRepository(
      deployContext({
        existingDeployment: deploymentRow({
          status: "deploying",
          providerDeployId: "provider-deploy-1",
          evidenceJson: {
            provider: {
              resumeToken
            }
          }
        })
      })
    );

    await assert.rejects(
      executeDeploy({
        data,
        isFinalAttempt: false,
        jobId: data.deploymentKey,
        objectStorage: createObjectStorage(),
        repository,
        siteHosting: createSiteHosting(new Error("provider should not create another deploy"), undefined, {
          getDeploySnapshots: [
            {
              providerDeployId: "provider-deploy-1",
              status: "pending",
              liveUrls: []
            },
            {
              providerDeployId: "provider-deploy-1",
              status: "deploying",
              liveUrls: []
            }
          ],
          uploadCalls
        })
      }),
      /Provider deploy is still deploying/u
    );

    assert.equal(uploadCalls.length, 1);
    assert.deepEqual(uploadCalls[0]?.resumeToken, resumeToken);
    assert.equal(repository.providerPending.length, 1);
    assert.equal(repository.failed.length, 0);
  });

  void it("does not re-upload when a recorded provider deploy is already building", async () => {
    const data = deployJobData();
    const uploadCalls: Array<Parameters<SiteHostingPort["uploadDeployFiles"]>[0]> = [];
    const repository = createRepository(
      deployContext({
        existingDeployment: deploymentRow({
          status: "deploying",
          providerDeployId: "provider-deploy-1",
          evidenceJson: {
            provider: {
              resumeToken: { adapter: "test", requiredDigests: ["digest-1"] },
              upload: { status: "completed" }
            }
          }
        })
      })
    );

    await assert.rejects(
      executeDeploy({
        data,
        isFinalAttempt: false,
        jobId: data.deploymentKey,
        objectStorage: createObjectStorage(),
        repository,
        siteHosting: createSiteHosting(
          new Error("provider should not create another deploy"),
          {
            providerDeployId: "provider-deploy-1",
            status: "deploying",
            liveUrls: []
          },
          {
            uploadCalls
          }
        )
      }),
      /Provider deploy is still deploying/u
    );

    assert.equal(uploadCalls.length, 0);
    assert.equal(repository.providerPending.length, 1);
    assert.equal(repository.failed.length, 0);
  });

  void it("re-uploads when provider state is deploying but local upload completion is not recorded", async () => {
    const data = deployJobData();
    const resumeToken = { adapter: "test", requiredDigests: ["digest-1"] };
    const uploadCalls: Array<Parameters<SiteHostingPort["uploadDeployFiles"]>[0]> = [];
    const repository = createRepository(
      deployContext({
        existingDeployment: deploymentRow({
          status: "deploying",
          providerDeployId: "provider-deploy-1",
          evidenceJson: {
            provider: {
              resumeToken
            }
          }
        })
      })
    );

    await assert.rejects(
      executeDeploy({
        data,
        isFinalAttempt: false,
        jobId: data.deploymentKey,
        objectStorage: createObjectStorage(),
        repository,
        siteHosting: createSiteHosting(new Error("provider should not create another deploy"), undefined, {
          getDeploySnapshots: [
            {
              providerDeployId: "provider-deploy-1",
              status: "deploying",
              liveUrls: []
            },
            {
              providerDeployId: "provider-deploy-1",
              status: "deploying",
              liveUrls: []
            }
          ],
          uploadCalls
        })
      }),
      /Provider deploy is still deploying/u
    );

    assert.equal(uploadCalls.length, 1);
    assert.deepEqual(uploadCalls[0]?.resumeToken, resumeToken);
    assert.equal(repository.providerUploadCompleted.length, 1);
    assert.equal(repository.providerPending.length, 1);
    assert.equal(repository.failed.length, 0);
  });

  void it("keeps an existing provider deploy in progress instead of marking release failed", async () => {
    const data = deployJobData();
    const repository = createRepository(
      deployContext({
        existingDeployment: deploymentRow({
          status: "deploying",
          providerDeployId: "provider-deploy-1"
        })
      })
    );

    await assert.rejects(
      executeDeploy({
        data,
        isFinalAttempt: false,
        jobId: data.deploymentKey,
        objectStorage: createObjectStorage(),
        repository,
        siteHosting: createSiteHosting(new Error("provider should not create another deploy"), {
          providerDeployId: "provider-deploy-1",
          status: "deploying",
          liveUrls: []
        })
      }),
      /Provider deploy is still deploying/u
    );

    assert.equal(repository.started.length, 0);
    assert.equal(repository.providerSucceeded.length, 0);
    assert.equal(repository.failed.length, 0);
  });

  void it("leaves pending provider deploys reconcilable after the final attempt", async () => {
    const data = deployJobData();
    const repository = createRepository(
      deployContext({
        existingDeployment: deploymentRow({
          status: "deploying",
          providerDeployId: "provider-deploy-1"
        })
      })
    );

    await assert.rejects(
      executeDeploy({
        data,
        isFinalAttempt: true,
        jobId: data.deploymentKey,
        objectStorage: createObjectStorage(),
        repository,
        siteHosting: createSiteHosting(new Error("provider should not create another deploy"), {
          providerDeployId: "provider-deploy-1",
          status: "deploying",
          liveUrls: []
        })
      }),
      /Provider deploy is still deploying/u
    );

    assert.equal(repository.started.length, 0);
    assert.equal(repository.providerSucceeded.length, 0);
    assert.equal(repository.failed.length, 0);
  });

  void it("allows first deploys without rollback point evidence", async () => {
    const data = deployJobData();
    const repository = createRepository(
      deployContext({
        rollbackPointCount: 0,
        priorSuccessfulDeploymentCount: 0
      })
    );
    const result = await executeDeploy({
      data,
      jobId: data.deploymentKey,
      objectStorage: createObjectStorage(),
      repository,
      siteHosting: createSiteHosting({
        status: "ready",
        providerDeployId: "provider-deploy-1",
        liveUrls: ["https://example.test/"]
      })
    });

    assert.equal(result.status, "provider_succeeded");
    assert.equal(repository.started.length, 1);
    assert.equal(repository.providerStarted.length, 1);
    assert.equal(repository.failed.length, 0);
  });

  void it("requires rollback point evidence after a prior successful deployment", async () => {
    const data = deployJobData();
    const repository = createRepository(
      deployContext({
        rollbackPointCount: 0,
        priorSuccessfulDeploymentCount: 1
      })
    );

    await assert.rejects(
      executeDeploy({
        data,
        jobId: data.deploymentKey,
        objectStorage: createObjectStorage(),
        repository,
        siteHosting: createSiteHosting(new Error("provider should not be called"))
      }),
      /Release is not deployable/u
    );

    assert.equal(repository.started.length, 0);
    assert.equal(repository.failed.length, 1);
  });

  void it("fails when persisted worker evidence is no longer deployable", async () => {
    const data = deployJobData();
    const repository = createRepository(
      deployContext({
        checks: [releaseCheck({ severity: "blocker", result: "failed" })]
      })
    );

    await assert.rejects(
      executeDeploy({
        data,
        jobId: data.deploymentKey,
        objectStorage: createObjectStorage(),
        repository,
        siteHosting: createSiteHosting(new Error("provider should not be called"))
      }),
      /Release is not deployable/u
    );

    assert.equal(repository.started.length, 0);
    assert.equal(repository.failed.length, 1);
  });

  void it("replays a deployment row that became successful during start without creating another provider deploy", async () => {
    const data = deployJobData();
    const repository = createRepository(deployContext(), {
      startDeploymentResult: deploymentRow({
        status: "provider_succeeded",
        providerDeployId: "provider-deploy-1"
      })
    });

    const result = await executeDeploy({
      data,
      jobId: data.deploymentKey,
      objectStorage: createObjectStorage(),
      repository,
      siteHosting: createSiteHosting(new Error("provider should not be called"))
    });

    assert.equal(result.status, "already_deployed");
    assert.equal(repository.started.length, 1);
    assert.equal(repository.providerSucceeded.length, 0);
    assert.equal(repository.releaseLiveCount, 1);
  });

  void it("does not continue when start returns a manual reconciliation row", async () => {
    const data = deployJobData();
    const repository = createRepository(deployContext(), {
      startDeploymentResult: deploymentRow({
        status: "deploying",
        providerOperationStatus: "manual_reconciliation_required"
      })
    });

    await assert.rejects(
      executeDeploy({
        data,
        jobId: data.deploymentKey,
        objectStorage: createObjectStorage(),
        repository,
        siteHosting: createSiteHosting(new Error("provider should not be called"))
      }),
      /manual reconciliation/u
    );

    assert.equal(repository.started.length, 1);
    assert.equal(repository.providerInFlight.length, 0);
    assert.equal(repository.failed.length, 0);
  });

  void it("does not overwrite manual reconciliation rows on retry", async () => {
    const data = deployJobData();
    const repository = createRepository(
      deployContext({
        existingDeployment: deploymentRow({
          status: "deploying",
          providerOperationStatus: "manual_reconciliation_required",
          providerDeployId: null
        })
      })
    );

    await assert.rejects(
      executeDeploy({
        data,
        jobId: data.deploymentKey,
        objectStorage: createObjectStorage(),
        repository,
        siteHosting: createSiteHosting(new Error("provider should not be called"))
      }),
      /manual reconciliation/u
    );

    assert.equal(repository.started.length, 0);
    assert.equal(repository.providerInFlight.length, 0);
    assert.equal(repository.failed.length, 0);
  });

  void it("records provider deploy ids before upload failures are retried", async () => {
    const data = deployJobData();
    const repository = createRepository();

    await assert.rejects(
      executeDeploy({
        data,
        isFinalAttempt: false,
        jobId: data.deploymentKey,
        objectStorage: createObjectStorage(),
        repository,
        siteHosting: createSiteHosting(
          {
            status: "ready",
            providerDeployId: "provider-deploy-1",
            liveUrls: ["https://example.test/"]
          },
          undefined,
          { uploadError: new Error("upload failed") }
        )
      }),
      /upload failed/u
    );

    assert.equal(repository.providerStarted.length, 1);
    assert.equal(repository.providerSucceeded.length, 0);
    assert.equal(repository.failed.length, 0);
  });

  void it("marks manual reconciliation when provider id persistence fails after begin", async () => {
    const data = deployJobData();
    const repository = createRepository(deployContext(), {
      markProviderDeployStartedError: new Error("db write failed")
    });

    await assert.rejects(
      executeDeploy({
        data,
        isFinalAttempt: true,
        jobId: data.deploymentKey,
        objectStorage: createObjectStorage(),
        repository,
        siteHosting: createSiteHosting({
          status: "ready",
          providerDeployId: "provider-deploy-1",
          liveUrls: ["https://example.test/"]
        })
      }),
      /manual reconciliation/u
    );

    assert.equal(repository.providerStarted.length, 1);
    assert.equal(repository.manualReconciliation.length, 1);
    assert.equal(repository.providerSucceeded.length, 0);
    assert.equal(repository.failed.length, 0);
  });
});

void describe("buildReleaseArtifactKey", () => {
  void it("uses a deterministic artifact key for the approved release artifact", () => {
    assert.equal(buildReleaseArtifactKey("release-1"), "releases/release-1/approved-artifact.json");
  });
});

function deployJobData(input: Partial<DeployJobData> = {}): DeployJobData {
  const releasePlanId = input.releasePlanId ?? "release-1";

  return {
    projectId: "project-1",
    releasePlanId,
    deploymentKey: buildReleaseDeploymentKey(releasePlanId),
    ...input
  };
}

function deployContext(input: Partial<DeployContext> = {}): DeployContext {
  return {
    plan: releasePlanRow(),
    checks: [releaseCheck({ severity: "blocker", result: "passed" })],
    hasApproval: true,
    hostingSiteId: "netlify-site-1",
    releaseItems: [
      {
        id: "release-item-1",
        pageVersionId: "page-version-1",
        targetUrl: "/",
        targetSubdomain: null,
        action: "publish",
        pageJson: { title: "Home" }
      }
    ],
    rollbackPointCount: 1,
    priorSuccessfulDeploymentCount: 1,
    ...input
  };
}

function releasePlanRow(input: Partial<ReleasePlanRow> = {}): ReleasePlanRow {
  const now = new Date("2026-06-29T00:00:00.000Z");

  return {
    id: "release-1",
    projectId: "project-1",
    createdByAgentId: null,
    status: "approved_for_deploy",
    summary: "Release plan",
    riskLevel: "low",
    blockerCount: 0,
    warningCount: 0,
    approvedAt: now,
    deployedAt: null,
    createdAt: now,
    updatedAt: now,
    ...input
  };
}

function deploymentRow(input: Partial<DeploymentRow> = {}): DeploymentRow {
  const now = new Date("2026-06-29T00:00:00.000Z");

  return {
    id: "deployment-1",
    projectId: "project-1",
    releasePlanId: "release-1",
    deploymentKey: buildReleaseDeploymentKey("release-1"),
    provider: "netlify",
    providerDeployId: null,
    providerOperationStatus: "not_started",
    liveUrl: null,
    status: "deploying",
    verificationStatus: "not_started",
    verifiedAt: null,
    evidenceJson: null,
    createdAt: now,
    updatedAt: now,
    ...input
  };
}

function releaseCheck(input: Pick<ReleaseCheck, "severity" | "result">): ReleaseCheck {
  return {
    checkKey: `${input.severity}-${input.result}`,
    scope: "project",
    severity: input.severity,
    result: input.result,
    message: "test check"
  };
}

function createRepository(
  context: DeployContext = deployContext(),
  options: { startDeploymentResult?: DeploymentRow; markProviderDeployStartedError?: Error } = {}
): DeployRepository & {
  started: unknown[];
  providerSucceeded: unknown[];
  providerStarted: unknown[];
  providerUploadCompleted: unknown[];
  providerPending: unknown[];
  providerInFlight: unknown[];
  manualReconciliation: unknown[];
  failed: unknown[];
  readonly releaseLiveCount: number;
} {
  const calls = {
    started: [] as unknown[],
    providerSucceeded: [] as unknown[],
    providerStarted: [] as unknown[],
    providerUploadCompleted: [] as unknown[],
    providerPending: [] as unknown[],
    providerInFlight: [] as unknown[],
    manualReconciliation: [] as unknown[],
    failed: [] as unknown[],
    releaseLiveCount: 0
  };

  return {
    started: calls.started,
    providerSucceeded: calls.providerSucceeded,
    providerStarted: calls.providerStarted,
    providerUploadCompleted: calls.providerUploadCompleted,
    providerPending: calls.providerPending,
    providerInFlight: calls.providerInFlight,
    manualReconciliation: calls.manualReconciliation,
    failed: calls.failed,
    get releaseLiveCount() {
      return calls.releaseLiveCount;
    },
    loadContext: () => Promise.resolve(context),
    startDeployment: (input) => {
      calls.started.push(input);
      return Promise.resolve(options.startDeploymentResult ?? deploymentRow());
    },
    markProviderSucceeded: (input) => {
      calls.providerSucceeded.push(input);
      return Promise.resolve(
        deploymentRow({
          status: "provider_succeeded",
          providerDeployId: input.result.providerDeployId,
          liveUrl: input.result.liveUrls[0] ?? null
        })
      );
    },
    markProviderPending: (input) => {
      calls.providerPending.push(input);
      return Promise.resolve(
        deploymentRow({
          status: "deploying",
          providerDeployId: input.result.providerDeployId,
          liveUrl: input.result.liveUrls[0] ?? null
        })
      );
    },
    markProviderDeployStarted: (input) => {
      calls.providerStarted.push(input);

      if (options.markProviderDeployStartedError) {
        return Promise.reject(options.markProviderDeployStartedError);
      }

      return Promise.resolve(
        deploymentRow({
          status: "deploying",
          providerDeployId: input.result.providerDeployId,
          providerOperationStatus: "recorded",
          liveUrl: input.result.liveUrls[0] ?? null,
          evidenceJson: {
            provider: {
              resumeToken: input.result.resumeToken ?? null
            }
          }
        })
      );
    },
    markProviderUploadCompleted: (input) => {
      calls.providerUploadCompleted.push(input);
      return Promise.resolve(
        deploymentRow({
          status: "deploying",
          providerDeployId: input.providerDeployId,
          providerOperationStatus: "recorded",
          evidenceJson: {
            provider: {
              resumeToken: null,
              upload: {
                status: "completed"
              }
            }
          }
        })
      );
    },
    markProviderMutationInFlight: (input) => {
      calls.providerInFlight.push(input);
      return Promise.resolve(
        deploymentRow({
          status: "deploying",
          providerOperationStatus: "in_flight"
        })
      );
    },
    markManualReconciliationRequired: (input) => {
      calls.manualReconciliation.push(input);
      return Promise.resolve(
        deploymentRow({
          status: "deploying",
          providerOperationStatus: "manual_reconciliation_required"
        })
      );
    },
    markReleaseLive: () => {
      calls.releaseLiveCount += 1;
      return Promise.resolve();
    },
    markFailed: (_data, error) => {
      calls.failed.push(error);
      return Promise.resolve();
    }
  };
}

function createSiteHosting(
  result: Awaited<ReturnType<SiteHostingPort["createDeploy"]>> | Error,
  snapshot?: Awaited<ReturnType<SiteHostingPort["getDeploy"]>>,
  options: {
    uploadError?: Error;
    uploadCalls?: Array<Parameters<SiteHostingPort["uploadDeployFiles"]>[0]>;
    getDeploySnapshots?: Array<Awaited<ReturnType<SiteHostingPort["getDeploy"]>>>;
  } = {}
): SiteHostingPort {
  const defaultSnapshot =
    result instanceof Error || result.status === "not_configured"
      ? {
          providerDeployId: "provider-deploy-1",
          status: "unknown" as const,
          liveUrls: []
        }
      : {
          providerDeployId: result.providerDeployId,
          status: result.status === "ready" ? ("ready" as const) : ("deploying" as const),
          liveUrls: result.liveUrls,
          evidence: result.evidence
        };
  const providerSnapshot = snapshot ?? defaultSnapshot;
  let getDeployIndex = 0;

  return {
    beginDeploy: () => {
      if (result instanceof Error) {
        return Promise.reject(result);
      }

      if (result.status === "not_configured") {
        return Promise.resolve(result);
      }

      return Promise.resolve({
        status: "started" as const,
        providerDeployId: result.providerDeployId,
        liveUrls: result.liveUrls,
        resumeToken: { adapter: "test", requiredDigests: [] },
        evidence: result.evidence
      });
    },
    uploadDeployFiles: (input) => {
      options.uploadCalls?.push(input);

      if (options.uploadError) {
        return Promise.reject(options.uploadError);
      }

      return Promise.resolve({
        evidence: { adapter: "test" }
      });
    },
    createDeploy: () => {
      if (result instanceof Error) {
        return Promise.reject(result);
      }

      return Promise.resolve(result);
    },
    getDeploy: () => {
      const nextSnapshot = options.getDeploySnapshots?.[getDeployIndex];
      getDeployIndex += 1;

      return Promise.resolve(nextSnapshot ?? providerSnapshot);
    },
    restoreDeploy: () =>
      Promise.resolve({
        artifactKey: "rollback/release-1/previous-stable.json"
      }),
    rollbackDeploy: () =>
      Promise.resolve({
        status: "failed"
      })
  };
}

function createObjectStorage(): ObjectStoragePort {
  const values = new Map<string, unknown>();

  return {
    putJson: (input) => {
      values.set(input.key, input.value);
      return Promise.resolve({ key: input.key });
    },
    getJson: (input) => Promise.resolve(values.get(input.key))
  };
}
