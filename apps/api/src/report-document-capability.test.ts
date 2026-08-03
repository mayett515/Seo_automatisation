import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readReportDocumentCapability,
  reportDocumentCookieName,
  serializeReportDocumentCapabilityCookie,
  signReportDocumentCapability,
  verifyReportDocumentCapability
} from "./report-document-capability.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const reportId = "22222222-2222-4222-8222-222222222222";
const artifactId = "33333333-3333-4333-8333-333333333333";
const secret = "report-document-capability-secret-12345";
const now = new Date("2026-08-03T10:00:00.000Z");

void describe("report document capabilities", () => {
  void it("binds a short-lived token to one report artifact and immutable digest pair", () => {
    const token = signReportDocumentCapability(
      {
        kind: "candidate",
        projectId,
        reportId,
        artifactId,
        snapshotSha256: "a".repeat(64),
        artifactSha256: "b".repeat(64)
      },
      secret,
      now
    );
    const claims = verifyReportDocumentCapability(token, secret, now);

    assert.equal(claims?.projectId, projectId);
    assert.equal(claims?.reportId, reportId);
    assert.equal(claims?.artifactId, artifactId);
    assert.equal(verifyReportDocumentCapability(`${token}tampered`, secret, now), undefined);
    assert.equal(verifyReportDocumentCapability(token, secret, new Date("2026-08-03T10:05:01.000Z")), undefined);
  });

  void it("uses an HttpOnly cross-site partitioned cookie readable only by the exact artifact name", () => {
    const token = signReportDocumentCapability(
      {
        kind: "published",
        projectId,
        reportId,
        artifactId,
        snapshotSha256: "a".repeat(64),
        artifactSha256: "b".repeat(64)
      },
      secret,
      now
    );
    const cookie = serializeReportDocumentCapabilityCookie(artifactId, token);

    assert.match(cookie, /Path=\//u);
    assert.match(cookie, /Max-Age=300/u);
    assert.match(cookie, /HttpOnly/u);
    assert.match(cookie, /Secure/u);
    assert.match(cookie, /SameSite=None/u);
    assert.match(cookie, /Partitioned/u);
    assert.equal(reportDocumentCookieName(artifactId), "localseo_report_document_33333333333343338333333333333333");
    assert.equal(readReportDocumentCapability(cookie, artifactId, secret, now)?.kind, "published");
  });
});
