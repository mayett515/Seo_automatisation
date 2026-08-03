import { expect, test, type Route } from "@playwright/test";

const projectId = "11111111-1111-4111-8111-111111111111";
const reportIssueId = "22222222-2222-4222-8222-222222222222";
const reportId = "33333333-3333-4333-8333-333333333333";
const runId = "44444444-4444-4444-8444-444444444444";
const artifactId = "55555555-5555-4555-8555-555555555555";
const digest = "a".repeat(64);
const manifestDigest = "b".repeat(64);
const artifactDigest = "c".repeat(64);
const timestamp = "2026-08-01T10:00:00.000Z";

test("reviews and publishes one immutable customer report without mobile overflow", async ({ page }) => {
  let status: "draft" | "ready_for_review" | "published" = "draft";
  const commands: unknown[] = [];

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const isApiRequest =
      ["fetch", "xhr"].includes(request.resourceType()) ||
      (request.resourceType() === "document" && path.endsWith("/document"));
    if (!isApiRequest) {
      await route.continue();
      return;
    }
    if (path === "/health") {
      await json(route, { status: "ok", service: "local-seo-api", stack: {} });
      return;
    }
    if (!path.startsWith("/projects/" + projectId + "/reports")) {
      await route.continue();
      return;
    }
    if (path.endsWith("/document")) {
      await html(route, "<main><h1>Monthly SEO progress</h1><p>Immutable reviewed artifact</p></main>");
      return;
    }
    if (path.endsWith("/workspace")) {
      await json(route, {
        issues: [
          {
            reportIssueId,
            period: "2026-07",
            candidate: status === "published" ? undefined : candidateSummary(status),
            latestGeneration: {
              reportIssueId,
              runId,
              status: "succeeded",
              narrativeMode: "fact_only",
              evidenceCutoffAt: timestamp,
              resultReportId: reportId,
              createdAt: timestamp,
              finishedAt: timestamp
            }
          }
        ]
      });
      return;
    }
    if (path.endsWith("/published") && request.method() === "GET") {
      await json(route, status === "published" ? [publishedSummary()] : []);
      return;
    }
    if (path.endsWith("/candidates/" + reportId)) {
      await json(route, {
        report: candidateSummary(status === "draft" ? "draft" : "ready_for_review"),
        snapshot: snapshot(),
        artifacts: status === "ready_for_review" ? [artifactSummary()] : []
      });
      return;
    }
    if (path.endsWith("/artifacts/" + artifactId) && request.method() === "GET") {
      await json(route, artifactSummary());
      return;
    }
    if (path.endsWith("/review") && request.method() === "POST") {
      commands.push(request.postDataJSON());
      status = "ready_for_review";
      await json(route, {
        command: "submit_for_review",
        kind: "applied",
        reportId,
        status,
        rowVersion: 1,
        snapshotSha256: digest,
        artifact: {
          ...artifactSummary(),
          status: "pending",
          artifactSha256: undefined,
          byteSize: undefined,
          stagedAt: undefined
        },
        renderDispatch: "accepted"
      });
      return;
    }
    if (path.endsWith("/publish") && request.method() === "POST") {
      commands.push(request.postDataJSON());
      status = "published";
      await json(route, {
        command: "publish",
        kind: "applied",
        reportId,
        status,
        rowVersion: 2,
        snapshotSha256: digest,
        artifactId,
        artifactSha256: artifactDigest,
        publishedAt: timestamp
      });
      return;
    }
    if (path.endsWith("/published/" + reportId)) {
      await json(route, { report: publishedSummary(), snapshot: snapshot() });
      return;
    }
    await json(route, null, 404);
  });

  await page.goto("/projects/" + projectId + "/reports");
  await page.getByRole("link", { name: "Monthly SEO progress" }).click();
  await expect(page.getByRole("heading", { name: "Verified claims" })).toBeVisible();

  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByRole("button", { name: "Publish report" })).toBeEnabled();
  await expect(page.frameLocator('iframe[title="Reviewed customer report artifact"]').getByRole("heading")).toHaveText(
    "Monthly SEO progress"
  );

  await page.getByRole("button", { name: "Publish report" }).click();
  await expect(page).toHaveURL(new RegExp("/reports/published/" + reportId + "$", "u"));
  await expect(page.frameLocator('iframe[title="Published customer report"]').getByRole("heading")).toHaveText(
    "Monthly SEO progress"
  );
  expect(commands).toHaveLength(2);
  expect((commands[0] as { command: string }).command).toBe("submit_for_review");
  expect((commands[1] as { command: string }).command).toBe("publish");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

function candidateSummary(status: "draft" | "ready_for_review") {
  return {
    reportId,
    reportIssueId,
    versionNumber: 1,
    status,
    period: "2026-07",
    title: "Monthly SEO progress",
    snapshotSha256: digest,
    rowVersion: status === "draft" ? 0 : 1,
    narrativeMode: "fact_only",
    generatedAt: timestamp,
    evidenceCutoffAt: timestamp,
    readyAt: status === "ready_for_review" ? timestamp : undefined,
    createdAt: timestamp
  };
}

function artifactSummary() {
  return {
    artifactId,
    reportId,
    format: "html",
    status: "staged",
    snapshotSha256: digest,
    manifestSha256: manifestDigest,
    artifactSha256: artifactDigest,
    byteSize: 120,
    createdAt: timestamp,
    stagedAt: timestamp
  };
}

function publishedSummary() {
  return {
    reportId,
    reportIssueId,
    versionNumber: 1,
    status: "published",
    period: "2026-07",
    title: "Monthly SEO progress",
    snapshotSha256: digest,
    artifactId,
    artifactSha256: artifactDigest,
    publishedAt: timestamp,
    correctionRequired: false
  };
}

function snapshot() {
  return {
    schemaVersion: "customer_report_snapshot.v1",
    identity: {
      projectId,
      reportKind: "monthly_seo_progress",
      period: "2026-07",
      locale: "de-DE",
      timezone: "Europe/Berlin"
    },
    generatedAt: timestamp,
    evidenceCutoffAt: timestamp,
    assemblerVersion: "customer-report-assembler.v1",
    eligibilityPolicyVersion: "customer-report-eligibility.v1",
    actionSelectionPolicyVersion: "customer-report-actions.v1",
    narrativePolicyVersion: "customer-report-narrative.v1",
    templateVersion: "customer-report-html.v1",
    narrativeMode: "fact_only",
    title: "Monthly SEO progress",
    factProjectionSha256: digest,
    factProjection: { claims: [], evidence: [], nextActions: [] },
    narrative: []
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function html(route: Route, body: string) {
  await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body });
}
