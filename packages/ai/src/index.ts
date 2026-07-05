import type {
  EvidenceProofTier,
  EvidenceRef,
  EvidenceSourceType,
  OpportunityBrief,
  OpportunityGroupHint,
  OpportunityScoutOutput
} from "@localseo/contracts";

export const mastraAgents = [
  "ResearchAgent",
  "SeoStrategyAgent",
  "ContentAgent",
  "TemplateLayoutAgent",
  "SeoAnalystAgent",
  "ReportAgent",
  "DeploymentAgent"
] as const;

export const mastraWorkflows = [
  "preAuditWorkflow",
  "websiteImportWorkflow",
  "localSeoAnalysisWorkflow",
  "pageGenerationWorkflow",
  "releasePreflightWorkflow",
  "postDeployVerificationWorkflow",
  "reportGenerationWorkflow"
] as const;

export type MastraAgentName = (typeof mastraAgents)[number];
export type MastraWorkflowName = (typeof mastraWorkflows)[number];

export type AgentDescriptor = {
  name: MastraAgentName;
  responsibility: string;
  canMutateProduction: false;
};

export const agentDescriptors: AgentDescriptor[] = [
  {
    name: "ResearchAgent",
    responsibility: "Find SERP, competitor, and industry patterns.",
    canMutateProduction: false
  },
  {
    name: "SeoStrategyAgent",
    responsibility: "Score areas, services, keywords, and competition.",
    canMutateProduction: false
  },
  {
    name: "ContentAgent",
    responsibility: "Draft local text, FAQs, meta titles, and CTAs.",
    canMutateProduction: false
  },
  {
    name: "TemplateLayoutAgent",
    responsibility: "Recommend components and layout variants.",
    canMutateProduction: false
  },
  {
    name: "SeoAnalystAgent",
    responsibility: "Explain data, write observations, and propose next actions.",
    canMutateProduction: false
  },
  {
    name: "ReportAgent",
    responsibility: "Draft customer-safe reports and decision cards.",
    canMutateProduction: false
  },
  {
    name: "DeploymentAgent",
    responsibility: "Evaluate release readiness, blockers, risk, and release notes.",
    canMutateProduction: false
  }
];

export type OpportunityScoutQaGateId =
  | "brief_cap"
  | "project_scope"
  | "evidence_resolution"
  | "proof_tier_containment"
  | "proof_gate"
  | "competitor_containment"
  | "uniqueness_gate"
  | "cannibalization_gate"
  | "dedupe_gate";

export type OpportunityScoutQaFailure = {
  code: "qa_rejected";
  gateId: OpportunityScoutQaGateId;
  message: string;
  briefIndex?: number;
};

export type ScoredOpportunityBrief = OpportunityBrief & {
  score: number;
};

export type EvaluatedOpportunityScoutOutput = {
  briefs: ScoredOpportunityBrief[];
  groups: OpportunityGroupHint[];
  runNotes?: string;
};

export type OpportunityScoutQaResult =
  | {
      ok: true;
      output: EvaluatedOpportunityScoutOutput;
    }
  | {
      ok: false;
      failure: OpportunityScoutQaFailure;
    };

export type ResolvableEvidenceRef = {
  sourceType: EvidenceSourceType;
  sourceId: string;
  rank?: number;
  query?: string;
  pageUrl?: string;
};

export type EvaluateOpportunityScoutInput = {
  projectId: string;
  output: OpportunityScoutOutput;
  resolvableEvidence: readonly ResolvableEvidenceRef[];
  existingRoutes?: readonly string[];
  existingOpportunityKeys?: readonly string[];
  maxBriefs?: number;
};

export type OpportunityScoutEvidencePacket = {
  projectId: string;
  generatedAt: string;
  maxBriefs: number;
  websiteImport?: Record<string, unknown>;
  gsc: {
    rows: Record<string, unknown>[];
    signals: Record<string, unknown>[];
  };
  tracking: {
    recentEvents: Record<string, unknown>[];
  };
  rankingProofs: Record<string, unknown>[];
  serpSnapshots: Record<string, unknown>[];
  technicalAuditFindings: Record<string, unknown>[];
  existingRoutes: string[];
  existingOpportunityKeys: string[];
};

