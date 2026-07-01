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
  <title>Dachreinigung Muenchen</title>
  <meta name="description" content="Lokale Dachreinigung in Muenchen.">
  <link rel="canonical" href="https://example.test/dachreinigung-muenchen/">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"https://schema.org/LocalBusiness"}</script>
</head>
<body><h1>Dachreinigung in Muenchen</h1><script src="/track" data-localseo="project"></script></body>
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

  void it("keeps missing source metadata and H1 as warnings instead of rollback blockers", async () => {
    const adapter = new HttpReleaseVerificationAdapter({
      fetchImpl: createFetch({
        "https://example.test/dachreinigung-muenchen/": htmlResponse(`<!doctype html>
<html>
<head>
  <link rel="canonical" href="https://example.test/dachreinigung-muenchen/">
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
      liveUrls: ["https://example.test/dachreinigung-muenchen/"]
    });

    assert.equal(result.verificationStatus, "live_with_warnings");
    assert.equal(result.checks.find((check) => check.checkKey === "html_metadata_check")?.result, "failed");
    assert.equal(result.checks.find((check) => check.checkKey === "primary_heading_check")?.result, "failed");
    assert.equal(result.checks.find((check) => check.checkKey === "canonical_trailing_slash_check")?.result, "passed");
  });

  void it("keeps parseable JSON-LD without local SEO schema types as a warning", async () => {
    const adapter = new HttpReleaseVerificationAdapter({
      fetchImpl: createFetch({
        "https://example.test/dachreinigung-muenchen/": htmlResponse(
          healthyPageHtml("https://example.test/dachreinigung-muenchen/", {
            jsonLd: '{"@context":"https://schema.org","@type":"Thing"}'
          })
        ),
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
    assert.equal(result.checks.find((check) => check.checkKey === "schema_parse_check")?.result, "passed");
    assert.equal(result.checks.find((check) => check.checkKey === "schema_type_check")?.result, "failed");
  });

  void it("bounds concurrent live route fetches", async () => {
    const liveUrls = [
      "https://example.test/page-a/",
      "https://example.test/page-b/",
      "https://example.test/page-c/",
      "https://example.test/page-d/"
    ];
    const fetchProbe = createConcurrentFetchProbe(
      Object.fromEntries(
        liveUrls.map((liveUrl) => [
          liveUrl,
          () => htmlResponse(healthyPageHtml(liveUrl, { body: `<h1>${liveUrl}</h1>` }))
        ])
      ),
      {
        "https://example.test/sitemap.xml": () =>
          textResponse(`<urlset>${liveUrls.map((liveUrl) => `<url><loc>${liveUrl}</loc></url>`).join("")}</urlset>`)
      }
    );
    const adapter = new HttpReleaseVerificationAdapter({
      fetchImpl: fetchProbe.fetchImpl,
      maxConcurrentPageFetches: 2
    });

    const result = await adapter.verifyRelease({
      releasePlanId: "release-1",
      liveUrls
    });

    assert.equal(result.verificationStatus, "live_healthy");
    assert.equal(fetchProbe.maxActive, 2);
  });

  void it("follows same-origin redirects during live route verification", async () => {
    const requestedUrls: string[] = [];
    const adapter = new HttpReleaseVerificationAdapter({
      fetchImpl: createFetch(
        {
          "https://example.test/dachreinigung": redirectResponse("/dachreinigung/"),
          "https://example.test/dachreinigung/": htmlResponse(`<!doctype html>
<html>
<head>
  <title>Dachreinigung</title>
  <meta name="description" content="Lokale Dachreinigung.">
  <link rel="canonical" href="https://example.test/dachreinigung/">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness"}</script>
</head>
<body><h1>Dachreinigung</h1></body>
</html>`),
          "https://example.test/sitemap.xml": textResponse(
            "<urlset><url><loc>https://example.test/dachreinigung/</loc></url></urlset>"
          )
        },
        requestedUrls
      )
    });

    const result = await adapter.verifyRelease({
      releasePlanId: "release-1",
      liveUrls: ["https://example.test/dachreinigung"]
    });

    assert.equal(result.verificationStatus, "live_healthy");
    assert.deepEqual(requestedUrls.slice(0, 2), [
      "https://example.test/dachreinigung",
      "https://example.test/dachreinigung/"
    ]);
  });

  void it("blocks live route redirects that leave the deployment origin", async () => {
    const requestedUrls: string[] = [];
    const adapter = new HttpReleaseVerificationAdapter({
      fetchImpl: createFetch(
        {
          "https://example.test/dachreinigung/": redirectResponse("http://169.254.169.254/latest/meta-data"),
          "https://example.test/sitemap.xml": textResponse(
            "<urlset><url><loc>https://example.test/dachreinigung/</loc></url></urlset>"
          )
        },
        requestedUrls
      )
    });

    const result = await adapter.verifyRelease({
      releasePlanId: "release-1",
      liveUrls: ["https://example.test/dachreinigung/"]
    });

    const httpCheck = result.checks.find((check) => check.checkKey === "http_status_check");
    assert.equal(result.verificationStatus, "rollback_recommended");
    assert.equal(httpCheck?.result, "failed");
    assert.equal(httpCheck?.message, "Verification redirect left the deployment origin.");
    assert.equal(requestedUrls.includes("http://169.254.169.254/latest/meta-data"), false);
  });

  void it("blocks sitemap redirects that leave the deployment origin", async () => {
    const requestedUrls: string[] = [];
    const adapter = new HttpReleaseVerificationAdapter({
      fetchImpl: createFetch(
        {
          "https://example.test/dachreinigung/": htmlResponse(`<!doctype html>
<html>
<head>
  <link rel="canonical" href="https://example.test/dachreinigung/">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness"}</script>
</head>
<body></body>
</html>`),
          "https://example.test/sitemap.xml": redirectResponse("http://169.254.169.254/latest/meta-data")
        },
        requestedUrls
      )
    });

    const result = await adapter.verifyRelease({
      releasePlanId: "release-1",
      liveUrls: ["https://example.test/dachreinigung/"]
    });

    const sitemapCheck = result.checks.find((check) => check.checkKey === "sitemap_readiness_check");
    assert.equal(result.verificationStatus, "live_with_warnings");
    assert.equal(sitemapCheck?.result, "failed");
    assert.equal(requestedUrls.includes("http://169.254.169.254/latest/meta-data"), false);
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

function createFetch(responses: Record<string, Response>, requestedUrls: string[] = []): typeof fetch {
  const fetchImpl: typeof fetch = (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : input.toString();
    requestedUrls.push(url);
    const response = responses[url] ?? new Response("not found", { status: 404 });
    return Promise.resolve(response);
  };

  return fetchImpl;
}

function createConcurrentFetchProbe(
  pageResponses: Record<string, () => Response>,
  otherResponses: Record<string, () => Response> = {}
): { fetchImpl: typeof fetch; maxActive: number } {
  let active = 0;
  const probe = {
    maxActive: 0,
    fetchImpl: (async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input.toString();
      const responseFactory = pageResponses[url] ?? otherResponses[url];
      active += 1;
      probe.maxActive = Math.max(probe.maxActive, active);

      try {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return responseFactory ? responseFactory() : new Response("not found", { status: 404 });
      } finally {
        active -= 1;
      }
    }) satisfies typeof fetch
  };

  return probe;
}

function healthyPageHtml(
  canonicalUrl: string,
  options: {
    jsonLd?: string;
    body?: string;
  } = {}
): string {
  const jsonLd = options.jsonLd ?? '{"@context":"https://schema.org","@type":"LocalBusiness"}';

  return `<!doctype html>
<html>
<head>
  <title>Dachreinigung</title>
  <meta name="description" content="Lokale Dachreinigung.">
  <link rel="canonical" href="${canonicalUrl}">
  <script type="application/ld+json">${jsonLd}</script>
</head>
<body>${options.body ?? "<h1>Dachreinigung</h1>"}</body>
</html>`;
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

function redirectResponse(location: string): Response {
  return new Response("", {
    status: 302,
    headers: { location }
  });
}
