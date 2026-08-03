import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CustomerReportClaim, CustomerReportEvidenceItem, CustomerReportSnapshot } from "@localseo/contracts";
import { CustomerReportSnapshotSchema } from "@localseo/contracts";
import fc from "fast-check";
import {
  canonicalizeCustomerReportSnapshot,
  canonicalizeCustomerReportHtmlRenderManifest,
  assembleCustomerReportFactProjection,
  buildCustomerReportHtmlRenderManifest,
  canonicalizeCustomerReportEvidencePacket,
  customerReportActionQuotas,
  customerReportPeriodWindow,
  customerSafeReleaseWarningForCheck,
  decideCustomerReportGenerationWindow,
  decideCustomerReportActionAvailability,
  decideCustomerReportArtifactTransition,
  decideCustomerReportClaimEligibility,
  decideCustomerReportTransition,
  rankingMilestoneForRank,
  summarizeCustomerReportClaims
} from "./report.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const otherProjectId = "99999999-9999-4999-8999-999999999999";
const rankingProofId = "22222222-2222-4222-8222-222222222222";
const opportunityId = "33333333-3333-4333-8333-333333333333";
const rollbackPointId = "44444444-4444-4444-8444-444444444444";
const deploymentId = "55555555-5555-4555-8555-555555555555";
const verificationId = "66666666-6666-4666-8666-666666666666";
const releasePlanId = "77777777-7777-4777-8777-777777777777";
const reportId = "88888888-8888-4888-8888-888888888888";
const digest = "a".repeat(64);
const cutoff = "2026-08-01T10:00:00.000Z";

void describe("customer report canonicalization", () => {
  void it("produces identical canonical text for shuffled semantic arrays", () => {
    const first = validSnapshot();
    const second = CustomerReportSnapshotSchema.parse({
      ...validSnapshot(),
      factProjection: {
        claims: [...first.factProjection.claims].reverse(),
        evidence: [...first.factProjection.evidence].reverse(),
        nextActions: first.factProjection.nextActions.map((action) => ({
          ...action,
          supportingClaimKeys: [...action.supportingClaimKeys].reverse()
        }))
      }
    });

    assert.equal(canonicalizeCustomerReportSnapshot(first), canonicalizeCustomerReportSnapshot(second));
  });

  void it("uses RFC 8785 object-key ordering and normalized UTC timestamps", () => {
    const canonical = canonicalizeCustomerReportSnapshot({
      ...validSnapshot(),
      generatedAt: "2026-08-01T12:00:00+02:00"
    });

    assert.match(canonical, /"generatedAt":"2026-08-01T10:00:00.000Z"/u);
    assert.ok(canonical.indexOf('"actionSelectionPolicyVersion"') < canonical.indexOf('"assemblerVersion"'));
  });

  void it("keeps canonical identity under generated semantic-array permutations", () => {
    const base = propertySnapshot();
    const expected = canonicalizeCustomerReportSnapshot(base);

    fc.assert(
      fc.property(
        fc.shuffledSubarray([0, 1], { minLength: 2, maxLength: 2 }),
        fc.shuffledSubarray([0, 1, 2], { minLength: 3, maxLength: 3 }),
        fc.shuffledSubarray([0, 1], { minLength: 2, maxLength: 2 }),
        fc.shuffledSubarray([0, 1], { minLength: 2, maxLength: 2 }),
        fc.boolean(),
        (claimOrder, evidenceOrder, actionOrder, narrativeOrder, reverseNestedKeys) => {
          const candidate = CustomerReportSnapshotSchema.parse({
            ...base,
            factProjection: {
              claims: claimOrder.map((index) => {
                const claim = base.factProjection.claims[index]!;
                return reverseNestedKeys ? { ...claim, evidenceKeys: [...claim.evidenceKeys].reverse() } : claim;
              }),
              evidence: evidenceOrder.map((index) => base.factProjection.evidence[index]!),
              nextActions: actionOrder.map((index) => {
                const action = base.factProjection.nextActions[index]!;
                return reverseNestedKeys
                  ? { ...action, supportingClaimKeys: [...action.supportingClaimKeys].reverse() }
                  : action;
              })
            },
            narrative: narrativeOrder.map((index) => {
              const fragment = base.narrative[index]!;
              return reverseNestedKeys
                ? { ...fragment, supportingClaimKeys: [...fragment.supportingClaimKeys].reverse() }
                : fragment;
            })
          });

          assert.equal(canonicalizeCustomerReportSnapshot(candidate), expected);
        }
      ),
      { numRuns: 100 }
    );
  });
});