export const opportunityScoutEvidencePacketLimits = {
  gscRows: 50,
  gscSignals: 50,
  trackingEvents: 50,
  rankingProofs: 50,
  serpSnapshots: 20,
  technicalAuditFindings: 40,
  existingRoutes: 100,
  existingOpportunityKeys: 100,
  serializedBytes: 120_000
} as const;

export type OpportunityScoutPromptSection = {
  key:
    | "role"
    | "evidence_and_proof"
    | "classification"
    | "nearby_orte_corridors"
    | "competitor_containment"
    | "german_local_examples"
    | "output_format";
  title: string;
  lines: readonly string[];
};

export const opportunityScoutPromptSections: readonly OpportunityScoutPromptSection[] = [
  {
    key: "role",
    title: "Role And Boundary",
    lines: [
      "You are the Local SEO Opportunity Scout for an operator-facing mission control.",
      "AI scouts and proposes; contracts, deterministic QA, and humans decide what becomes product state.",
      "You never approve, deploy, roll back, mutate providers, publish sitemap changes, or claim guaranteed results."
    ]
  },
  {
    key: "evidence_and_proof",
    title: "Evidence And Proof Rules",
    lines: [
      "Use only EvidenceRef objects from the input packet; do not invent sourceId values or proof.",
      "GSC rows and GSC signals are internal radar only, never customer-safe proof.",
      "Customer-safe proven_win requires a brief-level ranking_proof EvidenceRef with a Top 10 rank.",
      "SERP snapshots, browser captures, model search, GSC, tracking, and audits are supporting context only for MVP.",
      "Use serp_snapshot evidence only as supporting_context; cite locator.query, locator.pageUrl, and observed rank when it explains market visibility.",
      "Use technical_audit evidence for crawl/indexability/schema/internal-link problems on existing pages; it is never ranking proof.",
      "The observed rank, query, and pageUrl in a ranking_proof EvidenceRef must match the cited proof row."
    ]
  },
  {
    key: "classification",
    title: "Classification And Recommended Action",
    lines: [
      "Use proven_win only for customer-report-safe ranking facts, and recommend monitor only.",
      "Use near_term_target for page or brief candidates with service fit, local intent, and supporting evidence.",
      "Use internal_radar for weak GSC or tracking signals that need more proof.",
      "Technical audit findings alone may justify improving existing pages, monitor, or internal_radar; combine them with demand evidence before recommending create actions.",
      "Use rejected only when the opportunity should not be pursued now; explain the rejectionReason.",
      "recommendedAction is a recommendation, not a lifecycle decision."
    ]
  },
  {
    key: "nearby_orte_corridors",
    title: "Nearby Orte And Corridors",
    lines: [
      "Scout nearby Orte, districts, municipalities, and service-area corridors around existing clusters.",
      "Do not create random city pages; every place needs service fit, buyer intent, unique local reason, and cannibalization awareness.",
      "Use corridorCluster and mapGroupKey when places belong together, for example Dachau -> Karlsfeld -> Hebertshausen."
    ]
  },
  {
    key: "competitor_containment",
    title: "Competitor Containment",
    lines: [
      "Competitor evidence is strategy context only; never copy competitor text, headings, layout, or claims.",
      "Summarize gaps and weaknesses in your own words and keep competitor observations short."
    ]
  },
  {
    key: "german_local_examples",
    title: "German Local SEO Calibration",
    lines: [
      "Write keywords, locations, and rationales in German when the evidence is German.",
      "Canonical near-term example: Entruempelung Dachau from weak GSC impressions on a generic /entruempelung/ page.",
      "Canonical proven-win example: Dachdecker Markt Indersdorf only when a ranking_proof row shows Top 10 visibility.",
      "Nearby corridor examples: Petershausen/Allershausen/Reichertshausen, Dachau/Karlsfeld/Hebertshausen, Erdweg/Schwabhausen/Bergkirchen."
    ]
  },
  {
    key: "output_format",
    title: "Output Format",
    lines: [
      "Return only JSON matching OpportunityScoutOutput.",
      "Return at most the maxBriefs value from the input packet.",
      'If the packet has no useful evidence, return {"briefs":[],"groups":[]}.'
    ]
  }
];

