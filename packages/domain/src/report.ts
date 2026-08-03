import type {
  CustomerReportClaim,
  CustomerReportEvidenceItem,
  CustomerReportEvidencePacket,
  CustomerReportFactProjection,
  CustomerReportNavigationRef,
  CustomerReportSnapshot,
  CustomerReportStatus,
  CustomerReportArtifactStatus,
  CustomerReportHtmlRenderManifest
} from "@localseo/contracts";
import {
  CustomerReportHtmlRenderManifestSchema,
  CustomerReportEvidencePacketSchema,
  CustomerReportFactProjectionSchema,
  CustomerReportSha256Schema,
  CustomerReportSnapshotSchema
} from "@localseo/contracts";
import canonicalize from "canonicalize";

const reportSectionOrder = {
  ranking_results: 0,
  page_delivery: 1,
  live_health: 2,
  warnings: 3,
  rollback_corrections: 4,
  future_opportunities: 5
} as const satisfies Record<CustomerReportClaim["section"], number>;

export const customerReportRankingProofMaxAgeDays = 30;
export const customerReportVersions = {
  assemblerVersion: "customer_report_assembler.v1",
  reportSchemaVersion: "customer_report_snapshot.v1",
  eligibilityPolicyVersion: "customer_report_eligibility.v1",
  actionSelectionPolicyVersion: "customer_report_actions.v1",
  customerSafetyPolicyVersion: "customer_report_safety.v1"
} as const;

export const customerReportHtmlVersions = {
  manifestSchemaVersion: "customer_report_html_manifest.v1",
  rendererVersion: "customer_report_html_renderer.v1",
  stylesheetVersion: "customer_report_stylesheet.v1"
} as const;

export const customerReportEvidenceCutoffGraceDays = 7;

export const customerReportActionQuotas = {
  pageStudio: 15,
  opportunity: 10,
  releaseReview: 15
} as const;

const customerSafeReleaseWarningCatalog = {
  live_route_discovery_check: {
    scope: "domain",
    title: "Eine veröffentlichte Seite konnte nicht vollständig geprüft werden.",
    summary: "Eine erwartete Live-Seite war bei der technischen Prüfung nicht erreichbar."
  },
  sitemap_readiness_check: {
    scope: "sitemap",
    title: "Die Sitemap braucht Prüfung.",
    summary: "Die veröffentlichte Sitemap war nicht vollständig erreichbar oder enthielt nicht alle erwarteten Seiten."
  },
  http_status_check: {
    scope: "domain",
    title: "Eine veröffentlichte Seite war nicht erfolgreich erreichbar.",
    summary: "Mindestens eine geprüfte Seite lieferte keinen erfolgreichen HTTP-Status."
  },
  canonical_trailing_slash_check: {
    scope: "page",
    title: "Eine kanonische Seitenadresse braucht Prüfung.",
    summary: "Mindestens eine Seite verwies nicht auf die erwartete kanonische Adresse."
  },
  indexability_check: {
    scope: "page",
    title: "Eine veröffentlichte Seite war nicht indexierbar.",
    summary: "Mindestens eine Seite enthielt ein Signal, das die Aufnahme in Suchergebnisse verhindern kann."
  },
  schema_parse_check: {
    scope: "page",
    title: "Strukturierte Seitendaten brauchen Prüfung.",
    summary: "Mindestens eine Seite enthielt nicht lesbare strukturierte Daten."
  },
  schema_type_check: {
    scope: "page",
    title: "Strukturierte Seitendaten waren unvollständig.",
    summary: "Mindestens eine Seite enthielt nicht die erwarteten strukturierten Datentypen."
  },
  html_metadata_check: {
    scope: "page",
    title: "Seitentitel oder Beschreibung brauchen Prüfung.",
    summary: "Mindestens eine Seite enthielt nicht alle erwarteten Suchergebnis-Metadaten."
  },
  primary_heading_check: {
    scope: "page",
    title: "Eine Hauptüberschrift braucht Prüfung.",
    summary: "Mindestens eine Seite enthielt nicht die erwartete eindeutige Hauptüberschrift."
  },
  tracking_load_check: {
    scope: "tracking",
    title: "Die Besuchsmessung wurde nicht geladen.",
    summary: "Die freigegebene Besuchsmessung konnte auf mindestens einer Seite nicht geladen werden."
  },
  tracking_runtime_check: {
    scope: "tracking",
    title: "Die Besuchsmessung braucht Prüfung.",
    summary: "Die freigegebene Besuchsmessung meldete bei der technischen Prüfung einen Fehler."
  }
} as const;