void describe("customer report reviewed HTML artifacts", () => {
  void it("builds and canonicalizes a version-pinned render manifest", () => {
    const manifest = buildCustomerReportHtmlRenderManifest({
      projectId,
      reportId,
      snapshotSha256: digest,
      reportSchemaVersion: "customer_report_snapshot.v1",
      templateVersion: "customer-report-html.v1",
      locale: "de-DE",
      timezone: "Europe/Berlin"
    });

    assert.equal(manifest.rendererVersion, "customer_report_html_renderer.v1");
    assert.equal(manifest.stylesheetVersion, "customer_report_stylesheet.v1");
    assert.equal(
      canonicalizeCustomerReportHtmlRenderManifest(manifest),
      canonicalizeCustomerReportHtmlRenderManifest({ ...manifest })
    );
  });

  void it("allows only the bounded artifact lifecycle", () => {
    assert.deepEqual(decideCustomerReportArtifactTransition("pending", "claim_render"), {
      kind: "allow",
      to: "running"
    });
    assert.deepEqual(decideCustomerReportArtifactTransition("running", "stage"), {
      kind: "allow",
      to: "staged"
    });
    assert.deepEqual(decideCustomerReportArtifactTransition("staged", "expire"), {
      kind: "allow",
      to: "expired"
    });
    assert.deepEqual(decideCustomerReportArtifactTransition("failed", "claim_render"), {
      kind: "deny",
      reason: "illegal_artifact_transition"
    });
  });
});

void describe("customer report fact-only assembly", () => {
  void it("assembles only evidence-backed claims and typed navigation actions deterministically", () => {
    const packet = {
      schemaVersion: "customer_report_evidence_packet.v1" as const,
      identity: validSnapshot().identity,
      assembledAt: cutoff,
      evidenceCutoffAt: cutoff,
      evidence: [opportunityEvidence(), rankingEvidence()]
    };
    const first = assembleCustomerReportFactProjection(packet);
    const second = assembleCustomerReportFactProjection({ ...packet, evidence: [...packet.evidence].reverse() });

    assert.deepEqual(first, second);
    assert.deepEqual(
      first.claims.map((claim) => claim.kind),
      ["ranking_result", "future_opportunity"]
    );
    assert.deepEqual(first.nextActions, [
      {
        actionKey: `open-opportunity:${opportunityId}`,
        kind: "navigation_ref",
        label: "Chance prüfen",
        supportingClaimKeys: [`opportunity:${opportunityId}`],
        target: { surface: "opportunity", opportunityId }
      }
    ]);
    assert.equal(
      canonicalizeCustomerReportEvidencePacket(packet),
      canonicalizeCustomerReportEvidencePacket({
        ...packet,
        evidence: [...packet.evidence].reverse()
      })
    );
  });

  void it("selects bounded action quotas independently of packet order", () => {
    const opportunities = Array.from({ length: 20 }, (_, index) => {
      const id = reportTestUuid(index + 100);
      return {
        ...opportunityEvidence(),
        evidenceKey: `opportunity:${id}`,
        sourceId: id,
        opportunityId: id,
        title: `Opportunity ${index}`,
        customerLabel: `Opportunity ${index}`
      };
    });
    const pages = Array.from({ length: 20 }, (_, index) => {
      const id = reportTestUuid(index + 200);
      return {
        evidenceKey: `page_version:${id}`,
        projectId,
        sourceId: id,
        sourceVersion: `page-${index}`,
        observedAt: "2026-07-20T10:00:00.000Z",
        selectedAtCutoff: cutoff,
        payloadSha256: digest,
        customerLabel: `Page ${index}`,
        sourceKind: "page_version" as const,
        proofTier: "customer_safe_proof" as const,
        pageVersionId: id,
        route: `/page-${index}/`,
        versionNumber: 1,
        status: "approved" as const,
        approvedAt: "2026-07-20T10:00:00.000Z"
      };
    });
    const packet = {
      schemaVersion: "customer_report_evidence_packet.v1" as const,
      identity: validSnapshot().identity,
      assembledAt: cutoff,
      evidenceCutoffAt: cutoff,
      evidence: [...opportunities, ...pages]
    };
    const first = assembleCustomerReportFactProjection(packet);
    const second = assembleCustomerReportFactProjection({ ...packet, evidence: [...packet.evidence].reverse() });

    assert.deepEqual(first, second);
    assert.equal(
      first.nextActions.filter((action) => action.target.surface === "page_studio_review").length,
      customerReportActionQuotas.pageStudio
    );
    assert.equal(
      first.nextActions.filter((action) => action.target.surface === "opportunity").length,
      customerReportActionQuotas.opportunity
    );
  });

  void it("uses a closed customer-language warning catalog", () => {
    assert.deepEqual(customerSafeReleaseWarningForCheck("http_status_check", "domain"), {
      title: "Eine veröffentlichte Seite war nicht erfolgreich erreichbar.",
      summary: "Mindestens eine geprüfte Seite lieferte keinen erfolgreichen HTTP-Status."
    });
    assert.equal(customerSafeReleaseWarningForCheck("gsc_connection_check", "gsc"), undefined);
    assert.equal(customerSafeReleaseWarningForCheck("verification_execution_error", "project"), undefined);
  });

  void it("binds monthly reports to the completed Berlin-local month and grace window", () => {
    const window = customerReportPeriodWindow("2026-07");
    assert.equal(window.startsAt.toISOString(), "2026-06-30T22:00:00.000Z");
    assert.equal(window.endsAt.toISOString(), "2026-07-31T22:00:00.000Z");
    assert.equal(window.cutoffDeadlineAt.toISOString(), "2026-08-07T22:00:00.000Z");
    assert.equal(
      decideCustomerReportGenerationWindow({
        period: "2026-07",
        evidenceCutoffAt: cutoff,
        now: new Date("2026-08-02T10:00:00.000Z")
      }).kind,
      "allow"
    );
    assert.deepEqual(
      decideCustomerReportGenerationWindow({
        period: "2026-07",
        evidenceCutoffAt: "2026-08-08T10:00:00.000Z",
        now: new Date("2026-08-09T10:00:00.000Z")
      }),
      { kind: "deny", reason: "cutoff_after_grace" }
    );
  });
});