export function buildOpportunityScoutPrompt(): string {
  return opportunityScoutPromptSections
    .map((section) => [`## ${section.title}`, ...section.lines].join("\n"))
    .join("\n\n");
}

export function buildOpportunityScoutEvidencePacket(
  input: OpportunityScoutEvidencePacket
): OpportunityScoutEvidencePacket {
  return {
    ...input,
    websiteImport: input.websiteImport
      ? {
          ...input.websiteImport,
          discoveredRoutes: capStringArray(
            input.websiteImport.discoveredRoutes,
            opportunityScoutEvidencePacketLimits.existingRoutes
          )
        }
      : undefined,
    gsc: {
      rows: sortRecords(input.gsc.rows, ["sourceId", "query", "pageUrl"]),
      signals: sortRecords(input.gsc.signals, ["sourceId", "query", "pageUrl", "signalType"])
    },
    tracking: {
      recentEvents: sortRecords(input.tracking.recentEvents, ["occurredAt", "eventName", "route"])
    },
    rankingProofs: sortRecords(input.rankingProofs, ["sourceId", "query", "pageUrl", "capturedAt"]),
    serpSnapshots: sortRecords(input.serpSnapshots, ["sourceId", "query", "capturedAt"]),
    technicalAuditFindings: sortRecords(input.technicalAuditFindings, ["severity", "sourceId", "route", "checkKey"]),
    existingRoutes: [...input.existingRoutes].sort().slice(0, opportunityScoutEvidencePacketLimits.existingRoutes),
    existingOpportunityKeys: [...input.existingOpportunityKeys]
      .sort()
      .slice(0, opportunityScoutEvidencePacketLimits.existingOpportunityKeys)
  };
}

function capStringArray(value: unknown, limit: number): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.filter((item): item is string => typeof item === "string").slice(0, limit);
}

const customerSafeProofSources = new Set<EvidenceSourceType>(["ranking_proof"]);

export function evaluateOpportunityScoutOutput(input: EvaluateOpportunityScoutInput): OpportunityScoutQaResult {
  const maxBriefs = input.maxBriefs ?? 12;

  if (input.output.briefs.length > maxBriefs) {
    return fail("brief_cap", `Opportunity scout returned ${input.output.briefs.length} briefs; max is ${maxBriefs}.`);
  }

  const resolvableEvidenceKeys = new Set(
    input.resolvableEvidence.map((evidence) => evidenceResolutionKey(evidence.sourceType, evidence.sourceId))
  );

  for (const [briefIndex, brief] of input.output.briefs.entries()) {
    if (brief.projectId !== input.projectId) {
      return fail("project_scope", "Opportunity brief projectId does not match the agent run project.", briefIndex);
    }

    const evidenceRefs = collectEvidenceRefs(brief, input.output.groups);

    const evidenceFailure = validateEvidenceResolution(evidenceRefs, resolvableEvidenceKeys);
    if (evidenceFailure) {
      return fail("evidence_resolution", evidenceFailure, briefIndex);
    }

    const proofTierFailure = validateProofTierContainment(evidenceRefs);
    if (proofTierFailure) {
      return fail("proof_tier_containment", proofTierFailure, briefIndex);
    }

    const proofFailure = validateProofGate(brief, input.resolvableEvidence);
    if (proofFailure) {
      return fail("proof_gate", proofFailure, briefIndex);
    }

    const competitorFailure = validateCompetitorContainment(brief, evidenceRefs);
    if (competitorFailure) {
      return fail("competitor_containment", competitorFailure, briefIndex);
    }

    const uniquenessFailure = validateUniquenessGate(brief);
    if (uniquenessFailure) {
      return fail("uniqueness_gate", uniquenessFailure, briefIndex);
    }

    const cannibalizationFailure = validateCannibalizationGate(brief, input.existingRoutes ?? []);
    if (cannibalizationFailure) {
      return fail("cannibalization_gate", cannibalizationFailure, briefIndex);
    }
  }

  const dedupeFailure = validateDedupeGate(input.output.briefs, input.existingOpportunityKeys ?? []);
  if (dedupeFailure) {
    return fail("dedupe_gate", dedupeFailure);
  }

  return {
    ok: true,
    output: {
      briefs: input.output.briefs.map((brief) => ({
        ...brief,
        score: scoreOpportunityBrief(brief)
      })),
      groups: input.output.groups,
      runNotes: input.output.runNotes
    }
  };
}

