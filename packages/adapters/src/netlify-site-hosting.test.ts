import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { ApprovedReleaseArtifact, PageJson, StaticSiteArtifact } from "@localseo/contracts";
import { renderApprovedReleaseArtifact } from "@localseo/page-registry";
import type { ObjectStoragePort } from "./index.js";
import { NetlifySiteHostingAdapter } from "./netlify-site-hosting.js";
import { ProviderRequestError } from "./provider-errors.js";

void describe("NetlifySiteHostingAdapter", () => {
  void it("uploads required digest files and returns pending for accepted deploys", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const adapter = new NetlifySiteHostingAdapter({
      authToken: "netlify-token",
      objectStorage: createObjectStorage(artifact()),
      fetchImpl: (url, init = {}) => {
        const requestUrl = requestUrlToString(url);
        calls.push({ url: requestUrl, init });

        if (requestUrl.endsWith("/sites/site-1/deploys")) {
          const body = JSON.parse(requestBodyToString(init.body)) as { files: Record<string, string>; title: string };
          assert.equal(body.title, "release_plan:release-1:deployment-1");
          return Promise.resolve(
            jsonResponse({
              id: "deploy-1",
              state: "accepted",
              deploy_ssl_url: "https://deploy-preview.test/",
              required: Object.values(body.files)
            })
          );
        }

        if (requestUrl.includes("/deploys/deploy-1/files/")) {
          return Promise.resolve(new Response(null, { status: 204 }));
        }

        if (requestUrl.endsWith("/deploys/deploy-1")) {
          return Promise.resolve(
            jsonResponse({
              id: "deploy-1",
              state: "accepted",
              deploy_ssl_url: "https://deploy-preview.test/"
            })
          );
        }

        return Promise.resolve(new Response("unexpected", { status: 500 }));
      }
    });

    const result = await adapter.createDeploy({
      projectId: "project-1",
      releasePlanId: "release-1",
      deploymentId: "deployment-1",
      deploymentKey: "release_plan:release-1",
      buildArtifactKey: "releases/release-1/static-site-artifact.json",
      hostingSiteId: "site-1"
    });

    assert.equal(result.status, "pending");
    assert.equal(result.providerDeployId, "deploy-1");
    assert.ok(calls.some((call) => call.init.method === "PUT"));
    assert.ok(
      calls.some(
        (call) =>
          call.init.method === "PUT" && headerValue(call.init.headers, "content-type") === "application/octet-stream"
      )
    );
  });

  void it("polls async deploys until required digests are available", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    let deployGetCount = 0;
    const adapter = new NetlifySiteHostingAdapter({
      authToken: "netlify-token",
      objectStorage: createObjectStorage(artifact()),
      requiredFilePollAttempts: 3,
      requiredFilePollIntervalMs: 0,
      fetchImpl: (url, init = {}) => {
        const requestUrl = requestUrlToString(url);
        calls.push({ url: requestUrl, init });

        if (requestUrl.endsWith("/sites/site-1/deploys")) {
          return Promise.resolve(
            jsonResponse({
              id: "deploy-1",
              state: "accepted",
              deploy_ssl_url: "https://deploy-preview.test/",
              required: []
            })
          );
        }

        if (requestUrl.includes("/deploys/deploy-1/files/")) {
          return Promise.resolve(new Response(null, { status: 204 }));
        }

        if (requestUrl.endsWith("/deploys/deploy-1")) {
          deployGetCount += 1;

          if (deployGetCount === 1) {
            const createCall = calls.find((call) => call.url.endsWith("/sites/site-1/deploys"));
            assert.ok(createCall);
            const body = JSON.parse(requestBodyToString(createCall.init.body)) as { files: Record<string, string> };

            return Promise.resolve(
              jsonResponse({
                id: "deploy-1",
                state: "upload_required",
                deploy_ssl_url: "https://deploy-preview.test/",
                required: Object.values(body.files)
              })
            );
          }

          return Promise.resolve(
            jsonResponse({
              id: "deploy-1",
              state: "building",
              deploy_ssl_url: "https://deploy-preview.test/"
            })
          );
        }

        return Promise.resolve(new Response("unexpected", { status: 500 }));
      }
    });

    const result = await adapter.createDeploy({
      projectId: "project-1",
      releasePlanId: "release-1",
      deploymentKey: "release_plan:release-1",
      buildArtifactKey: "releases/release-1/static-site-artifact.json",
      hostingSiteId: "site-1"
    });

    assert.equal(result.status, "pending");
    assert.equal(deployGetCount, 2);
    assert.ok(calls.some((call) => call.init.method === "PUT"));
  });

  void it("does not wait for required digests after Netlify starts building without required uploads", async () => {
    let deployGetCount = 0;
    const adapter = new NetlifySiteHostingAdapter({
      authToken: "netlify-token",
      objectStorage: createObjectStorage(artifact()),
      requiredFilePollAttempts: 3,
      requiredFilePollIntervalMs: 0,
      fetchImpl: (url) => {
        const requestUrl = requestUrlToString(url);

        if (requestUrl.endsWith("/sites/site-1/deploys")) {
          return Promise.resolve(
            jsonResponse({
              id: "deploy-1",
              state: "accepted",
              deploy_ssl_url: "https://deploy-preview.test/",
              required: []
            })
          );
        }

        if (requestUrl.endsWith("/deploys/deploy-1")) {
          deployGetCount += 1;

          return Promise.resolve(
            jsonResponse({
              id: "deploy-1",
              state: "building",
              deploy_ssl_url: "https://deploy-preview.test/"
            })
          );
        }

        return Promise.resolve(new Response("unexpected", { status: 500 }));
      }
    });

    const result = await adapter.createDeploy({
      projectId: "project-1",
      releasePlanId: "release-1",
      deploymentKey: "release_plan:release-1",
      buildArtifactKey: "releases/release-1/static-site-artifact.json",
      hostingSiteId: "site-1"
    });

    assert.equal(result.status, "pending");
    assert.equal(deployGetCount, 2);
  });

  void it("uploads files directly from a Netlify resume token", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const staticArtifact = artifact();
    const [file] = staticArtifact.files;
    assert.ok(file);
    const adapter = new NetlifySiteHostingAdapter({
      authToken: "netlify-token",
      objectStorage: createObjectStorage(staticArtifact),
      fetchImpl: (url, init = {}) => {
        const requestUrl = requestUrlToString(url);
        calls.push({ url: requestUrl, init });

        if (requestUrl.includes("/deploys/deploy-1/files/")) {
          return Promise.resolve(new Response(null, { status: 204 }));
        }

        return Promise.resolve(new Response("unexpected", { status: 500 }));
      }
    });

    const result = await adapter.uploadDeployFiles({
      projectId: "project-1",
      releasePlanId: "release-1",
      deploymentKey: "release_plan:release-1",
      buildArtifactKey: "releases/release-1/static-site-artifact.json",
      providerDeployId: "deploy-1",
      resumeToken: {
        adapter: "netlify",
        requiredDigests: [sha1(staticFileBytes(file))]
      }
    });

    assert.equal(result.evidence?.uploadedDigestCount, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.init.method, "PUT");
    assert.equal(headerValue(calls[0]?.init.headers, "content-type"), "application/octet-stream");
  });

  void it("hashes and uploads decoded base64 bytes instead of transport text", async () => {
    const binary = Buffer.from([0, 255, 1, 254, 2, 253]);
    const staticArtifact: StaticSiteArtifact = {
      files: [
        {
          path: "/assets/example.webp",
          contentType: "image/webp",
          encoding: "base64",
          body: binary.toString("base64")
        }
      ]
    };
    let uploadedBody: BodyInit | null | undefined;
    const adapter = new NetlifySiteHostingAdapter({
      authToken: "netlify-token",
      objectStorage: createObjectStorage(staticArtifact),
      fetchImpl: (_url, init = {}) => {
        uploadedBody = init.body;
        return Promise.resolve(new Response(null, { status: 204 }));
      }
    });

    await adapter.uploadDeployFiles({
      projectId: "project-1",
      releasePlanId: "release-1",
      deploymentKey: "release_plan:release-1",
      buildArtifactKey: "releases/release-1/static-site-artifact.json",
      providerDeployId: "deploy-1",
      resumeToken: { adapter: "netlify", requiredDigests: [sha1(binary)] }
    });

    assert.ok(uploadedBody instanceof Uint8Array);
    assert.deepEqual(Buffer.from(uploadedBody), binary);
    assert.notEqual(sha1(binary), sha1(Buffer.from(staticArtifact.files[0]!.body, "utf8")));
  });

  void it("fails loudly when Netlify requests an unknown file digest", async () => {
    const adapter = new NetlifySiteHostingAdapter({
      authToken: "netlify-token",
      objectStorage: createObjectStorage(artifact()),
      fetchImpl: (url) => {
        const requestUrl = requestUrlToString(url);

        if (requestUrl.endsWith("/sites/site-1/deploys")) {
          return Promise.resolve(
            jsonResponse({
              id: "deploy-1",
              state: "upload_required",
              deploy_ssl_url: "https://deploy-preview.test/",
              required: ["missing-digest"]
            })
          );
        }

        return Promise.resolve(new Response("unexpected", { status: 500 }));
      }
    });

    await assert.rejects(
      adapter.createDeploy({
        projectId: "project-1",
        releasePlanId: "release-1",
        deploymentKey: "release_plan:release-1",
        buildArtifactKey: "releases/release-1/static-site-artifact.json",
        hostingSiteId: "site-1"
      }),
      /not in the static site artifact/u
    );
  });

  void it("maps queued provider state to pending snapshots", async () => {
    const adapter = new NetlifySiteHostingAdapter({
      authToken: "netlify-token",
      objectStorage: createObjectStorage(artifact()),
      fetchImpl: () =>
        Promise.resolve(
          jsonResponse({
            id: "deploy-1",
            state: "queued",
            deploy_ssl_url: "https://deploy-preview.test/"
          })
        )
    });

    const snapshot = await adapter.getDeploy({ providerDeployId: "deploy-1" });

    assert.equal(snapshot.status, "pending");
  });

  void it("reads the currently published deploy identity from the site response", async () => {
    const adapter = new NetlifySiteHostingAdapter({
      authToken: "netlify-token",
      objectStorage: createObjectStorage(artifact()),
      fetchImpl: (url) => {
        assert.equal(requestUrlToString(url).endsWith("/sites/site-1"), true);
        return Promise.resolve(
          jsonResponse({
            id: "site-1",
            ssl_url: "https://customer-site.netlify.app/",
            published_deploy: {
              id: "deploy-current",
              state: "current",
              deploy_ssl_url: "https://deploy-current--customer-site.netlify.app/"
            }
          })
        );
      }
    });

    const snapshot = await adapter.getPublishedDeploy({ hostingSiteId: "site-1" });

    assert.equal(snapshot?.providerDeployId, "deploy-current");
    assert.equal(snapshot?.status, "ready");
    assert.equal(snapshot?.liveUrls[0], "https://customer-site.netlify.app/");
    assert.equal(snapshot?.evidence?.source, "site_published_deploy");
  });

  void it("redacts Netlify error response bodies", async () => {
    const adapter = new NetlifySiteHostingAdapter({
      authToken: "netlify-token",
      objectStorage: createObjectStorage(artifact()),
      fetchImpl: () => Promise.resolve(new Response("secret provider body", { status: 500 }))
    });

    await assert.rejects(adapter.getDeploy({ providerDeployId: "deploy-1" }), (error) => {
      assert.ok(error instanceof ProviderRequestError);
      assert.equal(error.provider, "netlify");
      assert.equal(error.reasonCode, "http_error");
      assert.equal(error.statusCode, 500);
      assert.equal(error.message.includes("secret provider body"), false);
      return true;
    });
  });

  void it("times out Netlify provider requests", async () => {
    const adapter = new NetlifySiteHostingAdapter({
      authToken: "netlify-token",
      objectStorage: createObjectStorage(artifact()),
      requestTimeoutMs: 1,
      fetchImpl: (_url, init = {}) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init.signal;
          signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        })
    });

    await assert.rejects(adapter.getDeploy({ providerDeployId: "deploy-1" }), (error) => {
      assert.ok(error instanceof ProviderRequestError);
      assert.equal(error.provider, "netlify");
      assert.equal(error.reasonCode, "timeout");
      return true;
    });
  });

  void it("prefers stable production URLs before deploy permalinks", async () => {
    const adapter = new NetlifySiteHostingAdapter({
      authToken: "netlify-token",
      objectStorage: createObjectStorage(artifact()),
      fetchImpl: () =>
        Promise.resolve(
          jsonResponse({
            id: "deploy-1",
            state: "ready",
            ssl_url: "https://customer-site.netlify.app/",
            url: "http://customer-site.netlify.app/",
            deploy_ssl_url: "https://deploy-1--customer-site.netlify.app/",
            deploy_url: "http://deploy-1--customer-site.netlify.app/"
          })
        )
    });

    const snapshot = await adapter.getDeploy({ providerDeployId: "deploy-1" });

    assert.equal(snapshot.liveUrls[0], "https://customer-site.netlify.app/");
  });

  void it("executes rollback through the Netlify restore endpoint", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const adapter = new NetlifySiteHostingAdapter({
      authToken: "netlify-token",
      objectStorage: createObjectStorage(artifact()),
      fetchImpl: (url, init = {}) => {
        const requestUrl = requestUrlToString(url);
        calls.push({ url: requestUrl, init });

        if (requestUrl.endsWith("/sites/site-1/deploys/deploy-previous/restore")) {
          return Promise.resolve(
            jsonResponse({
              id: "deploy-previous",
              state: "current",
              ssl_url: "https://customer-site.netlify.app/"
            })
          );
        }

        return Promise.resolve(new Response("unexpected", { status: 500 }));
      }
    });

    const result = await adapter.rollbackDeploy({
      projectId: "project-1",
      releasePlanId: "release-1",
      rollbackPointId: "rollback-point-1",
      hostingSiteId: "site-1",
      providerDeployId: "deploy-previous"
    });

    assert.equal(result.status, "completed");
    assert.equal(result.providerDeployId, "deploy-previous");
    assert.equal(result.liveUrl, "https://customer-site.netlify.app/");
    assert.equal(calls[0]?.init.method, "POST");
  });
});