void describe("customer report lifecycle", () => {
  void it("allows only the accepted review and publication progression", () => {
    assert.deepEqual(decideCustomerReportTransition("draft", "submit_for_review"), {
      kind: "allow",
      nextStatus: "ready_for_review",
      requiresHumanActor: true,
      requiresExactDigest: true
    });
    assert.deepEqual(decideCustomerReportTransition("ready_for_review", "request_changes"), {
      kind: "allow",
      nextStatus: "draft",
      requiresHumanActor: true,
      requiresExactDigest: true
    });
    assert.deepEqual(decideCustomerReportTransition("ready_for_review", "publish"), {
      kind: "allow",
      nextStatus: "published",
      requiresHumanActor: true,
      requiresExactDigest: true
    });
    assert.deepEqual(decideCustomerReportTransition("published", "publish_correction_successor"), {
      kind: "allow",
      nextStatus: "superseded",
      requiresHumanActor: true,
      requiresExactDigest: true
    });
  });

  void it("denies publication from draft and reopening published history", () => {
    assert.deepEqual(decideCustomerReportTransition("draft", "publish"), {
      kind: "deny",
      reason: "invalid_lifecycle_transition"
    });
    assert.deepEqual(decideCustomerReportTransition("published", "request_changes"), {
      kind: "deny",
      reason: "invalid_lifecycle_transition"
    });
  });
});