export function scoreOpportunityBrief(brief: OpportunityBrief): number {
  const classificationBase = {
    proven_win: 75,
    near_term_target: 55,
    internal_radar: 25,
    rejected: 0
  } satisfies Record<OpportunityBrief["classification"], number>;

  const proofTierBonus = Math.max(0, ...brief.evidence.map((evidence) => proofTierScore(evidence.proofTier)));
  const strengthBonus = Math.max(0, ...brief.evidence.map((evidence) => evidenceStrengthScore(evidence.strength)));
  const clusterBonus = clusterStrengthScore(
    brief.corridorCluster?.clusterStrength ?? brief.location.existingClusterStrength
  );
  const cannibalizationPenalty = cannibalizationPenaltyScore(brief.cannibalizationRisk.level);

  return clampScore(
    classificationBase[brief.classification] + proofTierBonus + strengthBonus + clusterBonus - cannibalizationPenalty
  );
}

export function isCustomerVisibleEvidence(evidence: EvidenceRef): boolean {
  return evidence.proofTier === "customer_safe_proof" && customerSafeProofSources.has(evidence.sourceType);
}

export function opportunityBriefKey(brief: Pick<OpportunityBrief, "service" | "location">): string {
  return normalizeOpportunityKey(brief.service, brief.location.name);
}

function validateEvidenceResolution(
  evidenceRefs: readonly EvidenceRef[],
  resolvableEvidenceKeys: ReadonlySet<string>
): string | undefined {
  for (const evidence of evidenceRefs) {
    if (evidence.sourceId) {
      const key = evidenceResolutionKey(evidence.sourceType, evidence.sourceId);
      if (!resolvableEvidenceKeys.has(key)) {
        return `EvidenceRef ${key} does not resolve to a project-owned row.`;
      }
      continue;
    }

    if (evidence.proofTier !== "internal_signal") {
      return `EvidenceRef with proofTier ${evidence.proofTier} is missing sourceId.`;
    }
  }

  return undefined;
}

function validateProofGate(
  brief: OpportunityBrief,
  resolvableEvidence: readonly ResolvableEvidenceRef[]
): string | undefined {
  if (brief.classification !== "proven_win") {
    return undefined;
  }

  if (brief.recommendedAction !== "monitor") {
    return "proven_win briefs are report/monitoring facts and cannot request page creation.";
  }

  const rankingProof = brief.evidence.find(isCustomerSafeRankingProof);

  if (!rankingProof) {
    return "proven_win requires customer-safe ranking proof with an explicit Top 10 rank.";
  }

  const attributionFailure = validateRankingProofAttribution(rankingProof, resolvableEvidence);
  if (attributionFailure) {
    return attributionFailure;
  }

  return undefined;
}

