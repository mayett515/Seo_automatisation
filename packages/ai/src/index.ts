import {
  cannibalizationRiskLevels,
  clusterStrengths,
  evidenceProofTiers,
  evidenceSourceTypes,
  evidenceStrengths,
  hubSpokeRoles,
  nearbyPlaceAdjacencyReasons,
  nearbyPlaceKinds,
  opportunityClassifications,
  opportunityGroupSources,
  opportunityRecommendedActions,
  opportunitySuggestedPageTypes,
  type EvidenceProofTier,
  type EvidenceRef,
  type EvidenceSourceType,
  type OpportunityBrief,
  type OpportunityGroupHint,
  type OpportunityScoutOutput,
  type PageEvidenceRef,
  type PageGeneration,
  type PageProposalJson
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

export const canonicalOpportunityScoutOutputExample = {
  briefs: [
    {
      projectId: "11111111-1111-4111-8111-111111111111",
      classification: "near_term_target",
      service: "Entruempelung",
      location: {
        name: "Dachau",
        kind: "city",
        adjacencyReason: "gsc_testing_signal",
        existingClusterStrength: "weak",
        mapGroupKey: "dachau-south-corridor",
        evidence: [
          {
            sourceType: "gsc_signal",
            sourceId: "77777777-7777-4777-8777-777777777777",
            locator: {
              query: "entruempelung dachau",
              pageUrl: "https://customer.example/entruempelung/"
            },
            summary: "GSC signal shows Dachau intent on the generic Entruempelung page.",
            observedMetric: { name: "impressions", value: 28 },
            strength: "medium",
            proofTier: "internal_signal"
          }
        ]
      },
      primaryKeyword: "entruempelung dachau",
      secondaryKeywords: ["wohnungsaufloesung dachau", "haushaltsaufloesung dachau"],
      suggestedRoute: "/entruempelung-dachau/",
      suggestedPageType: "normal_page",
      evidence: [
        {
          sourceType: "gsc_row",
          sourceId: "66666666-6666-4666-8666-666666666666",
          locator: {
            query: "entruempelung dachau",
            pageUrl: "https://customer.example/entruempelung/"
          },
          summary: "The query has impressions on a generic service page but no proven Top 10 ranking proof.",
          observedMetric: { name: "impressions", value: 28 },
          strength: "medium",
          proofTier: "internal_signal"
        }
      ],
      competitorObservations: [],
      groupHints: [
        {
          key: "gsc-entruempelung-dachau",
          label: "GSC cluster: Entruempelung Dachau",
          source: "gsc_query_cluster",
          description: "Specific Dachau query demand appears on a generic Entruempelung route.",
          evidence: [
            {
              sourceType: "gsc_row",
              sourceId: "66666666-6666-4666-8666-666666666666",
              locator: {
                query: "entruempelung dachau",
                pageUrl: "https://customer.example/entruempelung/"
              },
              summary: "Use this GSC row as demand context, not customer-safe proof.",
              observedMetric: { name: "position", value: 17 },
              strength: "medium",
              proofTier: "internal_signal"
            }
          ]
        }
      ],
      hubSpokeRole: "standalone",
      uniquenessRationale:
        "A Dachau-specific page would answer local intent that the generic service page does not cover.",
      cannibalizationRisk: {
        level: "medium",
        conflictingRoutes: ["/entruempelung/"]
      },
      missingEvidence: ["Manual ranking proof or reviewed SERP evidence would be needed before any proven_win claim."],
      confidence: 0.62,
      recommendedAction: "create_brief"
    }
  ],
  groups: [
    {
      key: "gsc-entruempelung-dachau",
      label: "GSC cluster: Entruempelung Dachau",
      source: "gsc_query_cluster",
      description: "Specific Dachau query demand appears on a generic Entruempelung route.",
      evidence: [
        {
          sourceType: "gsc_row",
          sourceId: "66666666-6666-4666-8666-666666666666",
          locator: {
            query: "entruempelung dachau",
            pageUrl: "https://customer.example/entruempelung/"
          },
          summary: "GSC demand signal for Dachau; not customer-safe proof.",
          observedMetric: { name: "impressions", value: 28 },
          strength: "medium",
          proofTier: "internal_signal"
        }
      ]
    }
  ],
  runNotes: "Example only. Replace values with facts from the input packet."
} satisfies OpportunityScoutOutput;

const opportunityScoutOutputExampleJson = JSON.stringify(canonicalOpportunityScoutOutputExample, null, 2);

const opportunityScoutEnumVocabulary = [
  `classification: ${formatVocabulary(opportunityClassifications)}`,
  `recommendedAction: ${formatVocabulary(opportunityRecommendedActions)}`,
  `suggestedPageType: ${formatVocabulary(opportunitySuggestedPageTypes)}`,
  `EvidenceRef.sourceType: ${formatVocabulary(evidenceSourceTypes)}`,
  `EvidenceRef.strength: ${formatVocabulary(evidenceStrengths)}`,
  `EvidenceRef.proofTier: ${formatVocabulary(evidenceProofTiers)}`,
  `location.kind: ${formatVocabulary(nearbyPlaceKinds)}`,
  `location.adjacencyReason: ${formatVocabulary(nearbyPlaceAdjacencyReasons)}`,
  `corridorCluster.clusterStrength and location.existingClusterStrength: ${formatVocabulary(clusterStrengths)}`,
  `hubSpokeRole: ${formatVocabulary(hubSpokeRoles)}`,
  `cannibalizationRisk.level: ${formatVocabulary(cannibalizationRiskLevels)}`,
  `groupHints.source and groups.source: ${formatVocabulary(opportunityGroupSources)}`
] as const;

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
      "Copy projectId exactly from the input packet into every brief.",
      "Every evidence item must be a full EvidenceRef object with sourceType, sourceId, summary, strength, and proofTier; never output evidence as strings or sourceId arrays.",
      "Never output null. Omit optional fields when unknown, and use empty arrays only where the example shows arrays.",
      `Allowed enum values:\n${opportunityScoutEnumVocabulary.map((line) => `- ${line}`).join("\n")}`,
      "Use this canonical schema example as the output shape; replace values with input-backed facts and do not copy example sourceIds unless they exist in the input packet:",
      opportunityScoutOutputExampleJson,
      'If the packet has no useful evidence, return {"briefs":[],"groups":[]}.'
    ]
  }
];

