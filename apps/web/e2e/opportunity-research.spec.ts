import { expect, test, type Route } from "@playwright/test";

const projectId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const historicalRunId = "22222222-2222-4222-8222-333333333333";
const stepId = "33333333-3333-4333-8333-333333333333";
const historicalStepId = "33333333-3333-4333-8333-444444444444";
const profileRevisionId = "44444444-4444-4444-8444-444444444444";
const serviceId = "55555555-5555-4555-8555-555555555555";
const areaId = "66666666-6666-4666-8666-666666666666";
const knowledgeDocumentId = "77777777-7777-4777-8777-777777777777";
const knowledgeVersionId = "88888888-8888-4888-8888-888888888888";
const proofId = "99999999-9999-4999-8999-999999999999";
const opportunityId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const eventId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const timestamp = "2026-08-09T08:00:00.000Z";
const digest = "c".repeat(64);

test("operates Opportunity Research from source truth without mobile overflow", async ({ page }) => {
  const commands: Array<{ path: string; body: unknown }> = [];

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!["fetch", "xhr"].includes(request.resourceType())) {
      await route.continue();
      return;
    }
    if (path === "/health") {
      await json(route, { status: "ok", service: "local-seo-api", stack: {} });
      return;
    }
    if (!path.startsWith(`/projects/${projectId}`)) {
      await route.continue();
      return;
    }

    if (path.endsWith("/opportunities")) {
      await json(route, { projectId, opportunities: [opportunity()] });
      return;
    }
    if (path.endsWith("/agent-runs")) {
      const task = new URL(request.url()).searchParams.get("task");
      await json(route, {
        projectId,
        runs: task === "opportunity_scout" ? [researchRun(), historicalResearchRun()] : []
      });
      return;
    }
    if (path.endsWith(`/agent-runs/${runId}/timeline`) || path.endsWith(`/agent-runs/${historicalRunId}/timeline`)) {
      await json(route, path.includes(historicalRunId) ? historicalTimeline() : timeline());
      return;
    }
    if (path.endsWith("/ranking-proofs") && request.method() === "GET") {
      await json(route, { projectId, proofs: [rankingProof("captured", 0)] });
      return;
    }
    if (path.endsWith(`/ranking-proofs/${proofId}/status`) && request.method() === "PATCH") {
      commands.push({ path, body: request.postDataJSON() });
      await json(route, rankingProof("reviewed", 1));
      return;
    }
    if (path.endsWith("/opportunity-research") && request.method() === "GET") {
      await json(route, researchState());
      return;
    }
    if (path.endsWith("/opportunity-research/rerun") && request.method() === "POST") {
      commands.push({ path, body: request.postDataJSON() });
      await json(route, {
        jobId: runId,
        projectId,
        type: "opportunity_research",
        status: "queued",
        runId,
        materialDigest: digest,
        createdAt: timestamp
      });
      return;
    }
    if (path.endsWith("/business-profile") && request.method() === "GET") {
      await json(route, businessProfile());
      return;
    }
    if (path.endsWith("/knowledge") && request.method() === "GET") {
      await json(route, { projectId, records: [knowledgeVersion()] });
      return;
    }

    await json(route, { message: "Unexpected test route" }, 404);
  });

  await page.goto(`/projects/${projectId}/opportunities`);

  await expect(page.getByRole("heading", { name: "Opportunity Research" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run research" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Confirm profile" })).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Knowledge review" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Research timeline" })).toBeVisible();
  await expect(page.getByLabel("Research run")).toBeVisible();
  await expect(page.getByText("research agent", { exact: true })).toBeVisible();
  await expect(
    page.locator(".opportunity-research-timeline").getByText("ranking proof", { exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: /Dachreinigung.*Dachau/u }).click();
  await expect(page.getByRole("heading", { name: "Research rationale" })).toBeVisible();
  await expect(page.getByText("Source-backed local demand worth defending.")).toBeVisible();
  await expect(
    page
      .locator(".detail-section")
      .filter({ has: page.getByRole("heading", { name: "Evidence citations" }) })
      .getByText("Reviewed rank evidence for Dachreinigung Dachau.")
  ).toBeVisible();
  await expect(page.getByText("Confirm service-margin assumptions.")).toBeVisible();

  await page.getByLabel("Research run").selectOption(historicalRunId);
  await expect(page.getByText("seo strategy agent", { exact: true })).toBeVisible();
  await page.getByLabel("Research run").selectOption(runId);
  await expect(page.getByText("research agent", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Run research" }).click();
  await page.getByRole("button", { name: "Confirm proof" }).click();

  await expect.poll(() => commands.length).toBe(2);
  expect(commands[0]?.path).toBe(`/projects/${projectId}/opportunity-research/rerun`);
  expect(commands[0]?.body).toMatchObject({ expectedRowVersion: 2 });
  expect(commands[1]).toEqual({
    path: `/projects/${projectId}/ranking-proofs/${proofId}/status`,
    body: { expectedStatus: "captured", expectedRowVersion: 0, status: "reviewed" }
  });

  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));
  expect(overflow.body).toBeLessThanOrEqual(1);
  expect(overflow.document).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 768, height: 900 });
  const mediumOverflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));
  expect(mediumOverflow.body).toBeLessThanOrEqual(1);
  expect(mediumOverflow.document).toBeLessThanOrEqual(1);
});

