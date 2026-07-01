import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { HttpWebsiteCrawlerAdapter } from "./http-website-crawler.js";
import type { ObjectStoragePort } from "./index.js";

void describe("HttpWebsiteCrawlerAdapter", () => {
  let server: Server;
  let baseUrl: string;

  void before(async () => {
    server = createServer((request, response) => {
      if (request.url === "/redirect") {
        response.writeHead(302, { location: "https://external.test/ignore" });
        response.end();
        return;
      }

      if (request.url === "/service") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(`<!doctype html>
<html>
<head><title>Service Page</title></head>
<body><h1>Dachreinigung Service</h1></body>
</html>`);
        return;
      }

      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html>
<head>
  <title>Gebaeudeservice Muenchen</title>
  <meta name="description" content="Lokaler Gebaeudeservice in Muenchen.">
  <link rel="canonical" href="${baseUrl}/">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness"}</script>
</head>
<body>
  <h1>Gebaeudeservice in Muenchen</h1>
  <a href="/service">Service</a>
  <a href="https://external.test/ignore">External</a>
  <img src="/hero.jpg" alt="Team vor Ort">
</body>
</html>`);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();
    assert.ok(address && typeof address === "object");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  void after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  void it("crawls same-origin pages and stores extracted snapshot evidence", async () => {
    const storage = new MemoryObjectStorage();
    const crawler = new HttpWebsiteCrawlerAdapter(storage, {
      maxPages: 4,
      maxDepth: 1
    });

    const snapshot = await crawler.crawlWebsite({
      projectId: "project-1",
      importRunId: "import-1",
      sourceUrl: `${baseUrl}/`
    });

    assert.equal(snapshot.projectId, "project-1");
    assert.equal(snapshot.artifactKey, "website-imports/project-1/import-1.json");
    assert.deepEqual(snapshot.discoveredRoutes, ["/", "/service"]);
    assert.equal(snapshot.pages.length, 2);
    assert.equal(snapshot.pages[0]?.title, "Gebaeudeservice Muenchen");
    assert.equal(snapshot.pages[0]?.h1, "Gebaeudeservice in Muenchen");
    assert.deepEqual(snapshot.pages[0]?.schemaTypes, ["LocalBusiness"]);
    assert.deepEqual(snapshot.pages[0]?.images, [{ src: `${baseUrl}/hero.jpg`, alt: "Team vor Ort" }]);
    assert.equal(
      snapshot.pages.some((page) => page.url === "https://external.test/ignore"),
      false
    );
    assert.deepEqual(await storage.getJson({ key: snapshot.artifactKey }), snapshot);
  });

  void it("does not fetch off-origin redirect targets", async () => {
    const storage = new MemoryObjectStorage();
    const crawler = new HttpWebsiteCrawlerAdapter(storage, {
      maxPages: 2,
      maxDepth: 1
    });

    const snapshot = await crawler.crawlWebsite({
      projectId: "project-1",
      importRunId: "import-redirect",
      sourceUrl: `${baseUrl}/redirect`
    });

    assert.deepEqual(snapshot.discoveredRoutes, ["/redirect"]);
    assert.equal(snapshot.pages[0]?.status, 302);
    assert.equal(snapshot.pages[0]?.url, `${baseUrl}/redirect`);
  });
});

class MemoryObjectStorage implements ObjectStoragePort {
  private readonly values = new Map<string, unknown>();

  putJson(input: { key: string; value: unknown }): Promise<{ key: string }> {
    this.values.set(input.key, input.value);
    return Promise.resolve({ key: input.key });
  }

  getJson(input: { key: string }): Promise<unknown> {
    return Promise.resolve(this.values.get(input.key));
  }
}