function formatVocabulary(values: readonly string[]): string {
  return values.join(" | ");
}

export function buildOpportunityScoutPrompt(): string {
  return opportunityScoutPromptSections
    .map((section) => [`## ${section.title}`, ...section.lines].join("\n"))
    .join("\n\n");
}

export type PageProposalQaGateId =
  | "project_scope"
  | "opportunity_scope"
  | "route_collision"
  | "evidence_resolution"
  | "local_uniqueness_gate";

export type PageProposalQaFailure = {
  code: "qa_rejected";
  gateId: PageProposalQaGateId;
  message: string;
};

export type PageProposalQaResult =
  | {
      ok: true;
      output: PageProposalJson;
    }
  | {
      ok: false;
      failure: PageProposalQaFailure;
    };

export type PageProposalEvidencePacket = {
  projectId: string;
  runId: string;
  generatedAt: string;
  opportunity: {
    id: string;
    primaryKeyword: string;
    service?: string;
    locationName?: string;
    suggestedRoute?: string;
    uniquenessRationale?: string;
    evidenceJson?: Record<string, unknown>;
  };
  existingRoutes: string[];
  registrySummary: Record<string, unknown>[];
};

export type EvaluatePageProposalOutputInput = {
  projectId: string;
  opportunityId: string;
  output: PageProposalJson;
  resolvableEvidence: readonly ResolvableEvidenceRef[];
  existingRoutes?: readonly string[];
};

export const pageProposalEvidencePacketLimits = {
  existingRoutes: 100,
  registrySummary: 80,
  serializedBytes: 160_000
} as const;