function researchState() {
  return {
    projectId,
    status: "needs_research",
    rowVersion: 2,
    currentMaterialDigest: digest,
    materialDirty: true,
    readinessIssues: [],
    portfolioShortfalls: { defendAdvance: 1, quickBuild: 3, strategic: 2 }
  };
}

function businessProfile() {
  return {
    projectId,
    status: "draft",
    rowVersion: 1,
    currentRevision: {
      id: profileRevisionId,
      projectId,
      revision: 1,
      profile: { businessName: "Dachpflege GmbH", websiteUrl: "https://example.com" },
      createdAt: timestamp
    },
    services: [{ id: serviceId, name: "Dachreinigung", status: "proposed", sourceKind: "manual", rowVersion: 0 }],
    areas: [{ id: areaId, name: "Dachau", status: "proposed", sourceKind: "manual", rowVersion: 0 }]
  };
}

function knowledgeVersion() {
  return {
    id: knowledgeVersionId,
    documentId: knowledgeDocumentId,
    projectId,
    documentKey: "service.dachreinigung",
    version: 1,
    title: "Dachreinigung service facts",
    bodyMarkdown: "The company offers roof cleaning in Dachau.",
    status: "proposed",
    sourceKind: "human",
    modelUsePolicy: "operator_only",
    isCurrent: false,
    contentSha256: digest,
    taskScopes: ["opportunity_research"],
    createdAt: timestamp
  };
}

