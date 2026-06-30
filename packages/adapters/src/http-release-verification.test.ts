import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderApprovedReleaseArtifact } from "@localseo/domain";
import { HttpReleaseVerificationAdapter } from "./http-release-verification.js";

void describe("HttpReleaseVerificationAdapter", () => {
  void it("marks live routes healthy when HTTP, indexability, canonical, schema, sitemap, and tracking pass", async () => {
    const adapter = new HttpReleaseVerificationAdapter({
      fetchImpl: createFetch({
        "https://example.test/dachreinigung-muenchen/": htmlResponse(`<!doctype html>
<html>
<head>
  <link rel="canonical" href="https://example.test/dachreinigung-muenchen/">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness"}</script>
</head>
<body><script src="/track" data-localseo="project"></script></body>
</html>`),
        "https://example.test/sitemap.xml": textResponse(
          "<urlset><url><loc>https://example.test/dachreinigung-muenchen/</loc></url></urlset>"
        )
      })
    });

    const result = await adapter.verifyRelease({
      releasePlanId: "release-1",
      deploymentId: "deployment-1",
      liveUrls: ["https://example.test/dachreinigung-muenchen/"],
      trackingExpected: true
    });

    assert.equal(result.verificationStatus, "live_healthy");
    assert.equal(
      result.checks.every((check) => check.result === "passed"),
      true
    );
  });

  void it("recommends rollback for live routes blocked by noindex or wrong canonical", async () => {
    const adapter = new HttpReleaseVerificationAdapter({
      fetchImpl: createFetch({
        "https://example.test/dachreinigung-muenchen/": htmlResponse(`<!doctype html>
<html>
<head>
  <meta name="robots" content="noindex,nofollow">
  <link rel="canonical" href="https://example.test/">
  <script type="application/ld+json">{"@type":"LocalBusiness"}</script>
</head>
<body></body>
</html>`),
        "https://example.test/sitemap.xml": textResponse("<urlset></urlset>")
      })
    });

    const result = await adapter.verifyRelease({
      releasePlanId: "release-1",
      liveUrls: ["https://example.test/dachreinigung-muenchen/"]
    });

    assert.equal(result.verificationStatus, "rollback_recommended");
    assert.equal(result.checks.find((check) => check.checkKey === "indexability_check")?.result, "failed");
    assert.equal(result.checks.find((check) => check.checkKey === "canonical_trailing_slash_check")?.result, "failed");
  });

  void it("keeps invalid JSON-LD as a warning when blockers pass", async () => {
    const adapter = new HttpReleaseVerificationAdapter({
      fetchImpl: createFetch({
        "https://example.test/dachreinigung-muenchen/": htmlResponse(`<!doctype html>
<html>
<head>
  <link rel="canonical" href="https://example.test/dachreinigung-muenchen/">
  <script type="application/ld+json">{bad json</script>
</head>
<body></body>
</html>`),
        "https://example.test/sitemap.xml": textResponse(
          "<urlset><url><loc>https://example.test/dachreinigung-muenchen/</loc></url></urlset>"
        )
      })
    });

    const result = await adapter.verifyRelease({
      releasePlanId: "release-1",
      liveUrls: ["https://example.test/dachreinigung-muenchen/"]
    });

    assert.equal(result.verificationStatus, "live_with_warnings");
    assert.equal(result.checks.find((check) => check.checkKey === "schema_parse_check")?.result, "failed");
  });

  void it("accepts HTML produced by the approved release artifact renderer", async () => {
    const site = renderApprovedReleaseArtifact({
      projectId: "project-1",
      releasePlanId: "release-1",
      deploymentKey: "release_plan:release-1",
      createdAt: "2026-06-30T00:00:00.000Z",
      pages: [
        {
          releasePlanItemId: "item-1",
          pageVersionId: "version-1",
          targetUrl: "/dachreinigung-muenchen/",
          targetSubdomain: null,
          action: "publish",
          pageJson: {
            title: "Dachreinigung Muenchen",
            metaDescription: "Lokale Dachreinigung in Muenchen.",
            h1: "Dachreinigung in Muenchen",
            canonical: "https://example.test/dachreinigung-muenchen/",
            jsonLd: {
              "@context": "https://schema.org",
              "@type": "LocalBusiness",
              name: "Dachreinigung Muenchen"
            }
          }
        }
      ]
    });
    const renderedPage = site.files[0];

    assert.ok(renderedPage);

    const adapter = new HttpReleaseVerificationAdapter({
      fetchImpl: createFetch({
        "https://example.test/dachreinigung-muenchen/": htmlResponse(renderedPage.body),
        "https://example.test/sitemap.xml": textResponse(
          "<urlset><url><loc>https://example.test/dachreinigung-muenchen/</loc></url></urlset>"
        )
      })
    });

    const result = await adapter.verifyRelease({
      releasePlanId: "release-1",
      liveUrls: ["https://example.test/dachreinigung-muenchen/"]
    });

    assert.equal(result.verificationStatus, "live_healthy");
  });

  void it("does not treat sitemap subpage matches as exact route inclusion", async () => {
    const adapter = new HttpReleaseVerificationAdapter({
      fetchImpl: createFetch({
        "https://example.test/dachreinigung/": htmlResponse(`<!doctype html>
<html>
<head>
  <link rel="canonical" href="https://example.test/dachreinigung/">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness"}</script>
</head>
<body></body>
</html>`),
        "https://example.test/sitemap.xml": textResponse(
          "<urlset><url><loc>https://example.test/dachreinigung-muenchen/</loc></url></urlset>"
        )
      })
    });

    const result = await adapter.verifyRelease({
      releasePlanId: "release-1",
      liveUrls: ["https://example.test/dachreinigung/"]
    });

    assert.equal(result.verificationStatus, "live_with_warnings");
    assert.equal(result.checks.find((check) => check.checkKey === "sitemap_readiness_check")?.result, "failed");
  });
});

function createFetch(responses: Record<string, Response>): typeof fetch {
  const fetchImpl: typeof fetch = (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : input.toString();
    const response = responses[url] ?? new Response("not found", { status: 404 });
    return Promise.resolve(response);
  };

  return fetchImpl;
}

function htmlResponse(body: string): Response {
  return textResponse(body, "text/html; charset=utf-8");
}

function textResponse(body: string, contentType = "application/xml; charset=utf-8"): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": contentType
    }
  });
}