export type CanonicalPageProposalExampleInput = {
  projectId: string;
  opportunityId: string;
  agentRunId: string;
};

export const canonicalPageProposalOutputExample = buildCanonicalPageProposalOutputExample({
  projectId: "11111111-1111-4111-8111-111111111111",
  opportunityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  agentRunId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
});

const pageProposalOutputExampleJson = JSON.stringify(canonicalPageProposalOutputExample, null, 2);

export function buildCanonicalPageProposalOutputExample(input: CanonicalPageProposalExampleInput): PageProposalJson {
  const generation: PageGeneration = {
    source: "agent",
    agentRunId: input.agentRunId
  };

  return {
    schemaVersion: 1,
    projectId: input.projectId,
    opportunityId: input.opportunityId,
    route: "/dachreinigung-muenchen/",
    primaryKeyword: "dachreinigung muenchen",
    evidenceRefs: [],
    proposalRationale: "Eine eigene Muenchen-Seite beantwortet die lokale Nachfrage nach Dachreinigung.",
    generation,
    page: {
      schemaVersion: 1,
      route: "/dachreinigung-muenchen/",
      pageType: "service_area_page",
      target: {
        service: "Dachreinigung",
        location: "Muenchen",
        primaryKeyword: "dachreinigung muenchen",
        secondaryKeywords: ["dach reinigen muenchen"]
      },
      seo: {
        title: "Dachreinigung Muenchen",
        metaDescription: "Lokale Dachreinigung in Muenchen mit klarer Beratung und schneller Anfrage.",
        canonicalPath: "/dachreinigung-muenchen/",
        robots: "noindex",
        jsonLd: [],
        sitemapReady: true
      },
      sections: [
        pageProposalExampleSection("header-1", "Header", "Header.default", "frame_top", 0, generation, {
          brandName: "Muster Dachservice",
          navItems: [{ label: "Kontakt", href: "/kontakt/" }]
        }),
        pageProposalExampleSection("hero-1", "Hero", "Hero.default", "hero", 1, generation, {
          h1: "Dachreinigung in Muenchen",
          lead: "Gruendliche Dachreinigung fuer Immobilien in Muenchen.",
          primaryCtaLabel: "Anfragen",
          primaryCtaHref: "/kontakt/"
        }),
        pageProposalExampleSection("intro-1", "ServiceIntro", "ServiceIntro.default", "body_intro", 2, generation, {
          heading: "Lokale Dachpflege mit sauberem Ablauf",
          body: "Die Seite beantwortet Muenchner Suchintention mit Service, Ablauf und Kontaktmoeglichkeit."
        }),
        pageProposalExampleSection(
          "description-1",
          "ServiceDescription",
          "ServiceDescription.default",
          "body_main",
          3,
          generation,
          {
            heading: "Was die Dachreinigung umfasst",
            paragraphs: ["Moos, Schmutz und Ablagerungen werden geprueft und schonend entfernt."]
          }
        ),
        pageProposalExampleSection("benefits-1", "BenefitsGrid", "BenefitsGrid.default", "body_main", 4, generation, {
          heading: "Vorteile",
          benefits: [
            { title: "Lokale Anfahrt", body: "Termine in Muenchen und Umgebung." },
            { title: "Klare Beratung", body: "Vor der Reinigung wird der Zustand nachvollziehbar besprochen." }
          ]
        }),
        pageProposalExampleSection("faq-1", "FAQ", "FAQ.default", "body_late", 5, generation, {
          heading: "Haeufige Fragen",
          items: [
            {
              question: "Wann lohnt sich eine Dachreinigung?",
              answer: "Wenn Moos oder Schmutz sichtbar sind."
            }
          ]
        }),
        pageProposalExampleSection(
          "areas-1",
          "ServiceAreaList",
          "ServiceAreaList.default",
          "body_late",
          6,
          generation,
          {
            heading: "Einsatzgebiet",
            areas: [{ name: "Muenchen", route: "/dachreinigung-muenchen/" }]
          }
        ),
        pageProposalExampleSection("cta-1", "FinalCTA", "FinalCTA.default", "cta_late", 7, generation, {
          heading: "Dachreinigung anfragen",
          body: "Beschreiben Sie kurz das Objekt und wir melden uns.",
          ctaLabel: "Kontakt aufnehmen",
          ctaHref: "/kontakt/"
        }),
        pageProposalExampleSection("footer-1", "Footer", "Footer.default", "frame_bottom", 8, generation, {
          businessName: "Muster Dachservice",
          legalLinks: [{ label: "Impressum", href: "/impressum/" }]
        })
      ],
      internalLinks: ["/kontakt/", "/impressum/"],
      evidenceRefs: [],
      uniquenessRationale: "Muenchen bekommt eine eigenstaendige Dachreinigung-Seite mit lokalem Anfragefokus.",
      generation
    }
  };
}

