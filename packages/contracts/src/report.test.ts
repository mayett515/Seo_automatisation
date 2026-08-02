import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CustomerApprovedNextActionEventSchema,
  CustomerReportDecisionNoteSchema,
  CustomerReportSnapshotSchema,
  PageVersionReportEvidenceSchema,
  ReportGeneratedEventSchema
} from "./index.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const rankingProofId = "22222222-2222-4222-8222-222222222222";
const opportunityId = "33333333-3333-4333-8333-333333333333";
const reportId = "44444444-4444-4444-8444-444444444444";
const reportIssueId = "55555555-5555-4555-8555-555555555555";
const generationRunId = "66666666-6666-4666-8666-666666666666";
const actorUserId = "77777777-7777-4777-8777-777777777777";
const receiptId = "88888888-8888-4888-8888-888888888888";
const digest = "a".repeat(64);
const cutoff = "2026-08-01T10:00:00.000Z";

void describe("CustomerReportSnapshotSchema", () => {
  void it("parses a strict fact-only customer report and normalizes timestamps to UTC", () => {
    const result = CustomerReportSnapshotSchema.parse(
      validSnapshot({ generatedAt: "2026-08-01T12:00:00+02:00", evidenceCutoffAt: "2026-08-01T12:00:00+02:00" })
    );

    assert.equal(result.generatedAt, cutoff);
    assert.equal(result.evidenceCutoffAt, cutoff);
    assert.equal(result.narrativeMode, "fact_only");
    assert.deepEqual(result.narrative, []);
  });

  void it("rejects banned GSC diagnostics and arbitrary customer-facing fields", () => {
    const snapshot = validSnapshot();
    const [rankingClaim] = snapshot.factProjection.claims;

    const result = CustomerReportSnapshotSchema.safeParse({
      ...snapshot,
      factProjection: {
        ...snapshot.factProjection,
        claims: [{ ...rankingClaim, impressions: 1_200, ctr: 0.2, averagePosition: 4.2 }]
      }
    });

    assert.equal(result.success, false);
  });

  void it("rejects non-HTTP evidence URLs and unsupported navigation actions", () => {
    const snapshot = validSnapshot();

    assert.equal(
      CustomerReportSnapshotSchema.safeParse({
        ...snapshot,
        factProjection: {
          ...snapshot.factProjection,
          claims: snapshot.factProjection.claims.map((claim) =>
            claim.kind === "ranking_result" ? { ...claim, pageUrl: "javascript:alert(1)" } : claim
          )
        }
      }).success,
      false
    );

    assert.equal(
      CustomerReportSnapshotSchema.safeParse({
        ...snapshot,
        factProjection: {
          ...snapshot.factProjection,
          nextActions: [
            {
              ...snapshot.factProjection.nextActions[0],
              supportingClaimKeys: [],
              target: { surface: "arbitrary_url", url: "https://evil.example" }
            }
          ]
        }
      }).success,
      false
    );
  });

  void it("rejects duplicate logical keys, missing links, and unreferenced evidence", () => {
    const snapshot = validSnapshot();
    const rankingEvidence = snapshot.factProjection.evidence[0];

    const result = CustomerReportSnapshotSchema.safeParse({
      ...snapshot,
      factProjection: {
        claims: [
          ...snapshot.factProjection.claims,
          { ...snapshot.factProjection.claims[0], evidenceKeys: ["missing:evidence"] }
        ],
        evidence: [...snapshot.factProjection.evidence, { ...rankingEvidence }],
        nextActions: snapshot.factProjection.nextActions
      }
    });

    assert.equal(result.success, false);
    const messages = result.error.issues.map((issue) => issue.message).join("\n");
    assert.match(messages, /Duplicate claim key/u);
    assert.match(messages, /Duplicate evidence key/u);
    assert.match(messages, /references missing evidence/u);
  });

  void it("rejects invalid Unicode text and unsafe integers", () => {
    assert.equal(CustomerReportSnapshotSchema.safeParse(validSnapshot({ title: "Broken \ud800" })).success, false);

    assert.equal(
      PageVersionReportEvidenceSchema.safeParse({
        evidenceKey: "page:1",
        projectId,
        sourceId: reportId,
        sourceVersion: "1",
        observedAt: cutoff,
        selectedAtCutoff: cutoff,
        payloadSha256: digest,
        customerLabel: "Seite",
        sourceKind: "page_version",
        proofTier: "customer_safe_proof",
        pageVersionId: reportId,
        route: "/service/",
        versionNumber: Number.MAX_SAFE_INTEGER + 1,
        status: "approved",
        approvedAt: cutoff
      }).success,
      false
    );
  });

  void it("keeps fact-only and bounded narrative modes distinct", () => {
    const result = CustomerReportSnapshotSchema.safeParse({
      ...validSnapshot(),
      narrative: [
        {
          slotKey: "summary:heading",
          kind: "heading",
          text: "Monatlicher Fortschritt",
          supportingClaimKeys: ["ranking:roof-cleaning"]
        }
      ]
    });

    assert.equal(result.success, false);
    assert.match(result.error.issues.map((issue) => issue.message).join("\n"), /Fact-only reports/u);
  });

  void it("rejects cross-project and cutoff-mismatched snapshot evidence", () => {
    const snapshot = validSnapshot();
    const result = CustomerReportSnapshotSchema.safeParse({
      ...snapshot,
      factProjection: {
        ...snapshot.factProjection,
        evidence: snapshot.factProjection.evidence.map((evidence, index) =>
          index === 0
            ? {
                ...evidence,
                projectId: "99999999-9999-4999-8999-999999999999",
                selectedAtCutoff: "2026-07-31T10:00:00.000Z"
              }
            : evidence
        )
      }
    });

    assert.equal(result.success, false);
    const messages = result.error.issues.map((issue) => issue.message).join("\n");
    assert.match(messages, /different project/u);
    assert.match(messages, /different cutoff/u);
  });

  void it("requires rollback verification to occur after the rollback", () => {
    const snapshot = validSnapshot();
    const result = CustomerReportSnapshotSchema.safeParse({
      ...snapshot,
      factProjection: {
        claims: [
          {
            claimKey: "rollback:release-1",
            kind: "rollback_correction",
            section: "rollback_corrections",
            evidenceKeys: ["rollback:release-1", "verification:release-1"],
            rollbackPointId: "44444444-4444-4444-8444-444444444444",
            deploymentId: "55555555-5555-4555-8555-555555555555",
            verificationId: "66666666-6666-4666-8666-666666666666",
            outcome: "correction_verified",
            occurredAt: "2026-07-28T10:00:00.000Z",
            verifiedAt: "2026-07-28T09:00:00.000Z"
          }
        ],
        evidence: [],
        nextActions: []
      }
    });

    assert.equal(result.success, false);
    assert.match(result.error.issues.map((issue) => issue.message).join("\n"), /must occur after the rollback/u);
  });
});