function createObjectStorage(value: StaticSiteArtifact): ObjectStoragePort {
  return {
    putJson: (input) => Promise.resolve({ key: input.key }),
    getJson: () => Promise.resolve(value)
  };
}

function artifact(): StaticSiteArtifact {
  return renderApprovedReleaseArtifact(approvedArtifact());
}

function approvedArtifact(): ApprovedReleaseArtifact {
  return {
    projectId: "project-1",
    releasePlanId: "release-1",
    deploymentKey: "release_plan:release-1",
    createdAt: "2026-06-29T00:00:00.000Z",
    pages: [
      {
        releasePlanItemId: "item-1",
        pageVersionId: "version-1",
        targetUrl: "/",
        targetSubdomain: null,
        action: "create",
        pageJson: pageJson()
      }
    ]
  };
}

function pageJson(input: Partial<PageJson> = {}): PageJson {
  return {
    schemaVersion: 1,
    route: "/",
    pageType: "home_page",
    target: {
      service: "Gebaeudeservice",
      primaryKeyword: "Gebaeudeservice",
      secondaryKeywords: []
    },
    seo: {
      title: "Home",
      metaDescription: "Home page.",
      canonicalPath: "/",
      robots: "noindex",
      jsonLd: [],
      sitemapReady: false
    },
    sections: [
      {
        id: "hero-1",
        type: "Hero",
        registryKey: "Hero.default",
        schemaVersion: 1,
        zone: "hero",
        order: 0,
        variant: "default",
        props: {
          h1: "Home",
          lead: "Home page."
        },
        evidenceRefs: []
      }
    ],
    internalLinks: [],
    evidenceRefs: [],
    uniquenessRationale: "Home page scaffold.",
    ...input
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function requestUrlToString(input: URL | RequestInfo): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function requestBodyToString(body: BodyInit | null | undefined): string {
  if (typeof body === "string") {
    return body;
  }

  throw new Error("Expected string request body");
}

function headerValue(headers: HeadersInit | undefined, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }

  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  if (Array.isArray(headers)) {
    return headers.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  }

  return headers[name];
}

function staticFileBytes(file: StaticSiteArtifact["files"][number]): Buffer {
  return Buffer.from(file.body, file.encoding === "base64" ? "base64" : "utf8");
}

function sha1(body: Uint8Array): string {
  return createHash("sha1").update(body).digest("hex");
}