export function attributePageProposalGeneration(output: PageProposalJson, agentRunId: string): PageProposalJson {
  const generation: PageGeneration = {
    source: "agent",
    agentRunId
  };

  return {
    ...output,
    generation,
    page: {
      ...output.page,
      generation,
      sections: output.page.sections.map((section) => ({
        ...section,
        generation
      }))
    }
  };
}

function pageProposalExampleSection(
  id: PageProposalJson["page"]["sections"][number]["id"],
  type: PageProposalJson["page"]["sections"][number]["type"],
  registryKey: PageProposalJson["page"]["sections"][number]["registryKey"],
  zone: PageProposalJson["page"]["sections"][number]["zone"],
  order: number,
  generation: PageGeneration,
  props: Record<string, unknown>
): PageProposalJson["page"]["sections"][number] {
  return {
    id,
    type,
    registryKey,
    schemaVersion: 1,
    zone,
    order,
    variant: "default",
    props,
    evidenceRefs: [],
    generation
  };
}

export const pageProposalPromptSections: readonly OpportunityScoutPromptSection[] = [
  {
    key: "role",
    title: "Role And Boundary",
    lines: [
      "You are the Local SEO Page Proposal agent for an operator-facing Page Studio workflow.",
      "AI drafts structured PageProposalJson only. Contracts, registry validation, Page Studio composition checks, preview, and humans decide what becomes product state.",
      "You never approve, deploy, mutate providers, write approved page versions, create ranking proof, or emit arbitrary HTML/CSS/JS/React."
    ]
  },
  {
    key: "evidence_and_proof",
    title: "Evidence And Proof Rules",
    lines: [
      "Use only evidence represented in the input packet. Do not invent sourceId values.",
      "GSC, tracking, technical audit, SERP, and opportunity evidence are planning context, not customer-safe proof.",
      "Ranking proof may be cited only when the input packet includes it.",
      "Keep competitor and market observations in your own words; do not copy competitor copy or layouts."
    ]
  },
  {
    key: "classification",
    title: "PageJson Requirements",
    lines: [
      "Return one JSON object matching PageProposalJson with schemaVersion 1.",
      "Copy projectId exactly from the input packet.",
      "Copy opportunity.id into opportunityId.",
      "Use a route that starts with '/' and does not collide with existingRoutes.",
      "Set page.route equal to route and page.target.primaryKeyword equal to primaryKeyword.",
      "Use only registry keys, section types, zones, and variants from registrySummary.",
      "Include a unique local reason in proposalRationale or page.uniquenessRationale.",
      "Do not output html, css, script, jsx, class, className, style, rawMarkup, innerHTML, srcdoc, event handlers, javascript: URLs, or data:text/html strings."
    ]
  },
  {
    key: "nearby_orte_corridors",
    title: "MVP Page Skeleton",
    lines: [
      "For MVP, produce a complete Local SEO service-area page skeleton:",
      "Header, Hero, ServiceIntro, ServiceDescription, BenefitsGrid, FAQ, ServiceAreaList, FinalCTA, Footer.",
      "Use stable section ids, zero-based contiguous order, Header first, Hero after Header, FinalCTA before Footer, and Footer last.",
      "Write concise German local-service copy when the evidence is German."
    ]
  },
  {
    key: "output_format",
    title: "Output Format",
    lines: [
      "Return only JSON. Do not wrap it in Markdown.",
      "Never output null. Omit optional fields when unknown, and use empty arrays only where the schema allows arrays.",
      "Copy the input packet runId into proposal, page, and section generation.agentRunId with generation.source set to agent.",
      "The output must be previewable, but preview rendering is deterministic code-owned. Do not emit renderer class names or style controls.",
      "Use this canonical schema and registry-prop example as the output shape. Replace projectId, opportunityId, runId, route, keyword, location, service, and copy with input-backed values:",
      pageProposalOutputExampleJson
    ]
  }
];