function validateRankingProofAttribution(
  evidence: EvidenceRef,
  resolvableEvidence: readonly ResolvableEvidenceRef[]
): string | undefined {
  const sourceId = evidence.sourceId;
  if (!sourceId) {
    return "proven_win ranking proof requires a sourceId.";
  }

  const resolved = resolvableEvidence.find(
    (candidate) => candidate.sourceType === evidence.sourceType && candidate.sourceId === sourceId
  );

  if (!resolved) {
    return "proven_win ranking proof does not resolve to project-owned proof evidence.";
  }

  const claimedRank = rankFromEvidence(evidence);
  if (customerSafeProofSources.has(evidence.sourceType) && typeof resolved.rank !== "number") {
    return "proven_win ranking proof requires row-backed rank evidence.";
  }

  if (typeof resolved.rank === "number" && claimedRank !== resolved.rank) {
    return "proven_win ranking proof rank must match the cited proof row.";
  }

  if (typeof resolved.rank === "number" && (resolved.rank < 1 || resolved.rank > 10)) {
    return "proven_win requires a cited proof row with an explicit Top 10 rank.";
  }

  if (resolved.query && normalizeKey(evidence.locator?.query ?? "") !== normalizeKey(resolved.query)) {
    return "proven_win ranking proof query must match the cited proof row.";
  }

  if (resolved.pageUrl && normalizeUrl(evidence.locator?.pageUrl) !== normalizeUrl(resolved.pageUrl)) {
    return "proven_win ranking proof pageUrl must match the cited proof row.";
  }

  return undefined;
}

function validateProofTierContainment(evidenceRefs: readonly EvidenceRef[]): string | undefined {
  const unsupportedCustomerSafeProof = evidenceRefs.find(
    (evidence) => evidence.proofTier === "customer_safe_proof" && !customerSafeProofSources.has(evidence.sourceType)
  );

  if (unsupportedCustomerSafeProof) {
    return `${unsupportedCustomerSafeProof.sourceType} cannot be customer_safe_proof; only ranking_proof is customer-safe proof for MVP.`;
  }

  return undefined;
}

function validateCompetitorContainment(
  brief: OpportunityBrief,
  evidenceRefs: readonly EvidenceRef[]
): string | undefined {
  const renderedBriefText = normalizeCopyText(
    [
      brief.primaryKeyword,
      ...brief.secondaryKeywords,
      brief.uniquenessRationale ?? "",
      ...brief.competitorObservations.map((observation) => `${observation.observation} ${observation.gap ?? ""}`)
    ].join(" ")
  );

  for (const evidence of evidenceRefs) {
    if (evidence.sourceType !== "competitor_snapshot" || !evidence.excerpt) {
      continue;
    }

    const copiedExcerpt = normalizeCopyText(evidence.excerpt);
    if (copiedExcerpt.length >= 80 && renderedBriefText.includes(copiedExcerpt)) {
      return "Competitor evidence excerpt appears verbatim in generated opportunity text.";
    }
  }

  return undefined;
}

function validateUniquenessGate(brief: OpportunityBrief): string | undefined {
  if (brief.recommendedAction !== "create_brief" && brief.recommendedAction !== "create_page_proposal") {
    return undefined;
  }

  if (!brief.uniquenessRationale || !brief.hubSpokeRole) {
    return "create_brief/create_page_proposal requires uniquenessRationale and hubSpokeRole.";
  }

  return undefined;
}

function validateCannibalizationGate(brief: OpportunityBrief, existingRoutes: readonly string[]): string | undefined {
  if (brief.recommendedAction !== "create_page_proposal") {
    return undefined;
  }

  if (brief.cannibalizationRisk.level === "high") {
    return "create_page_proposal is blocked by high cannibalization risk.";
  }

  if (brief.suggestedRoute && new Set(existingRoutes.map(normalizeRoute)).has(normalizeRoute(brief.suggestedRoute))) {
    return `suggestedRoute ${brief.suggestedRoute} collides with an existing route.`;
  }

  return undefined;
}