export const customerSafeReleaseWarningCheckKeys = Object.keys(customerSafeReleaseWarningCatalog) as Array<
  keyof typeof customerSafeReleaseWarningCatalog
>;

export function customerSafeReleaseWarningForCheck(
  checkKey: string,
  scope: string
): { title: string; summary: string } | undefined {
  const entry = customerSafeReleaseWarningCatalog[checkKey as keyof typeof customerSafeReleaseWarningCatalog];
  return entry?.scope === scope ? { title: entry.title, summary: entry.summary } : undefined;
}

export function customerReportPeriodWindow(period: string): {
  startsAt: Date;
  endsAt: Date;
  cutoffDeadlineAt: Date;
} {
  const match = /^(\d{4})-(\d{2})$/u.exec(period);
  if (!match) throw new TypeError("Customer report period must use YYYY-MM.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new TypeError("Customer report period month is invalid.");
  const startsAt = berlinLocalMidnightUtc(year, month - 1, 1);
  const endsAt = berlinLocalMidnightUtc(year, month, 1);
  return {
    startsAt,
    endsAt,
    cutoffDeadlineAt: new Date(endsAt.getTime() + customerReportEvidenceCutoffGraceDays * 24 * 60 * 60 * 1_000)
  };
}

export function decideCustomerReportGenerationWindow(input: {
  period: string;
  evidenceCutoffAt: string | Date;
  now: Date;
}):
  | { kind: "allow"; startsAt: Date; endsAt: Date; cutoffDeadlineAt: Date }
  | { kind: "deny"; reason: "period_not_complete" | "cutoff_after_grace" | "cutoff_in_future" } {
  const window = customerReportPeriodWindow(input.period);
  const cutoff = input.evidenceCutoffAt instanceof Date ? input.evidenceCutoffAt : new Date(input.evidenceCutoffAt);
  if (cutoff < window.endsAt) return { kind: "deny", reason: "period_not_complete" };
  if (cutoff > window.cutoffDeadlineAt) return { kind: "deny", reason: "cutoff_after_grace" };
  if (cutoff > input.now) return { kind: "deny", reason: "cutoff_in_future" };
  return { kind: "allow", ...window };
}

export type CustomerReportTransitionCommand =
  | "submit_for_review"
  | "request_changes"
  | "publish"
  | "publish_correction_successor";

export type CustomerReportTransitionDecision =
  | {
      kind: "allow";
      nextStatus: CustomerReportStatus;
      requiresHumanActor: boolean;
      requiresExactDigest: boolean;
    }
  | { kind: "deny"; reason: "invalid_lifecycle_transition" };

export type CustomerReportClaimEligibilityIssue =
  | "missing_evidence"
  | "cross_project_evidence"
  | "evidence_cutoff_mismatch"
  | "evidence_kind_mismatch"
  | "evidence_source_identity_mismatch"
  | "evidence_value_mismatch"
  | "proof_tier_too_weak"
  | "stale_ranking_proof"
  | "ranking_milestone_mismatch"
  | "missing_required_evidence_kind";

export type CustomerReportClaimEligibilityDecision =
  | { kind: "eligible"; evidence: CustomerReportEvidenceItem[] }
  | { kind: "ineligible"; issues: CustomerReportClaimEligibilityIssue[] };

export type CustomerReportSnapshotEligibilityDecision =
  | { kind: "eligible" }
  | {
      kind: "ineligible";
      claims: Array<{ claimKey: string; issues: CustomerReportClaimEligibilityIssue[] }>;
    };

export type CustomerReportActionAvailability =
  | { kind: "available"; action: CustomerReportNavigationRef }
  | { kind: "view_only"; reason: "superseded_report" }
  | { kind: "unavailable"; reason: "report_not_published" };

export type CustomerReportArtifactTransitionEvent = "claim_render" | "stage" | "fail" | "expire";
export type CustomerReportArtifactTransitionDecision =
  | { kind: "allow"; to: CustomerReportArtifactStatus }
  | { kind: "deny"; reason: "illegal_artifact_transition" };

export function canonicalizeCustomerReportFactProjection(input: unknown): string {
  const projection = CustomerReportFactProjectionSchema.parse(input);
  return serializeCanonicalJson(normalizeCustomerReportFactProjection(projection));
}

export function canonicalizeCustomerReportSnapshot(input: unknown): string {
  const snapshot = CustomerReportSnapshotSchema.parse(input);
  return serializeCanonicalJson(normalizeCustomerReportSnapshot(snapshot));
}

export function canonicalizeCustomerReportEvidencePacket(input: unknown): string {
  const packet = CustomerReportEvidencePacketSchema.parse(input);
  return serializeCanonicalJson({
    ...packet,
    evidence: [...packet.evidence].sort((left, right) => compareStableText(left.evidenceKey, right.evidenceKey))
  });
}

export function canonicalizeCustomerReportSourcePayload(input: unknown): string {
  return serializeCanonicalJson(input);
}

export function buildCustomerReportHtmlRenderManifest(input: {
  projectId: string;
  reportId: string;
  snapshotSha256: string;
  reportSchemaVersion: string;
  templateVersion: string;
  locale: "de-DE";
  timezone: "Europe/Berlin";
}): CustomerReportHtmlRenderManifest {
  return CustomerReportHtmlRenderManifestSchema.parse({
    schemaVersion: customerReportHtmlVersions.manifestSchemaVersion,
    ...input,
    rendererVersion: customerReportHtmlVersions.rendererVersion,
    stylesheetVersion: customerReportHtmlVersions.stylesheetVersion
  });
}

export function canonicalizeCustomerReportHtmlRenderManifest(input: unknown): string {
  return serializeCanonicalJson(CustomerReportHtmlRenderManifestSchema.parse(input));
}

export function decideCustomerReportArtifactTransition(
  status: CustomerReportArtifactStatus,
  event: CustomerReportArtifactTransitionEvent
): CustomerReportArtifactTransitionDecision {
  if (event === "claim_render" && (status === "pending" || status === "running")) {
    return { kind: "allow", to: "running" };
  }
  if (event === "stage" && status === "running") {
    return { kind: "allow", to: "staged" };
  }
  if (event === "fail" && (status === "pending" || status === "running")) {
    return { kind: "allow", to: "failed" };
  }
  if (event === "expire" && (status === "pending" || status === "running" || status === "staged")) {
    return { kind: "allow", to: "expired" };
  }
  return { kind: "deny", reason: "illegal_artifact_transition" };
}

export function assembleCustomerReportFactProjection(input: unknown): CustomerReportFactProjection {
  const packet = CustomerReportEvidencePacketSchema.parse(input);
  const orderedEvidence = [...packet.evidence].sort((left, right) =>
    compareStableText(left.evidenceKey, right.evidenceKey)
  );
  const claims: CustomerReportClaim[] = [];
  const actionCandidates: CustomerReportNavigationRef[] = [];
  const referencedEvidenceKeys = new Set<string>();
  for (const evidence of orderedEvidence) {
    const claim = claimFromEvidence(evidence, orderedEvidence);
    if (!claim) continue;
    claims.push(claim);
    for (const evidenceKey of claim.evidenceKeys) referencedEvidenceKeys.add(evidenceKey);

    const action = actionFromClaim(claim, evidence);
    if (action) actionCandidates.push(action);
  }

  const nextActions = selectCustomerReportActions(actionCandidates);

  const factProjection = CustomerReportFactProjectionSchema.parse({
    claims,
    evidence: orderedEvidence.filter((evidence) => referencedEvidenceKeys.has(evidence.evidenceKey)),
    nextActions
  });
  return normalizeCustomerReportFactProjection(factProjection);
}

export function buildFactOnlyCustomerReportSnapshot(input: {
  packet: CustomerReportEvidencePacket;
  factProjection: CustomerReportFactProjection;
  factProjectionSha256: string;
  assemblerVersion: string;
  eligibilityPolicyVersion: string;
  actionSelectionPolicyVersion: string;
}): CustomerReportSnapshot {
  const packet = CustomerReportEvidencePacketSchema.parse(input.packet);
  const factProjection = CustomerReportFactProjectionSchema.parse(input.factProjection);
  const factProjectionSha256 = CustomerReportSha256Schema.parse(input.factProjectionSha256);

  return CustomerReportSnapshotSchema.parse({
    schemaVersion: "customer_report_snapshot.v1",
    identity: packet.identity,
    generatedAt: packet.assembledAt,
    evidenceCutoffAt: packet.evidenceCutoffAt,
    assemblerVersion: input.assemblerVersion,
    eligibilityPolicyVersion: input.eligibilityPolicyVersion,
    actionSelectionPolicyVersion: input.actionSelectionPolicyVersion,
    narrativePolicyVersion: "customer_report_narrative.v1",
    templateVersion: "customer_report_template.v1",
    narrativeMode: "fact_only",
    title: `Local SEO Monatsbericht ${packet.identity.period}`,
    factProjectionSha256,
    factProjection,
    narrative: []
  });
}

export function normalizeCustomerReportFactProjection(
  projection: CustomerReportFactProjection
): CustomerReportFactProjection {
  return {
    claims: projection.claims
      .map((claim) => ({ ...claim, evidenceKeys: [...claim.evidenceKeys].sort(compareStableText) }))
      .sort(compareReportClaims),
    evidence: [...projection.evidence].sort((left, right) => compareStableText(left.evidenceKey, right.evidenceKey)),
    nextActions: projection.nextActions
      .map((action) => ({
        ...action,
        supportingClaimKeys: [...action.supportingClaimKeys].sort(compareStableText)
      }))
      .sort((left, right) => compareStableText(left.actionKey, right.actionKey))
  };
}

export function normalizeCustomerReportSnapshot(snapshot: CustomerReportSnapshot): CustomerReportSnapshot {
  return {
    ...snapshot,
    factProjection: normalizeCustomerReportFactProjection(snapshot.factProjection),
    narrative: snapshot.narrative
      .map((fragment) => ({
        ...fragment,
        supportingClaimKeys: [...fragment.supportingClaimKeys].sort(compareStableText)
      }))
      .sort((left, right) => compareStableText(left.slotKey, right.slotKey))
  };
}

export function decideCustomerReportTransition(
  status: CustomerReportStatus,
  command: CustomerReportTransitionCommand
): CustomerReportTransitionDecision {
  if (status === "draft" && command === "submit_for_review") {
    return { kind: "allow", nextStatus: "ready_for_review", requiresHumanActor: true, requiresExactDigest: true };
  }

  if (status === "ready_for_review" && command === "request_changes") {
    return { kind: "allow", nextStatus: "draft", requiresHumanActor: true, requiresExactDigest: true };
  }

  if (status === "ready_for_review" && command === "publish") {
    return { kind: "allow", nextStatus: "published", requiresHumanActor: true, requiresExactDigest: true };
  }

  if (status === "published" && command === "publish_correction_successor") {
    return { kind: "allow", nextStatus: "superseded", requiresHumanActor: true, requiresExactDigest: true };
  }

  return { kind: "deny", reason: "invalid_lifecycle_transition" };
}

export function decideCustomerReportClaimEligibility(input: {
  claim: CustomerReportClaim;
  evidence: CustomerReportEvidenceItem[];
  projectId: string;
  evidenceCutoffAt: string;
  rankingProofMaxAgeDays?: number;
}): CustomerReportClaimEligibilityDecision {
  const evidenceByKey = new Map(input.evidence.map((item) => [item.evidenceKey, item]));
  const selectedEvidence = input.claim.evidenceKeys.flatMap((key) => {
    const item = evidenceByKey.get(key);
    return item ? [item] : [];
  });
  const issues = new Set<CustomerReportClaimEligibilityIssue>();
  const cutoff = Date.parse(input.evidenceCutoffAt);

  if (selectedEvidence.length !== input.claim.evidenceKeys.length) {
    issues.add("missing_evidence");
  }

  for (const evidence of selectedEvidence) {
    if (evidence.projectId !== input.projectId) {
      issues.add("cross_project_evidence");
    }

    if (
      Date.parse(evidence.observedAt) > cutoff ||
      Date.parse(evidenceEffectiveAt(evidence)) > cutoff ||
      Date.parse(evidence.selectedAtCutoff) !== cutoff
    ) {
      issues.add("evidence_cutoff_mismatch");
    }

    if (!evidenceKindMatchesClaim(input.claim, evidence)) {
      issues.add("evidence_kind_mismatch");
      continue;
    }

    if (!evidenceSourceIdentityMatches(evidence)) {
      issues.add("evidence_source_identity_mismatch");
    }

    if (!evidenceValueMatchesClaim(input.claim, evidence)) {
      issues.add("evidence_value_mismatch");
    }

    const requiredProofTier = input.claim.kind === "future_opportunity" ? "supporting_context" : "customer_safe_proof";
    if (evidence.proofTier !== requiredProofTier) {
      issues.add("proof_tier_too_weak");
    }

    if (evidence.sourceKind === "ranking_proof") {
      const maxAgeDays = input.rankingProofMaxAgeDays ?? customerReportRankingProofMaxAgeDays;
      const ageMs = cutoff - Date.parse(evidence.observedAt);
      if (ageMs < 0 || ageMs > maxAgeDays * 24 * 60 * 60 * 1_000) {
        issues.add("stale_ranking_proof");
      }
    }
  }

  if (input.claim.kind === "ranking_result" && rankingMilestoneForRank(input.claim.rank) !== input.claim.milestone) {
    issues.add("ranking_milestone_mismatch");
  }

  if (input.claim.kind === "rollback_correction") {
    const selectedKinds = new Set(selectedEvidence.map((evidence) => evidence.sourceKind));
    if (!selectedKinds.has("rollback") || !selectedKinds.has("release_verification")) {
      issues.add("missing_required_evidence_kind");
    }
    const releasePlanIds = new Set(
      selectedEvidence.flatMap((evidence) => ("releasePlanId" in evidence ? [evidence.releasePlanId] : []))
    );
    if (releasePlanIds.size > 1) issues.add("evidence_value_mismatch");
  }

  return issues.size > 0
    ? { kind: "ineligible", issues: [...issues].sort() }
    : { kind: "eligible", evidence: selectedEvidence };
}

export function decideCustomerReportSnapshotEligibility(
  snapshot: CustomerReportSnapshot
): CustomerReportSnapshotEligibilityDecision {
  const claims = snapshot.factProjection.claims.flatMap((claim) => {
    const decision = decideCustomerReportClaimEligibility({
      claim,
      evidence: snapshot.factProjection.evidence,
      projectId: snapshot.identity.projectId,
      evidenceCutoffAt: snapshot.evidenceCutoffAt
    });

    return decision.kind === "eligible" ? [] : [{ claimKey: claim.claimKey, issues: decision.issues }];
  });

  return claims.length === 0 ? { kind: "eligible" } : { kind: "ineligible", claims };
}

export function decideCustomerReportActionAvailability(
  reportStatus: CustomerReportStatus,
  action: CustomerReportNavigationRef
): CustomerReportActionAvailability {
  if (reportStatus === "published") {
    return { kind: "available", action };
  }

  if (reportStatus === "superseded") {
    return { kind: "view_only", reason: "superseded_report" };
  }

  return { kind: "unavailable", reason: "report_not_published" };
}

export function rankingMilestoneForRank(
  rank: number
): Extract<CustomerReportClaim, { kind: "ranking_result" }>["milestone"] | undefined {
  if (!Number.isSafeInteger(rank) || rank < 1 || rank > 10) {
    return undefined;
  }
  if (rank === 1) return "rank_1";
  if (rank === 2) return "rank_2";
  if (rank === 3) return "top_3";
  if (rank <= 5) return "top_5";
  return "top_10";
}

export function summarizeCustomerReportClaims(claims: CustomerReportClaim[]): {
  provenRankingResultCount: number;
  futureOpportunityCount: number;
} {
  return {
    provenRankingResultCount: claims.filter((claim) => claim.kind === "ranking_result").length,
    futureOpportunityCount: claims.filter((claim) => claim.kind === "future_opportunity").length
  };
}

function claimFromEvidence(
  evidence: CustomerReportEvidenceItem,
  allEvidence: CustomerReportEvidenceItem[]
): CustomerReportClaim | undefined {
  switch (evidence.sourceKind) {
    case "ranking_proof":
      return {
        claimKey: `ranking:${evidence.sourceId}`,
        kind: "ranking_result",
        section: "ranking_results",
        evidenceKeys: [evidence.evidenceKey],
        query: evidence.query,
        pageUrl: evidence.pageUrl,
        rank: evidence.rank,
        milestone: rankingMilestoneForRank(evidence.rank)!
      };
    case "page_version":
      return {
        claimKey: `page:${evidence.pageVersionId}`,
        kind: "page_delivery",
        section: "page_delivery",
        evidenceKeys: [evidence.evidenceKey],
        pageVersionId: evidence.pageVersionId,
        route: evidence.route,
        versionNumber: evidence.versionNumber,
        deliveryState: ["released", "superseded"].includes(evidence.status) ? "released_content" : "approved_content"
      };
    case "deployment":
      if (evidence.status === "rolled_back") return undefined;
      return {
        claimKey: `handoff:${evidence.deploymentId}`,
        kind: "provider_handoff",
        section: "page_delivery",
        evidenceKeys: [evidence.evidenceKey],
        deploymentId: evidence.deploymentId,
        provider: evidence.provider,
        handedOffAt: evidence.handedOffAt
      };
    case "release_verification":
      return {
        claimKey: `health:${evidence.verificationId}`,
        kind: "live_health",
        section: "live_health",
        evidenceKeys: [evidence.evidenceKey],
        verificationId: evidence.verificationId,
        deploymentId: evidence.deploymentId,
        health: evidence.status,
        checkedAt: evidence.checkedAt
      };
    case "release_verification_check":
      return {
        claimKey: `warning:${evidence.sourceId}`,
        kind: "release_warning",
        section: "warnings",
        evidenceKeys: [evidence.evidenceKey],
        verificationId: evidence.verificationId,
        checkKey: evidence.checkKey,
        title: evidence.customerLabel,
        summary: evidence.summary
      };
    case "rollback": {
      const verification = allEvidence
        .filter(
          (candidate): candidate is Extract<CustomerReportEvidenceItem, { sourceKind: "release_verification" }> =>
            candidate.sourceKind === "release_verification" &&
            candidate.deploymentId === evidence.deploymentId &&
            Date.parse(candidate.checkedAt) > Date.parse(evidence.rolledBackAt)
        )
        .sort((left, right) => Date.parse(left.checkedAt) - Date.parse(right.checkedAt))[0];
      if (!verification) return undefined;
      return {
        claimKey: `rollback:${evidence.rollbackPointId}`,
        kind: "rollback_correction",
        section: "rollback_corrections",
        evidenceKeys: [evidence.evidenceKey, verification.evidenceKey],
        rollbackPointId: evidence.rollbackPointId,
        deploymentId: evidence.deploymentId,
        verificationId: verification.verificationId,
        outcome: "rolled_back_with_live_verification",
        occurredAt: evidence.rolledBackAt,
        verifiedAt: verification.checkedAt
      };
    }
    case "opportunity":
      return {
        claimKey: `opportunity:${evidence.opportunityId}`,
        kind: "future_opportunity",
        section: "future_opportunities",
        evidenceKeys: [evidence.evidenceKey],
        opportunityId: evidence.opportunityId,
        title: evidence.title,
        recommendedAction: opportunityRecommendedAction(evidence.status)
      };
  }
}

function actionFromClaim(
  claim: CustomerReportClaim,
  evidence: CustomerReportEvidenceItem
): CustomerReportNavigationRef | undefined {
  if (claim.kind === "page_delivery") {
    return {
      actionKey: `review-page:${claim.pageVersionId}`,
      kind: "navigation_ref",
      label: "Seite im Page Studio prüfen",
      supportingClaimKeys: [claim.claimKey],
      target: { surface: "page_studio_review", pageVersionId: claim.pageVersionId }
    };
  }

  if (claim.kind === "future_opportunity") {
    return {
      actionKey: `open-opportunity:${claim.opportunityId}`,
      kind: "navigation_ref",
      label: "Chance prüfen",
      supportingClaimKeys: [claim.claimKey],
      target: { surface: "opportunity", opportunityId: claim.opportunityId }
    };
  }

  const releasePlanId =
    (claim.kind === "provider_handoff" && evidence.sourceKind === "deployment") ||
    (claim.kind === "live_health" && evidence.sourceKind === "release_verification") ||
    (claim.kind === "release_warning" && evidence.sourceKind === "release_verification_check") ||
    (claim.kind === "rollback_correction" && evidence.sourceKind === "rollback")
      ? evidence.releasePlanId
      : undefined;
  if (!releasePlanId) return undefined;

  return {
    actionKey: `review-release:${claim.claimKey}`,
    kind: "navigation_ref",
    label: "Release prüfen",
    supportingClaimKeys: [claim.claimKey],
    target: { surface: "release_review", releasePlanId }
  };
}

function selectCustomerReportActions(actions: CustomerReportNavigationRef[]): CustomerReportNavigationRef[] {
  const ordered = [...actions].sort((left, right) => compareStableText(left.actionKey, right.actionKey));
  return [
    ...ordered
      .filter((action) => action.target.surface === "page_studio_review")
      .slice(0, customerReportActionQuotas.pageStudio),
    ...ordered
      .filter((action) => action.target.surface === "opportunity")
      .slice(0, customerReportActionQuotas.opportunity),
    ...ordered
      .filter((action) => action.target.surface === "release_review")
      .slice(0, customerReportActionQuotas.releaseReview)
  ].sort((left, right) => compareStableText(left.actionKey, right.actionKey));
}

function berlinLocalMidnightUtc(year: number, zeroBasedMonth: number, day: number): Date {
  const candidate = new Date(Date.UTC(year, zeroBasedMonth, day));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(candidate);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const observedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return new Date(candidate.getTime() - (observedAsUtc - candidate.getTime()));
}

function opportunityRecommendedAction(
  status: Extract<CustomerReportEvidenceItem, { sourceKind: "opportunity" }>["status"]
): Extract<CustomerReportClaim, { kind: "future_opportunity" }>["recommendedAction"] {
  if (status === "held") return "hold";
  if (status === "monitoring") return "monitor";
  if (status === "brief_created") return "create_page_proposal";
  return "create_brief";
}

function compareReportClaims(left: CustomerReportClaim, right: CustomerReportClaim): number {
  return (
    reportSectionOrder[left.section] - reportSectionOrder[right.section] ||
    compareStableText(left.claimKey, right.claimKey)
  );
}

function compareStableText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function serializeCanonicalJson(value: unknown): string {
  const result = canonicalize(value);
  if (result === undefined) {
    throw new TypeError("Customer report canonicalization produced no JSON value.");
  }
  return result;
}

function evidenceKindMatchesClaim(claim: CustomerReportClaim, evidence: CustomerReportEvidenceItem): boolean {
  if (claim.kind === "rollback_correction") {
    return evidence.sourceKind === "rollback" || evidence.sourceKind === "release_verification";
  }

  const expectedKindByClaim = {
    ranking_result: "ranking_proof",
    page_delivery: "page_version",
    provider_handoff: "deployment",
    live_health: "release_verification",
    release_warning: "release_verification_check",
    future_opportunity: "opportunity"
  } as const satisfies Record<
    Exclude<CustomerReportClaim["kind"], "rollback_correction">,
    CustomerReportEvidenceItem["sourceKind"]
  >;

  return evidence.sourceKind === expectedKindByClaim[claim.kind];
}

function evidenceValueMatchesClaim(claim: CustomerReportClaim, evidence: CustomerReportEvidenceItem): boolean {
  switch (claim.kind) {
    case "ranking_result":
      return (
        evidence.sourceKind === "ranking_proof" &&
        evidence.query === claim.query &&
        evidence.pageUrl === claim.pageUrl &&
        evidence.rank === claim.rank
      );
    case "page_delivery":
      return (
        evidence.sourceKind === "page_version" &&
        evidence.pageVersionId === claim.pageVersionId &&
        evidence.route === claim.route &&
        evidence.versionNumber === claim.versionNumber &&
        (claim.deliveryState === "approved_content"
          ? ["approved", "release_candidate"].includes(evidence.status)
          : ["released", "superseded"].includes(evidence.status))
      );
    case "provider_handoff":
      return (
        evidence.sourceKind === "deployment" &&
        evidence.deploymentId === claim.deploymentId &&
        evidence.provider === claim.provider &&
        evidence.handedOffAt === claim.handedOffAt
      );
    case "live_health":
      return (
        evidence.sourceKind === "release_verification" &&
        evidence.verificationId === claim.verificationId &&
        evidence.deploymentId === claim.deploymentId &&
        evidence.status === claim.health &&
        evidence.checkedAt === claim.checkedAt
      );
    case "release_warning":
      return (
        evidence.sourceKind === "release_verification_check" &&
        evidence.verificationId === claim.verificationId &&
        evidence.checkKey === claim.checkKey &&
        evidence.customerLabel === claim.title &&
        evidence.summary === claim.summary
      );
    case "rollback_correction":
      if (evidence.sourceKind === "rollback") {
        return (
          evidence.rollbackPointId === claim.rollbackPointId &&
          evidence.deploymentId === claim.deploymentId &&
          evidence.rolledBackAt === claim.occurredAt &&
          claim.outcome === "rolled_back_with_live_verification"
        );
      }
      return (
        evidence.sourceKind === "release_verification" &&
        evidence.verificationId === claim.verificationId &&
        evidence.deploymentId === claim.deploymentId &&
        evidence.checkedAt === claim.verifiedAt
      );
    case "future_opportunity":
      return (
        evidence.sourceKind === "opportunity" &&
        evidence.opportunityId === claim.opportunityId &&
        evidence.title === claim.title &&
        opportunityRecommendedAction(evidence.status) === claim.recommendedAction
      );
  }
}

function evidenceEffectiveAt(evidence: CustomerReportEvidenceItem): string {
  switch (evidence.sourceKind) {
    case "page_version":
      return evidence.approvedAt;
    case "deployment":
      return evidence.handedOffAt;
    case "release_verification":
    case "release_verification_check":
      return evidence.checkedAt;
    case "rollback":
      return evidence.rolledBackAt;
    case "ranking_proof":
    case "opportunity":
      return evidence.observedAt;
  }
}

function evidenceSourceIdentityMatches(evidence: CustomerReportEvidenceItem): boolean {
  switch (evidence.sourceKind) {
    case "ranking_proof":
      return true;
    case "page_version":
      return evidence.sourceId === evidence.pageVersionId;
    case "deployment":
      return evidence.sourceId === evidence.deploymentId;
    case "release_verification":
      return evidence.sourceId === evidence.verificationId;
    case "release_verification_check":
      return true;
    case "rollback":
      return evidence.sourceId === evidence.rollbackPointId;
    case "opportunity":
      return evidence.sourceId === evidence.opportunityId;
  }
}
