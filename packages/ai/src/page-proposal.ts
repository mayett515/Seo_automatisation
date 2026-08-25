import { type PageEvidenceRef, type PageGeneration, type PageProposalJson } from "@localseo/contracts";
import { evidenceResolutionKey, normalizeRoute, type ResolvableEvidenceRef } from "./evidence-resolution.js";
import type { OpportunityScoutPromptSection } from "./prompt-section.js";

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

export const canonicalPageProposalOutputExample = buildCanonicalPageProposalOutputExample({
  projectId: "11111111-1111-4111-8111-111111111111",
  opportunityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  agentRunId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
});

const pageProposalOutputExampleJson = JSON.stringify(canonicalPageProposalOutputExample, null, 2);

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
