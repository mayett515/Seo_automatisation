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
  | "proof_gate"
  | "gsc_containment"
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
};

export type EvaluateOpportunityScoutInput = {
  projectId: string;
  output: OpportunityScoutOutput;
  resolvableEvidence: readonly ResolvableEvidenceRef[];
  existingRoutes?: readonly string[];
  existingOpportunityKeys?: readonly string[];
  maxBriefs?: number;
};

const gscEvidenceSources = new Set<EvidenceSourceType>(["gsc_signal", "gsc_row"]);
const customerSafeProofSources = new Set<EvidenceSourceType>(["ranking_proof", "serp_snapshot"]);

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

    const proofFailure = validateProofGate(brief);
    if (proofFailure) {
      return fail("proof_gate", proofFailure, briefIndex);
    }

    const gscFailure = validateGscContainment(evidenceRefs);
    if (gscFailure) {
      return fail("gsc_containment", gscFailure, briefIndex);
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
  return evidence.proofTier === "customer_safe_proof";
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

function validateProofGate(brief: OpportunityBrief): string | undefined {
  if (brief.classification !== "proven_win") {
    return undefined;
  }

  if (brief.recommendedAction !== "monitor") {
    return "proven_win briefs are report/monitoring facts and cannot request page creation.";
  }

  if (!brief.evidence.some(isCustomerSafeRankingProof)) {
    return "proven_win requires customer-safe ranking proof with an explicit Top 10 rank.";
  }

  return undefined;
}

function validateGscContainment(evidenceRefs: readonly EvidenceRef[]): string | undefined {
  const badGscProof = evidenceRefs.find(
    (evidence) => gscEvidenceSources.has(evidence.sourceType) && evidence.proofTier === "customer_safe_proof"
  );

  if (badGscProof) {
    return `${badGscProof.sourceType} cannot be customer_safe_proof.`;
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
