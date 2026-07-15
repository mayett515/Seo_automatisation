import { createServer } from "node:http";
import { expect, test } from "@playwright/test";
import {
  previewAssetCookieName,
  previewDocumentCookieName,
  serializePreviewCapabilityCookie
} from "../../api/src/preview-capability.js";

const pageVersionId = "10000000-0000-4000-8000-000000000001";
const transparentPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

test("sandboxed preview sends the partitioned asset capability from its opaque origin", async ({ page }) => {
  const documentCookieName = previewDocumentCookieName(pageVersionId);
  const assetCookieName = previewAssetCookieName(pageVersionId);
  let documentCapabilitySeen = false;
  let assetCapabilitySeen = false;

  const server = createServer((request, response) => {
    response.setHeader("access-control-allow-origin", "http://127.0.0.1:5173");
    response.setHeader("access-control-allow-credentials", "true");
    response.setHeader("cache-control", "no-store");

    if (request.url === "/metadata") {
      response.setHeader(
        "set-cookie",
        serializePreviewCapabilityCookie({ name: documentCookieName, token: "document-token", path: "/" })
      );
      response.statusCode = 204;
      response.end();
      return;
    }

    if (request.url === "/document") {
      documentCapabilitySeen = request.headers.cookie?.includes(`${documentCookieName}=document-token`) ?? false;
      if (!documentCapabilitySeen) {
        response.statusCode = 401;
        response.end("document capability missing");
        return;
      }
      response.setHeader(
        "set-cookie",
        serializePreviewCapabilityCookie({ name: assetCookieName, token: "asset-token", path: "/assets" })
      );
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end('<img id="preview-media" src="/assets/preview.png" alt="" width="20" height="20">');
      return;
    }

    if (request.url === "/assets/preview.png") {
      assetCapabilitySeen = request.headers.cookie?.includes(`${assetCookieName}=asset-token`) ?? false;
      if (!assetCapabilitySeen) {
        response.statusCode = 401;
        response.end("asset capability missing");
        return;
      }
      response.setHeader("content-type", "image/png");
      response.setHeader("content-length", transparentPng.byteLength);
      response.end(transparentPng);
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
      throw new Error("Preview capability browser test server did not expose a TCP port.");
    }
    const previewOrigin = `http://localhost:${address.port}`;

    await page.goto("/login");
    const metadataStatus = await page.evaluate(async (url) => {
      const response = await fetch(url, { credentials: "include" });
      return response.status;
    }, `${previewOrigin}/metadata`);
    expect(metadataStatus).toBe(204);
    const metadataCookies = await page.context().cookies(previewOrigin);
    expect(metadataCookies.some((cookie) => cookie.name === documentCookieName)).toBe(true);

    await page.evaluate((documentUrl) => {
      const iframe = document.createElement("iframe");
      iframe.setAttribute("sandbox", "");
      iframe.src = documentUrl;
      document.body.append(iframe);
    }, `${previewOrigin}/document`);

    await expect.poll(() => documentCapabilitySeen).toBe(true);
    await expect.poll(() => assetCapabilitySeen).toBe(true);
    const image = page.frameLocator("iframe").locator("#preview-media");
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
