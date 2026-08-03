import { createServer } from "node:http";
import { expect, test } from "@playwright/test";
import {
  readReportDocumentCapability,
  reportDocumentCookieName,
  serializeReportDocumentCapabilityCookie,
  signReportDocumentCapability
} from "../../api/src/report-document-capability.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const reportId = "22222222-2222-4222-8222-222222222222";
const artifactId = "33333333-3333-4333-8333-333333333333";
const snapshotSha256 = "a".repeat(64);
const artifactSha256 = "b".repeat(64);
const secret = "report-document-capability-secret-12345";

test("sandboxed report document sends its partitioned capability on a real cross-site request", async ({ page }) => {
  let documentCapabilitySeen = false;
  const token = signReportDocumentCapability(
    { kind: "candidate", projectId, reportId, artifactId, snapshotSha256, artifactSha256 },
    secret
  );
  const server = createServer((request, response) => {
    response.setHeader("access-control-allow-origin", "http://127.0.0.1:5173");
    response.setHeader("access-control-allow-credentials", "true");
    response.setHeader("cache-control", "private, no-store");

    if (request.url === "/candidate") {
      response.setHeader("set-cookie", serializeReportDocumentCapabilityCookie(artifactId, token));
      response.setHeader("content-type", "application/json");
      response.end("{}");
      return;
    }

    if (request.url === "/document") {
      const claims = readReportDocumentCapability(request.headers.cookie, artifactId, secret);
      documentCapabilitySeen =
        claims?.kind === "candidate" &&
        claims.projectId === projectId &&
        claims.reportId === reportId &&
        claims.artifactId === artifactId &&
        claims.snapshotSha256 === snapshotSha256 &&
        claims.artifactSha256 === artifactSha256;
      if (!documentCapabilitySeen) {
        response.statusCode = 401;
        response.end("report document capability missing");
        return;
      }
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end('<main id="report-document">Capability-bound report</main>');
      return;
    }

    response.statusCode = 404;
    response.end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Report capability browser test server did not expose a TCP port.");
    }
    const reportOrigin = `http://localhost:${address.port}`;

    await page.goto("/login");
    const detailStatus = await page.evaluate(async (url) => {
      const response = await fetch(url, { credentials: "include" });
      return response.status;
    }, `${reportOrigin}/candidate`);
    expect(detailStatus).toBe(200);
    const cookies = await page.context().cookies(reportOrigin);
    expect(cookies.some((cookie) => cookie.name === reportDocumentCookieName(artifactId))).toBe(true);

    await page.evaluate((documentUrl) => {
      const iframe = document.createElement("iframe");
      iframe.setAttribute("sandbox", "");
      iframe.src = documentUrl;
      document.body.append(iframe);
    }, `${reportOrigin}/document`);

    await expect.poll(() => documentCapabilitySeen).toBe(true);
    await expect(page.frameLocator("iframe").locator("#report-document")).toHaveText("Capability-bound report");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