void describe("customer report event semantics", () => {
  void it("rejects unsupported controls in report review notes", () => {
    assert.equal(CustomerReportDecisionNoteSchema.safeParse("Bitte pruefen.\u0000").success, false);
  });

  void it("defines ReportGenerated as a durable draft candidate rather than publication", () => {
    const event = ReportGeneratedEventSchema.parse({
      eventName: "ReportGenerated",
      projectId,
      reportIssueId,
      reportId,
      generationRunId,
      reportVersion: 1,
      reportStatus: "draft",
      snapshotSha256: digest,
      occurredAt: cutoff
    });

    assert.equal(event.reportStatus, "draft");
    assert.equal(ReportGeneratedEventSchema.safeParse({ ...event, publishedAt: cutoff }).success, false);
  });

  void it("defines CustomerApprovedNextAction as actor-backed consent rather than downstream completion", () => {
    const event = CustomerApprovedNextActionEventSchema.parse({
      eventName: "CustomerApprovedNextAction",
      projectId,
      reportId,
      actionKey: "action:review-opportunity",
      receiptId,
      actorUserId,
      intentSha256: digest,
      consentStatus: "accepted",
      occurredAt: cutoff
    });

    assert.equal(event.consentStatus, "accepted");
    assert.equal(
      CustomerApprovedNextActionEventSchema.safeParse({ ...event, downstreamCompleted: true }).success,
      false
    );
  });
});

function validSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "customer_report_snapshot.v1",
    identity: {
      projectId,
      reportKind: "monthly_seo_progress",
      period: "2026-07",
      locale: "de-DE",
      timezone: "Europe/Berlin"
    },
    generatedAt: cutoff,
    evidenceCutoffAt: cutoff,
    assemblerVersion: "report-assembler.v1",
    eligibilityPolicyVersion: "report-eligibility.v1",
    actionSelectionPolicyVersion: "report-actions.v1",
    narrativePolicyVersion: "report-narrative.v1",
    templateVersion: "customer-report-html.v1",
    narrativeMode: "fact_only",
    title: "Local SEO Fortschritt Juli 2026",
    factProjectionSha256: digest,
    factProjection: {
      claims: [
        {
          claimKey: "ranking:roof-cleaning",
          kind: "ranking_result",
          section: "ranking_results",
          evidenceKeys: ["proof:roof-cleaning"],
          query: "Dachreinigung Dachau",
          pageUrl: "https://example.test/dachreinigung-dachau/",
          rank: 2,
          milestone: "rank_2"
        },
        {
          claimKey: "opportunity:facade-cleaning",
          kind: "future_opportunity",
          section: "future_opportunities",
          evidenceKeys: ["opportunity:facade-cleaning"],
          opportunityId,
          title: "Fassadenreinigung Dachau",
          recommendedAction: "create_page_proposal"
        }
      ],
      evidence: [
        {
          evidenceKey: "proof:roof-cleaning",
          projectId,
          sourceId: rankingProofId,
          sourceVersion: "1",
          observedAt: "2026-07-25T09:00:00.000Z",
          selectedAtCutoff: cutoff,
          payloadSha256: digest,
          customerLabel: "Gepruefter Ranking-Nachweis",
          sourceKind: "ranking_proof",
          proofTier: "customer_safe_proof",
          query: "Dachreinigung Dachau",
          pageUrl: "https://example.test/dachreinigung-dachau/",
          rank: 2,
          searchEngine: "google",
          device: "mobile",
          locale: "de-DE",
          status: "reviewed"
        },
        {
          evidenceKey: "opportunity:facade-cleaning",
          projectId,
          sourceId: opportunityId,
          sourceVersion: "3",
          observedAt: "2026-07-30T09:00:00.000Z",
          selectedAtCutoff: cutoff,
          payloadSha256: "b".repeat(64),
          customerLabel: "Zukuenftige Chance",
          sourceKind: "opportunity",
          proofTier: "supporting_context",
          opportunityId,
          classification: "near_term_target",
          status: "monitoring",
          title: "Fassadenreinigung Dachau"
        }
      ],
      nextActions: [
        {
          actionKey: "action:review-opportunity",
          kind: "navigation_ref",
          label: "Chance ansehen",
          supportingClaimKeys: ["opportunity:facade-cleaning"],
          target: { surface: "opportunity", opportunityId }
        }
      ]
    },
    narrative: [],
    ...overrides
  };
}