void describe("customer-safe report eligibility", () => {
  void it("accepts fresh reviewed ranking proof with the strongest matching milestone", () => {
    const claim = rankingClaim();
    const evidence = rankingEvidence();

    assert.deepEqual(
      decideCustomerReportClaimEligibility({ claim, evidence: [evidence], projectId, evidenceCutoffAt: cutoff }),
      { kind: "eligible", evidence: [evidence] }
    );
    assert.equal(rankingMilestoneForRank(1), "rank_1");
    assert.equal(rankingMilestoneForRank(2), "rank_2");
    assert.equal(rankingMilestoneForRank(3), "top_3");
    assert.equal(rankingMilestoneForRank(5), "top_5");
    assert.equal(rankingMilestoneForRank(10), "top_10");
    assert.equal(rankingMilestoneForRank(11), undefined);
  });

  void it("rejects stale, cross-project, and mismatched ranking evidence", () => {
    const decision = decideCustomerReportClaimEligibility({
      claim: { ...rankingClaim(), milestone: "top_10" },
      evidence: [
        {
          ...rankingEvidence(),
          projectId: otherProjectId,
          observedAt: "2026-06-01T09:00:00.000Z",
          rank: 3
        }
      ],
      projectId,
      evidenceCutoffAt: cutoff
    });

    assert.equal(decision.kind, "ineligible");
    if (decision.kind === "ineligible") {
      assert.ok(decision.issues.includes("cross_project_evidence"));
      assert.ok(decision.issues.includes("stale_ranking_proof"));
      assert.ok(decision.issues.includes("evidence_value_mismatch"));
      assert.ok(decision.issues.includes("ranking_milestone_mismatch"));
    }
  });

  void it("rejects source facts whose effective timestamp is after the report cutoff", () => {
    const claim: Extract<CustomerReportClaim, { kind: "live_health" }> = {
      claimKey: "health:release-1",
      kind: "live_health",
      section: "live_health",
      evidenceKeys: ["verification:release-1"],
      verificationId,
      deploymentId,
      health: "live_healthy",
      checkedAt: "2026-08-02T10:00:00.000Z"
    };
    const evidence: CustomerReportEvidenceItem = {
      evidenceKey: "verification:release-1",
      projectId,
      sourceId: verificationId,
      sourceVersion: "1",
      observedAt: "2026-07-31T10:00:00.000Z",
      selectedAtCutoff: cutoff,
      payloadSha256: digest,
      customerLabel: "Live-Pruefung",
      sourceKind: "release_verification",
      proofTier: "customer_safe_proof",
      verificationId,
      deploymentId,
      releasePlanId,
      status: "live_healthy",
      checkedAt: "2026-08-02T10:00:00.000Z"
    };

    const decision = decideCustomerReportClaimEligibility({
      claim,
      evidence: [evidence],
      projectId,
      evidenceCutoffAt: cutoff
    });

    assert.equal(decision.kind, "ineligible");
    if (decision.kind === "ineligible") {
      assert.ok(decision.issues.includes("evidence_cutoff_mismatch"));
    }
  });

  void it("keeps future opportunities outside proven ranking totals", () => {
    const claims: CustomerReportClaim[] = [rankingClaim(), futureOpportunityClaim()];

    assert.deepEqual(summarizeCustomerReportClaims(claims), {
      provenRankingResultCount: 1,
      futureOpportunityCount: 1
    });
  });

  void it("rejects typed evidence whose generic source identity disagrees", () => {
    const claim = futureOpportunityClaim();
    const decision = decideCustomerReportClaimEligibility({
      claim,
      evidence: [{ ...opportunityEvidence(), sourceId: rankingProofId }],
      projectId,
      evidenceCutoffAt: cutoff
    });

    assert.equal(decision.kind, "ineligible");
    if (decision.kind === "ineligible") {
      assert.ok(decision.issues.includes("evidence_source_identity_mismatch"));
    }
  });

  void it("requires both rollback and subsequent live verification evidence for correction claims", () => {
    const claim: Extract<CustomerReportClaim, { kind: "rollback_correction" }> = {
      claimKey: "rollback:release-1",
      kind: "rollback_correction",
      section: "rollback_corrections",
      evidenceKeys: ["rollback:release-1", "verification:release-1"],
      rollbackPointId,
      deploymentId,
      verificationId,
      outcome: "rolled_back_with_live_verification",
      occurredAt: "2026-07-28T09:00:00.000Z",
      verifiedAt: "2026-07-28T10:00:00.000Z"
    };
    const rollbackEvidence: CustomerReportEvidenceItem = {
      evidenceKey: "rollback:release-1",
      projectId,
      sourceId: rollbackPointId,
      sourceVersion: "1",
      observedAt: "2026-07-28T09:00:00.000Z",
      selectedAtCutoff: cutoff,
      payloadSha256: digest,
      customerLabel: "Rollback ausgefuehrt",
      sourceKind: "rollback",
      proofTier: "customer_safe_proof",
      rollbackPointId,
      deploymentId,
      releasePlanId,
      status: "rolled_back",
      rolledBackAt: "2026-07-28T09:00:00.000Z"
    };
    const verificationEvidence: CustomerReportEvidenceItem = {
      evidenceKey: "verification:release-1",
      projectId,
      sourceId: verificationId,
      sourceVersion: "1",
      observedAt: "2026-07-28T10:00:00.000Z",
      selectedAtCutoff: cutoff,
      payloadSha256: "c".repeat(64),
      customerLabel: "Live-Pruefung nach Korrektur",
      sourceKind: "release_verification",
      proofTier: "customer_safe_proof",
      verificationId,
      deploymentId,
      releasePlanId,
      status: "live_healthy",
      checkedAt: "2026-07-28T10:00:00.000Z"
    };

    assert.equal(
      decideCustomerReportClaimEligibility({
        claim,
        evidence: [rollbackEvidence, verificationEvidence],
        projectId,
        evidenceCutoffAt: cutoff
      }).kind,
      "eligible"
    );

    const missingVerification = decideCustomerReportClaimEligibility({
      claim,
      evidence: [rollbackEvidence],
      projectId,
      evidenceCutoffAt: cutoff
    });
    assert.equal(missingVerification.kind, "ineligible");
    if (missingVerification.kind === "ineligible") {
      assert.ok(missingVerification.issues.includes("missing_evidence"));
      assert.ok(missingVerification.issues.includes("missing_required_evidence_kind"));
    }

    const wrongDeployment = decideCustomerReportClaimEligibility({
      claim,
      evidence: [
        rollbackEvidence,
        {
          ...verificationEvidence,
          deploymentId: "77777777-7777-4777-8777-777777777777"
        }
      ],
      projectId,
      evidenceCutoffAt: cutoff
    });
    assert.equal(wrongDeployment.kind, "ineligible");
    if (wrongDeployment.kind === "ineligible") {
      assert.ok(wrongDeployment.issues.includes("evidence_value_mismatch"));
    }
  });
});