export function buildPageProposalPrompt(): string {
  return pageProposalPromptSections.map((section) => [`## ${section.title}`, ...section.lines].join("\n")).join("\n\n");
}

export function buildPageProposalEvidencePacket(input: PageProposalEvidencePacket): PageProposalEvidencePacket {
  return {
    ...input,
    existingRoutes: [...new Set(input.existingRoutes.map(normalizeRoute))]
      .sort()
      .slice(0, pageProposalEvidencePacketLimits.existingRoutes),
    registrySummary: input.registrySummary.slice(0, pageProposalEvidencePacketLimits.registrySummary)
  };
}

export function evaluatePageProposalOutput(input: EvaluatePageProposalOutputInput): PageProposalQaResult {
  if (input.output.projectId !== input.projectId) {
    return failPageProposal("project_scope", "PageProposalJson projectId does not match the agent run project.");
  }

  if (input.output.opportunityId !== input.opportunityId) {
    return failPageProposal(
      "opportunity_scope",
      "PageProposalJson opportunityId does not match the requested opportunity."
    );
  }

  const existingRoutes = new Set((input.existingRoutes ?? []).map(normalizeRoute));
  if (existingRoutes.has(normalizeRoute(input.output.route))) {
    return failPageProposal("route_collision", `PageProposalJson route ${input.output.route} already exists.`);
  }

  const resolvableEvidenceKeys = new Set(
    input.resolvableEvidence.map((evidence) => evidenceResolutionKey(evidence.sourceType, evidence.sourceId))
  );
  const evidenceFailure = validatePageProposalEvidenceResolution(input.output, resolvableEvidenceKeys);
  if (evidenceFailure) {
    return failPageProposal("evidence_resolution", evidenceFailure);
  }

  if (!input.output.proposalRationale && !input.output.page.uniquenessRationale) {
    return failPageProposal(
      "local_uniqueness_gate",
      "PageProposalJson requires proposalRationale or page.uniquenessRationale before preview persistence."
    );
  }

  return {
    ok: true,
    output: input.output
  };
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

function validatePageProposalEvidenceResolution(
  proposal: PageProposalJson,
  resolvableEvidenceKeys: ReadonlySet<string>
): string | undefined {
  for (const evidence of collectPageProposalEvidenceRefs(proposal)) {
    if (!evidence.sourceId) {
      continue;
    }

    const key = evidenceResolutionKey(evidence.sourceType, evidence.sourceId);
    if (!resolvableEvidenceKeys.has(key)) {
      return `PageProposalJson EvidenceRef ${key} does not resolve to a project-owned row.`;
    }
  }

  return undefined;
}

function collectPageProposalEvidenceRefs(proposal: PageProposalJson): PageEvidenceRef[] {
  return [
    ...proposal.evidenceRefs,
    ...proposal.page.evidenceRefs,
    ...proposal.page.sections.flatMap((section) => section.evidenceRefs)
  ];
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

function failPageProposal(gateId: PageProposalQaGateId, message: string): PageProposalQaResult {
  return {
    ok: false,
    failure: {
      code: "qa_rejected",
      gateId,
      message
    }
  };
}