function validateDedupeGate(
  briefs: readonly OpportunityBrief[],
  existingOpportunityKeys: readonly string[]
): string | undefined {
  const keys = new Set(existingOpportunityKeys.map(normalizeKey));

  for (const brief of briefs) {
    const key = opportunityBriefKey(brief);
    if (keys.has(key)) {
      return `Duplicate opportunity for ${brief.service} in ${brief.location.name}.`;
    }
    keys.add(key);
  }

  return undefined;
}

function isCustomerSafeRankingProof(evidence: EvidenceRef): boolean {
  if (evidence.proofTier !== "customer_safe_proof" || !customerSafeProofSources.has(evidence.sourceType)) {
    return false;
  }

  const metricName = evidence.observedMetric?.name.toLowerCase();
  const metricValue = evidence.observedMetric?.value;

  if (!metricName || typeof metricValue !== "number") {
    return false;
  }

  if (!["rank", "serp_rank", "position", "organic_position"].includes(metricName)) {
    return false;
  }

  return metricValue >= 1 && metricValue <= 10;
}

function rankFromEvidence(evidence: EvidenceRef): number | undefined {
  const metricName = evidence.observedMetric?.name.toLowerCase();
  const metricValue = evidence.observedMetric?.value;

  if (!metricName || typeof metricValue !== "number") {
    return undefined;
  }

  if (!["rank", "serp_rank", "position", "organic_position"].includes(metricName)) {
    return undefined;
  }

  return metricValue;
}

function collectEvidenceRefs(brief: OpportunityBrief, outputGroups: readonly OpportunityGroupHint[]): EvidenceRef[] {
  return [
    ...brief.evidence,
    ...brief.location.evidence,
    ...brief.groupHints.flatMap((group) => group.evidence),
    ...outputGroups.flatMap((group) => group.evidence)
  ];
}

function evidenceResolutionKey(sourceType: EvidenceSourceType, sourceId: string): string {
  return `${sourceType}:${sourceId}`;
}

function proofTierScore(proofTier: EvidenceProofTier): number {
  if (proofTier === "customer_safe_proof") {
    return 20;
  }
  if (proofTier === "supporting_context") {
    return 10;
  }
  return 0;
}

function evidenceStrengthScore(strength: EvidenceRef["strength"]): number {
  if (strength === "strong") {
    return 10;
  }
  if (strength === "medium") {
    return 5;
  }
  return 0;
}

function clusterStrengthScore(strength: "none" | "weak" | "medium" | "strong"): number {
  if (strength === "strong") {
    return 8;
  }
  if (strength === "medium") {
    return 4;
  }
  return 0;
}

function cannibalizationPenaltyScore(level: OpportunityBrief["cannibalizationRisk"]["level"]): number {
  if (level === "high") {
    return 30;
  }
  if (level === "medium") {
    return 15;
  }
  if (level === "low") {
    return 5;
  }
  return 0;
}

function normalizeOpportunityKey(service: string, locationName: string): string {
  return normalizeKey(`${service}:${locationName}`);
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, " ");
}

function normalizeUrl(value: string | undefined): string {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/u, "").toLowerCase();
  } catch {
    return value.trim().replace(/\/$/u, "").toLowerCase();
  }
}

function normalizeRoute(route: string): string {
  const normalized = route.trim().toLowerCase();
  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function normalizeCopyText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, " ");
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function sortRecords(records: readonly Record<string, unknown>[], keys: readonly string[]): Record<string, unknown>[] {
  return [...records].sort((left, right) => {
    const leftKey = keys.map((key) => stableString(left[key])).join("\u0000");
    const rightKey = keys.map((key) => stableString(right[key])).join("\u0000");
    return leftKey.localeCompare(rightKey);
  });
}

function stableString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function fail(gateId: OpportunityScoutQaGateId, message: string, briefIndex?: number): OpportunityScoutQaResult {
  return {
    ok: false,
    failure: {
      code: "qa_rejected",
      gateId,
      message,
      briefIndex
    }
  };
}
