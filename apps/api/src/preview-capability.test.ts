import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  previewAssetCookieName,
  previewDocumentCookieName,
  previewMediaManifestSha256,
  readCookieValue,
  serializePreviewCapabilityCookie,
  signPreviewCapability,
  verifyPreviewCapability
} from "./preview-capability.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const pageVersionId = "22222222-2222-4222-8222-222222222222";
const secret = "preview-capability-secret-1234567890";
const now = new Date("2026-07-13T10:00:00.000Z");

void describe("preview capabilities", () => {
  void it("binds a signed short-lived token to one project, version, kind, and manifest", () => {
    const manifestSha256 = previewMediaManifestSha256([]);
    const token = signPreviewCapability({ kind: "document", projectId, pageVersionId, manifestSha256 }, secret, now);
    const claims = verifyPreviewCapability(token, secret, "document", now);

    assert.equal(claims?.projectId, projectId);
    assert.equal(claims?.pageVersionId, pageVersionId);
    assert.equal(claims?.manifestSha256, manifestSha256);
    assert.equal(verifyPreviewCapability(token, secret, "assets", now), undefined);
    assert.equal(verifyPreviewCapability(`${token}tampered`, secret, "document", now), undefined);
    assert.equal(verifyPreviewCapability(token, secret, "document", new Date("2026-07-13T10:05:01.000Z")), undefined);
  });

  void it("uses path-scoped secure partitioned cookies in every environment", () => {
    const name = previewAssetCookieName(pageVersionId);
    const cookie = serializePreviewCapabilityCookie({ name, token: "token", path: "/assets" });

    assert.match(cookie, /Path=\/assets/u);
    assert.match(cookie, /Max-Age=300/u);
    assert.match(cookie, /HttpOnly/u);
    assert.match(cookie, /Secure/u);
    assert.match(cookie, /SameSite=None/u);
    assert.match(cookie, /Partitioned/u);
    assert.equal(readCookieValue(`${previewDocumentCookieName(pageVersionId)}=document; ${name}=token`, name), "token");
  });
});