function researchRun() {
  return {
    id: runId,
    projectId,
    task: "opportunity_scout",
    workflowName: "opportunity_research",
    workflowVersion: "opportunity-research.v2",
    constraintProfileVersion: "opportunity-research-policy.v1",
    status: "succeeded",
    provider: "deepseek",
    model: "deepseek-v4-flash",
    opportunityCount: 1,
    startedAt: timestamp,
    completedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function historicalResearchRun() {
  return {
    ...researchRun(),
    id: historicalRunId,
    status: "failed",
    opportunityCount: 0,
    failure: { code: "provider_unavailable", message: "Research provider was unavailable." },
    createdAt: "2026-08-02T08:00:00.000Z",
    updatedAt: "2026-08-02T08:05:00.000Z",
    completedAt: "2026-08-02T08:05:00.000Z"
  };
}

function timeline() {
  return {
    projectId,
    runId,
    steps: [
      {
        id: stepId,
        runId,
        stepKey: "research_agent",
        stepKind: "agent",
        status: "succeeded",
        attemptCount: 1,
        executionEpoch: 1,
        rowVersion: 2,
        agentRole: "research_agent",
        provider: "deepseek",
        model: "deepseek-v4-flash",
        startedAt: timestamp,
        completedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ],
    events: [
      {
        id: eventId,
        runId,
        stepId,
        sequence: 1,
        eventKey: "step.succeeded.research_agent",
        eventType: "step.succeeded",
        executionEpoch: 1,
        occurredAt: timestamp
      }
    ],
    evidence: [
      {
        id: proofId,
        runId,
        evidenceKey: `ranking_proof:${proofId}`,
        sourceKind: "ranking_proof",
        sourceId: proofId,
        sourceVersion: digest,
        executionEpoch: 1,
        payloadSha256: digest,
        observedAt: timestamp,
        proofTier: "customer_safe_proof",
        summary: "Reviewed rank evidence for Dachreinigung Dachau."
      }
    ]
  };
}

function historicalTimeline() {
  return {
    projectId,
    runId: historicalRunId,
    steps: [
      {
        id: historicalStepId,
        runId: historicalRunId,
        stepKey: "seo_strategy_agent",
        stepKind: "agent",
        status: "failed",
        attemptCount: 1,
        executionEpoch: 1,
        rowVersion: 2,
        agentRole: "seo_strategy_agent",
        failureCode: "provider_unavailable",
        startedAt: "2026-08-02T08:00:00.000Z",
        completedAt: "2026-08-02T08:05:00.000Z",
        createdAt: "2026-08-02T08:00:00.000Z",
        updatedAt: "2026-08-02T08:05:00.000Z"
      }
    ],
    events: [],
    evidence: []
  };
}

function rankingProof(status: "captured" | "reviewed", rowVersion: number) {
  return {
    id: proofId,
    projectId,
    query: "dachreinigung dachau",
    pageUrl: "https://example.com/dachreinigung-dachau",
    rank: 4,
    capturedAt: timestamp,
    searchEngine: "google.de",
    device: "desktop",
    status,
    rowVersion,
    reviewedAt: status === "reviewed" ? timestamp : undefined,
    reviewedByUserId: status === "reviewed" ? serviceId : undefined,
    createdAt: timestamp
  };
}

function opportunity() {
  return {
    id: opportunityId,
    projectId,
    agentRunId: runId,
    serviceId,
    areaId,
    primaryKeyword: "dachreinigung dachau",
    research: {
      rankingMilestone: "top_5",
      evidenceReadiness: "reviewed_proof",
      businessValue: "high",
      marketDifficulty: "medium",
      executionEffort: "low",
      lane: "defend_advance",
      policyVersion: "opportunity-research-policy.v1",
      materialDigest: digest,
      candidateKey: "dachreinigung:dachau",
      portfolioSelected: true,
      portfolioOrder: 1,
      candidate: {
        serviceId,
        areaId,
        service: "Dachreinigung",
        area: "Dachau",
        primaryKeyword: "dachreinigung dachau",
        secondaryKeywords: ["dachpflege dachau"],
        suggestedRoute: "/dachreinigung-dachau",
        suggestedPageType: "normal_page",
        businessValue: "high",
        marketDifficulty: "medium",
        executionEffort: "low",
        evidenceKeys: [`ranking_proof:${proofId}`],
        rationale: "Source-backed local demand worth defending.",
        missingEvidence: ["Confirm service-margin assumptions."],
        confidence: 0.82
      },
      citations: [
        {
          evidenceKey: `ranking_proof:${proofId}`,
          sourceKind: "ranking_proof",
          proofTier: "customer_safe_proof",
          summary: "Reviewed rank evidence for Dachreinigung Dachau."
        }
      ]
    },
    status: "new",
    rowVersion: 0,
    evidenceJson: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ contentType: "application/json", body: JSON.stringify(body), status });
}
