import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CustomerApprovedNextActionEventSchema,
  CreateCustomerReportGenerationRequestSchema,
  CustomerReportCandidateDetailSchema,
  CustomerReportDecisionNoteSchema,
  CustomerReportArtifactRetryCommandSchema,
  CustomerReportEvidencePacketSchema,
  CustomerReportFactProjectionSchema,
  CustomerReportGenerationJobDataSchema,
  CustomerReportGenerationResponseSchema,
  CustomerReportHtmlRenderJobDataSchema,
  CustomerReportHtmlRenderManifestSchema,
  CustomerReportNarrativeDraftOutputSchema,
  CustomerReportNarrativePacketSchema,
  CustomerReportPublicationCommandSchema,
  CustomerReportPublishedDetailSchema,
  CustomerReportReviewCommandSchema,
  CustomerReportReviewResponseSchema,
  CustomerReportSnapshotSchema,
  CustomerReportWorkspaceResponseSchema,
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
const artifactId = "88888888-8888-4888-9888-888888888888";
const deploymentId = "99999999-9999-4999-8999-999999999999";
const releasePlanId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
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

  void it("requires bounded AI snapshots to carry attributed narrative", () => {
    const snapshot = validSnapshot();
    assert.equal(
      CustomerReportSnapshotSchema.safeParse({ ...snapshot, narrativeMode: "bounded_ai", narrative: [] }).success,
      false
    );
    assert.equal(
      CustomerReportSnapshotSchema.safeParse({
        ...snapshot,
        narrativeMode: "bounded_ai",
        narrative: [
          {
            slotKey: "heading:ranking_results",
            kind: "heading",
            text: "Gepruefte Sichtbarkeit",
            supportingClaimKeys: []
          }
        ]
      }).success,
      true
    );
  });

  void it("keeps model-owned narrative output narrower than server-owned slot metadata", () => {
    const packet = CustomerReportNarrativePacketSchema.parse({
      schemaVersion: "customer_report_narrative_packet.v1",
      projectId,
      reportId,
      generationRunId,
      locale: "de-DE",
      period: "2026-07",
      factProjectionSha256: digest,
      slots: [
        {
          slotKey: "transition:ranking_results:01",
          kind: "transition",
          section: "ranking_results",
          sectionLabel: "Ranking-Ergebnisse",
          supportingClaims: [
            { claimKey: "ranking:roof-cleaning", kind: "ranking_result", summary: "Geprueftes Ergebnis." }
          ]
        }
      ]
    });
    assert.equal(packet.slots.length, 1);
    assert.equal(
      CustomerReportNarrativeDraftOutputSchema.safeParse({
        schemaVersion: "customer_report_narrative_draft.v1",
        fragments: [
          {
            slotKey: "transition:ranking_results:01",
            text: "Die geprueften Themen werden eingeordnet.",
            supportingClaimKeys: ["ranking:roof-cleaning"]
          }
        ]
      }).success,
      false
    );
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
            outcome: "rolled_back_with_live_verification",
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

  void it("binds release-review navigation to frozen supporting evidence", () => {
    const evidence = {
      evidenceKey: `deployment:${deploymentId}`,
      projectId,
      sourceId: deploymentId,
      sourceVersion: digest,
      observedAt: "2026-07-20T10:00:00.000Z",
      selectedAtCutoff: cutoff,
      payloadSha256: digest,
      customerLabel: "Provider-Uebergabe",
      sourceKind: "deployment" as const,
      proofTier: "customer_safe_proof" as const,
      deploymentId,
      releasePlanId,
      provider: "netlify",
      providerDeployId: "deploy-1",
      status: "provider_succeeded" as const,
      handedOffAt: "2026-07-20T10:00:00.000Z"
    };
    const claim = {
      claimKey: `handoff:${deploymentId}`,
      kind: "provider_handoff" as const,
      section: "page_delivery" as const,
      evidenceKeys: [evidence.evidenceKey],
      deploymentId,
      provider: "netlify",
      handedOffAt: "2026-07-20T10:00:00.000Z"
    };
    const projection = {
      claims: [claim],
      evidence: [evidence],
      nextActions: [
        {
          actionKey: `review-release:${deploymentId}`,
          kind: "navigation_ref" as const,
          label: "Release pruefen",
          supportingClaimKeys: [claim.claimKey],
          target: { surface: "release_review" as const, releasePlanId }
        }
      ]
    };

    assert.equal(CustomerReportFactProjectionSchema.safeParse(projection).success, true);
    assert.equal(
      CustomerReportFactProjectionSchema.safeParse({
        ...projection,
        nextActions: [
          {
            ...projection.nextActions[0],
            target: { surface: "release_review", releasePlanId: actorUserId }
          }
        ]
      }).success,
      false
    );
  });
});

