import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CustomerReportHtmlRenderManifestSchema,
  CustomerReportSnapshotSchema,
  type CustomerReportSnapshot
} from "@localseo/contracts";
import { renderCustomerReportHtml } from "./customer-report-html.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const reportId = "22222222-2222-4222-8222-222222222222";
const opportunityId = "33333333-3333-4333-8333-333333333333";
const deploymentId = "44444444-4444-4444-8444-444444444444";
const releasePlanId = "55555555-5555-4555-8555-555555555555";
const digest = "a".repeat(64);

void describe("customer report HTML renderer", () => {
  void it("renders deterministic script-free HTML from only snapshot and manifest", () => {
    const snapshot = reportSnapshot();
    const manifest = reportManifest();

    const first = renderCustomerReportHtml(snapshot, manifest);
    const second = renderCustomerReportHtml(structuredClone(snapshot), structuredClone(manifest));

    assert.equal(first, second);
    assert.match(first, /^<!doctype html>/u);
    assert.match(first, /Naechste Chancen/u);
    assert.match(first, /Chance im Opportunity-Bereich pruefen/u);
    assert.doesNotMatch(first, /<script/iu);
    assert.doesNotMatch(first, /\u00b7/u);
    assert.doesNotMatch(first, /javascript:/iu);
  });

  void it("escapes all snapshot-owned customer text instead of treating it as markup", () => {
    const snapshot = reportSnapshot({
      title: "Bericht <script>alert(1)</script>",
      factProjection: {
        ...reportSnapshot().factProjection,
        claims: reportSnapshot().factProjection.claims.map((claim) => ({
          ...claim,
          title: "<img src=x onerror=alert(1)>"
        })),
        evidence: reportSnapshot().factProjection.evidence.map((evidence) => ({
          ...evidence,
          customerLabel: "<b>Nachweis</b>"
        }))
      }
    });

    const html = renderCustomerReportHtml(snapshot, reportManifest());
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/u);
    assert.match(html, /&lt;b&gt;Nachweis&lt;\/b&gt;/u);
    assert.doesNotMatch(html, /<script|<img|<b>/iu);
  });

  void it("renders proof dates in the manifest timezone independently of the worker timezone", () => {
    const base = reportSnapshot();
    const snapshot = reportSnapshot({
      factProjection: {
        ...base.factProjection,
        claims: [
          {
            claimKey: `deployment:${deploymentId}`,
            kind: "provider_handoff",
            section: "page_delivery",
            evidenceKeys: [`deployment:${deploymentId}`],
            deploymentId,
            provider: "netlify",
            handedOffAt: "2026-07-31T23:00:00.000Z"
          },
          ...base.factProjection.claims
        ],
        evidence: [
          {
            evidenceKey: `deployment:${deploymentId}`,
            projectId,
            sourceId: deploymentId,
            sourceVersion: digest,
            observedAt: "2026-07-31T23:00:00.000Z",
            selectedAtCutoff: base.evidenceCutoffAt,
            payloadSha256: digest,
            customerLabel: "Hosting-Uebergabe",
            sourceKind: "deployment",
            proofTier: "customer_safe_proof",
            deploymentId,
            releasePlanId,
            provider: "netlify",
            providerDeployId: "deploy-1",
            status: "provider_succeeded",
            handedOffAt: "2026-07-31T23:00:00.000Z"
          },
          ...base.factProjection.evidence
        ]
      }
    });
    const previousTimezone = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      const fromUtcWorker = renderCustomerReportHtml(snapshot, reportManifest());
      process.env.TZ = "Pacific/Honolulu";
      const fromHonoluluWorker = renderCustomerReportHtml(snapshot, reportManifest());
      assert.equal(fromUtcWorker, fromHonoluluWorker);
      assert.match(fromUtcWorker, /Die Auslieferung wurde am 01\.08\.2026/u);
      assert.doesNotMatch(fromUtcWorker, /31\.07\.2026/u);
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    }
  });

  void it("renders attributed narrative only inside its deterministic section slot", () => {
    const snapshot = reportSnapshot({
      narrativeMode: "bounded_ai",
      narrative: [
        {
          slotKey: "heading:future_opportunities",
          kind: "heading",
          text: "Gepruefte naechste Themen",
          supportingClaimKeys: []
        },
        {
          slotKey: "transition:future_opportunities:01",
          kind: "transition",
          text: "Die geprueften Themen werden gemeinsam eingeordnet.",
          supportingClaimKeys: [`opportunity:${opportunityId}`]
        }
      ]
    });
    const html = renderCustomerReportHtml(snapshot, reportManifest());
    assert.match(html, /<h2 id="future_opportunities">Gepruefte naechste Themen<\/h2>/u);
    assert.match(html, /class="narrative-transition"/u);

    assert.throws(
      () =>
        renderCustomerReportHtml(
          reportSnapshot({
            narrativeMode: "bounded_ai",
            narrative: [
              {
                slotKey: "heading:unknown",
                kind: "heading",
                text: "Nicht zugeordnet",
                supportingClaimKeys: []
              }
            ]
          }),
          reportManifest()
        ),
      /outside the deterministic section layout/u
    );
  });
});

function reportSnapshot(overrides: Partial<CustomerReportSnapshot> = {}): CustomerReportSnapshot {
  return CustomerReportSnapshotSchema.parse({
    schemaVersion: "customer_report_snapshot.v1",
    identity: {
      projectId,
      reportKind: "monthly_seo_progress",
      period: "2026-07",
      locale: "de-DE",
      timezone: "Europe/Berlin"
    },
    generatedAt: "2026-08-01T10:00:00.000Z",
    evidenceCutoffAt: "2026-08-01T10:00:00.000Z",
    assemblerVersion: "customer_report_assembler.v1",
    eligibilityPolicyVersion: "customer_report_eligibility.v1",
    actionSelectionPolicyVersion: "customer_report_actions.v1",
    narrativePolicyVersion: "customer_report_narrative.v1",
    templateVersion: "customer_report_html.v1",
    narrativeMode: "fact_only",
    title: "Local SEO Fortschritt Juli 2026",
    factProjectionSha256: digest,
    factProjection: {
      claims: [
        {
          claimKey: `opportunity:${opportunityId}`,
          kind: "future_opportunity",
          section: "future_opportunities",
          evidenceKeys: [`opportunity:${opportunityId}`],
          opportunityId,
          title: "Fassadenreinigung Dachau",
          recommendedAction: "create_page_proposal"
        }
      ],
      evidence: [
        {
          evidenceKey: `opportunity:${opportunityId}`,
          projectId,
          sourceId: opportunityId,
          sourceVersion: digest,
          observedAt: "2026-07-30T09:00:00.000Z",
          selectedAtCutoff: "2026-08-01T10:00:00.000Z",
          payloadSha256: digest,
          customerLabel: "Gepruefte Chance",
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
          actionKey: `action:opportunity:${opportunityId}`,
          kind: "navigation_ref",
          label: "Chance ansehen",
          supportingClaimKeys: [`opportunity:${opportunityId}`],
          target: { surface: "opportunity", opportunityId }
        }
      ]
    },
    narrative: [],
    ...overrides
  });
}

function reportManifest() {
  return CustomerReportHtmlRenderManifestSchema.parse({
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
}