void describe("customer report navigation actions", () => {
  const action = validSnapshot().factProjection.nextActions[0]!;

  void it("allows navigation only from the current published report", () => {
    assert.deepEqual(decideCustomerReportActionAvailability("published", action), { kind: "available", action });
    assert.deepEqual(decideCustomerReportActionAvailability("superseded", action), {
      kind: "view_only",
      reason: "superseded_report"
    });
    assert.deepEqual(decideCustomerReportActionAvailability("ready_for_review", action), {
      kind: "unavailable",
      reason: "report_not_published"
    });
  });
});

function validSnapshot(): CustomerReportSnapshot {
  return CustomerReportSnapshotSchema.parse({
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
      claims: [rankingClaim(), futureOpportunityClaim()],
      evidence: [rankingEvidence(), opportunityEvidence()],
      nextActions: [
        {
          actionKey: "action:review-opportunity",
          kind: "navigation_ref",
          label: "Chance ansehen",
          supportingClaimKeys: ["opportunity:facade-cleaning", "ranking:roof-cleaning"],
          target: { surface: "opportunity", opportunityId }
        }
      ]
    },
    narrative: []
  });
}

function propertySnapshot(): CustomerReportSnapshot {
  const snapshot = validSnapshot();
  const ranking = snapshot.factProjection.claims[0]!;
  const rankingProof = snapshot.factProjection.evidence[0]!;

  return CustomerReportSnapshotSchema.parse({
    ...snapshot,
    narrativeMode: "bounded_ai",
    factProjection: {
      claims: [
        { ...ranking, evidenceKeys: [ranking.evidenceKeys[0], "proof:roof-cleaning:secondary"] },
        snapshot.factProjection.claims[1]
      ],
      evidence: [
        rankingProof,
        { ...rankingProof, evidenceKey: "proof:roof-cleaning:secondary", payloadSha256: "c".repeat(64) },
        snapshot.factProjection.evidence[1]
      ],
      nextActions: [
        snapshot.factProjection.nextActions[0],
        {
          actionKey: "action:review-page",
          kind: "navigation_ref",
          label: "Seite ansehen",
          supportingClaimKeys: ["ranking:roof-cleaning", "opportunity:facade-cleaning"],
          target: { surface: "opportunity", opportunityId }
        }
      ]
    },
    narrative: [
      {
        slotKey: "summary:heading",
        kind: "heading",
        text: "Fortschritt im Ueberblick",
        supportingClaimKeys: ["ranking:roof-cleaning", "opportunity:facade-cleaning"]
      },
      {
        slotKey: "summary:transition",
        kind: "transition",
        text: "Als naechstes folgt die priorisierte Chance.",
        supportingClaimKeys: ["opportunity:facade-cleaning"]
      }
    ]
  });
}

function reportTestUuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function rankingClaim(): Extract<CustomerReportClaim, { kind: "ranking_result" }> {
  return {
    claimKey: "ranking:roof-cleaning",
    kind: "ranking_result",
    section: "ranking_results",
    evidenceKeys: ["proof:roof-cleaning"],
    query: "Dachreinigung Dachau",
    pageUrl: "https://example.test/dachreinigung-dachau/",
    rank: 2,
    milestone: "rank_2"
  };
}

function futureOpportunityClaim(): Extract<CustomerReportClaim, { kind: "future_opportunity" }> {
  return {
    claimKey: "opportunity:facade-cleaning",
    kind: "future_opportunity",
    section: "future_opportunities",
    evidenceKeys: ["opportunity:facade-cleaning"],
    opportunityId,
    title: "Fassadenreinigung Dachau",
    recommendedAction: "create_page_proposal"
  };
}

function rankingEvidence(): Extract<CustomerReportEvidenceItem, { sourceKind: "ranking_proof" }> {
  return {
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
  };
}

function opportunityEvidence(): Extract<CustomerReportEvidenceItem, { sourceKind: "opportunity" }> {
  return {
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
  };
}