void describe("customer report review and render contracts", () => {
  void it("pins a strict immutable HTML render manifest and job identity", () => {
    const manifest = CustomerReportHtmlRenderManifestSchema.parse({
      schemaVersion: "customer_report_html_manifest.v1",
      projectId,
      reportId,
      snapshotSha256: digest,
      reportSchemaVersion: "customer_report_snapshot.v1",
      templateVersion: "customer_report_html.v1",
      rendererVersion: "customer_report_html_renderer.v2",
      stylesheetVersion: "customer_report_stylesheet.v2",
      locale: "de-DE",
      timezone: "Europe/Berlin"
    });
    const job = CustomerReportHtmlRenderJobDataSchema.parse({ projectId, reportId, artifactId });

    assert.equal(manifest.snapshotSha256, digest);
    assert.equal(job.artifactId, artifactId);
    assert.equal(CustomerReportHtmlRenderManifestSchema.safeParse({ ...manifest, liveData: true }).success, false);
    assert.equal(CustomerReportHtmlRenderJobDataSchema.safeParse({ ...job, storageKey: "private/key" }).success, false);
  });

  void it("keeps submit and request-changes review commands closed and explicit", () => {
    const submit = CustomerReportReviewCommandSchema.parse({
      command: "submit_for_review",
      requestId: receiptId,
      expectedSnapshotSha256: digest,
      expectedRowVersion: 0
    });
    const requestChanges = CustomerReportReviewCommandSchema.parse({
      command: "request_changes",
      requestId: receiptId,
      expectedSnapshotSha256: digest,
      expectedRowVersion: 1,
      decisionNote: "Die Rangfolge braucht eine erneute Pruefung."
    });

    assert.equal(submit.command, "submit_for_review");
    assert.equal(requestChanges.command, "request_changes");
    assert.equal(
      CustomerReportReviewCommandSchema.safeParse({ ...submit, decisionNote: "not allowed" }).success,
      false
    );
    assert.equal(
      CustomerReportReviewCommandSchema.safeParse({
        command: "request_changes",
        requestId: receiptId,
        expectedSnapshotSha256: digest,
        expectedRowVersion: 1,
        decisionNote: "\u0000"
      }).success,
      false
    );
  });

  void it("returns artifact identity without exposing private storage keys", () => {
    const response = CustomerReportReviewResponseSchema.parse({
      command: "submit_for_review",
      kind: "applied",
      reportId,
      status: "ready_for_review",
      rowVersion: 1,
      snapshotSha256: digest,
      artifact: {
        artifactId,
        reportId,
        format: "html",
        status: "pending",
        snapshotSha256: digest,
        manifestSha256: "b".repeat(64),
        createdAt: cutoff
      },
      renderDispatch: "accepted"
    });

    assert.equal(response.command, "submit_for_review");
    if (response.command !== "submit_for_review") throw new Error("Expected submit-for-review response.");
    assert.equal(response.artifact.artifactId, artifactId);
    assert.equal(
      CustomerReportReviewResponseSchema.safeParse({
        ...response,
        artifact: { ...response.artifact, storageKey: "reports/private.html" }
      }).success,
      false
    );
  });

  void it("keeps artifact retry and publication commands digest-bound and closed", () => {
    const target = {
      requestId: receiptId,
      expectedSnapshotSha256: digest,
      expectedRowVersion: 1
    };
    const retry = CustomerReportArtifactRetryCommandSchema.parse({ command: "retry_render", ...target });
    const publication = CustomerReportPublicationCommandSchema.parse({
      command: "publish",
      artifactId,
      ...target
    });

    assert.equal(retry.command, "retry_render");
    assert.equal(publication.artifactId, artifactId);
    assert.equal(CustomerReportArtifactRetryCommandSchema.safeParse({ ...retry, artifactId }).success, false);
    assert.equal(
      CustomerReportPublicationCommandSchema.safeParse({ ...publication, storageKey: "reports/private.html" }).success,
      false
    );
  });

  void it("returns published snapshot truth without private artifact locations", () => {
    const snapshot = CustomerReportSnapshotSchema.parse(validSnapshot());
    const detail = CustomerReportPublishedDetailSchema.parse({
      report: {
        reportId,
        reportIssueId,
        versionNumber: 1,
        status: "published",
        period: "2026-07",
        title: snapshot.title,
        snapshotSha256: digest,
        artifactId,
        artifactSha256: "b".repeat(64),
        publishedAt: cutoff,
        correctionRequired: false
      },
      snapshot
    });

    assert.equal(detail.report.status, "published");
    assert.equal(
      CustomerReportPublishedDetailSchema.safeParse({
        ...detail,
        report: { ...detail.report, storageKey: "reports/private.html", url: "/arbitrary" }
      }).success,
      false
    );
  });

  void it("keeps operator workspace candidates bounded and free of storage locations", () => {
    const snapshot = CustomerReportSnapshotSchema.parse(validSnapshot());
    const candidate = {
      reportId,
      reportIssueId,
      versionNumber: 1,
      status: "ready_for_review" as const,
      period: "2026-07",
      title: snapshot.title,
      snapshotSha256: digest,
      rowVersion: 1,
      narrativeMode: "fact_only" as const,
      generatedAt: cutoff,
      evidenceCutoffAt: cutoff,
      readyAt: cutoff,
      createdAt: cutoff
    };
    const artifact = {
      artifactId,
      reportId,
      format: "html" as const,
      status: "staged" as const,
      snapshotSha256: digest,
      manifestSha256: "b".repeat(64),
      artifactSha256: "c".repeat(64),
      byteSize: 1_024,
      createdAt: cutoff,
      stagedAt: cutoff
    };

    assert.equal(
      CustomerReportWorkspaceResponseSchema.parse({
        issues: [{ reportIssueId, period: "2026-07", candidate }]
      }).issues[0]?.candidate?.reportId,
      reportId
    );
    assert.equal(
      CustomerReportCandidateDetailSchema.parse({ report: candidate, snapshot, artifacts: [artifact] }).artifacts
        .length,
      1
    );
    assert.equal(
      CustomerReportCandidateDetailSchema.safeParse({
        report: candidate,
        snapshot,
        artifacts: [{ ...artifact, storageKey: "reports/private.html" }]
      }).success,
      false
    );
  });
});

void describe("customer report generation contracts", () => {
  void it("keeps packet references and queue payloads closed", () => {
    const snapshot = validSnapshot();
    const packet = {
      schemaVersion: "customer_report_evidence_packet.v1",
      identity: snapshot.identity,
      assembledAt: cutoff,
      evidenceCutoffAt: cutoff,
      evidence: snapshot.factProjection.evidence
    };

    assert.equal(CustomerReportEvidencePacketSchema.safeParse(packet).success, true);
    assert.equal(CustomerReportEvidencePacketSchema.safeParse({ ...packet, command: "publish" }).success, false);
    assert.equal(
      CustomerReportEvidencePacketSchema.safeParse({
        ...packet,
        evidence: [{ ...packet.evidence[0], impressions: 100, ctr: 0.4, averagePosition: 2.1 }]
      }).success,
      false
    );
    assert.equal(
      CustomerReportGenerationJobDataSchema.safeParse({ projectId, runId: generationRunId, url: "/reports" }).success,
      false
    );
    assert.equal(
      CustomerReportGenerationResponseSchema.safeParse({
        kind: "dry_run",
        status: "queued",
        enqueuedByRequest: false
      }).success,
      false
    );
    assert.equal(
      CustomerReportGenerationResponseSchema.safeParse({
        kind: "dry_run",
        status: "dry_run",
        enqueuedByRequest: false
      }).success,
      true
    );
    assert.equal(
      CustomerReportGenerationResponseSchema.safeParse({
        kind: "created",
        status: "queued",
        enqueuedByRequest: true
      }).success,
      false
    );
  });

  void it("accepts only bounded correction reasons on generation requests", () => {
    const base = { period: "2026-07", evidenceCutoffAt: cutoff, idempotencyKey: receiptId };

    assert.equal(
      CreateCustomerReportGenerationRequestSchema.safeParse({
        ...base,
        correctionReason: "Berichtigte Ranking-Evidenz nach Quelleninvalidierung."
      }).success,
      true
    );
    assert.equal(
      CreateCustomerReportGenerationRequestSchema.safeParse({ ...base, correctionReason: "\u0000" }).success,
      false
    );
    assert.equal(
      CreateCustomerReportGenerationRequestSchema.parse({ ...base, narrativeMode: "bounded_ai" }).narrativeMode,
      "bounded_ai"
    );
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
