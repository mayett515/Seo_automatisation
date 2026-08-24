import { Link } from "@tanstack/react-router";
import { StatusPill } from "@localseo/ui";
import type {
  AgentRunSummary,
  EvidenceRef,
  OpportunityBrief,
  OpportunityExplorerOpportunity
} from "@localseo/contracts";
import type { OpportunityDecisionFormState } from "../../screens/opportunity-explorer-data";
import { OpportunityDecisionForm } from "./opportunity-decision-form";
import {
  isActiveRun,
  label,
  lifecycleTone,
  maxProofTier,
  pageProposalDisabledReason,
  proofTierTone,
  proposalButtonLabel,
  researchEvidenceTone,
  runStatusTone,
  safeUrlLabel,
  shortId
} from "./opportunity-explorer-utils";

export function OpportunityDetail(props: {
  opportunity?: OpportunityExplorerOpportunity;
  decisionPending: boolean;
  pageProposalPending: boolean;
  pageProposalPendingOpportunityId?: string;
  pageProposalRun?: AgentRunSummary;
  pageProposalRunsPending: boolean;
  projectId: string;
  onDecide: (opportunity: OpportunityExplorerOpportunity, decision: OpportunityDecisionFormState) => void;
  onQueuePageProposal: (opportunity: OpportunityExplorerOpportunity) => void;
}) {
  const opportunity = props.opportunity;
  const brief = opportunity?.evidenceJson;

  if (!opportunity) {
    return (
      <section className="detail-panel">
        <h2>Evidence</h2>
        <div className="notice notice--neutral">Select an opportunity to inspect the evidence stack.</div>
      </section>
    );
  }

  if (opportunity.research) {
    return (
      <ResearchOpportunityDetail
        decisionPending={props.decisionPending}
        opportunity={opportunity}
        research={opportunity.research}
        onDecide={props.onDecide}
      />
    );
  }

  if (!brief) {
    return (
      <section className="detail-panel">
        <h2>Evidence</h2>
        <div className="notice notice--danger">This opportunity row has no contract-valid brief available.</div>
      </section>
    );
  }

  return (
    <section className="detail-panel">
      <header className="panel-heading">
        <div>
          <h2>{brief.primaryKeyword}</h2>
          <p>{`${brief.service} / ${brief.location.name}`}</p>
        </div>
        <StatusPill tone={proofTierTone(maxProofTier(brief))}>{label(maxProofTier(brief))}</StatusPill>
      </header>

      <div className="metric-row metric-row--compact">
        <Metric title="Recommended" value={label(brief.recommendedAction)} />
        <Metric title="Lifecycle" value={label(opportunity.status)} />
        <Metric title="Risk" value={brief.cannibalizationRisk.level} />
        <Metric title="Confidence" value={`${Math.round(brief.confidence * 100)}%`} />
      </div>

      {opportunity.research ? <OpportunityResearchMetrics research={opportunity.research} /> : null}

      <OpportunityDecisionForm
        key={`${opportunity.id}:${opportunity.rowVersion}`}
        isPending={props.decisionPending}
        opportunity={opportunity}
        onSubmit={(decision) => props.onDecide(opportunity, decision)}
      />

      <PageProposalActionCard
        brief={brief}
        isPending={props.pageProposalPending && props.pageProposalPendingOpportunityId === opportunity.id}
        isRunListPending={props.pageProposalRunsPending}
        latestRun={props.pageProposalRun}
        opportunity={opportunity}
        projectId={props.projectId}
        onQueue={() => props.onQueuePageProposal(opportunity)}
      />

      <DetailSection title="Evidence stack">
        {brief.evidence.map((evidence, index) => (
          <EvidenceItem
            evidence={evidence}
            key={`${evidence.sourceType}-${evidence.sourceId ?? evidence.summary}-${index}`}
          />
        ))}
      </DetailSection>

      <DetailSection title="Missing evidence">
        <CompactList items={brief.missingEvidence} empty="No missing evidence recorded." />
      </DetailSection>

      <DetailSection title="Competitors">
        {brief.competitorObservations.length > 0 ? (
          brief.competitorObservations.map((observation) => (
            <article className="evidence-item" key={`${observation.url}-${observation.observation}`}>
              <strong>{safeUrlLabel(observation.url)}</strong>
              <span>{observation.observation}</span>
              {observation.gap ? <span>{observation.gap}</span> : null}
            </article>
          ))
        ) : (
          <div className="muted-text">No competitor observations recorded.</div>
        )}
      </DetailSection>

      <DetailSection title="Corridor">
        <p>{brief.corridorCluster?.rationale ?? "No corridor context recorded."}</p>
        <CompactList items={brief.corridorCluster?.recommendedSequence ?? []} empty="No sequence recorded." />
      </DetailSection>
    </section>
  );
}

function ResearchOpportunityDetail(props: {
  opportunity: OpportunityExplorerOpportunity;
  research: NonNullable<OpportunityExplorerOpportunity["research"]>;
  decisionPending: boolean;
  onDecide: (opportunity: OpportunityExplorerOpportunity, decision: OpportunityDecisionFormState) => void;
}) {
  const { candidate } = props.research;

  return (
    <section className="detail-panel">
      <header className="panel-heading">
        <div>
          <h2>{candidate.primaryKeyword}</h2>
          <p>{`${candidate.service} / ${candidate.area}`}</p>
        </div>
        <StatusPill tone={researchEvidenceTone(props.research.evidenceReadiness)}>
          {label(props.research.evidenceReadiness)}
        </StatusPill>
      </header>

      <OpportunityResearchMetrics research={props.research} />

      <div className="metric-row metric-row--compact metric-row--three">
        <Metric title="Page type" value={label(candidate.suggestedPageType)} />
        <Metric title="Route" value={candidate.suggestedRoute ?? "not set"} />
        <Metric title="Confidence" value={`${Math.round(candidate.confidence * 100)}%`} />
      </div>

      <OpportunityDecisionForm
        key={`${props.opportunity.id}:${props.opportunity.rowVersion}`}
        isPending={props.decisionPending}
        opportunity={props.opportunity}
        onSubmit={(decision) => props.onDecide(props.opportunity, decision)}
      />

      <DetailSection title="Research rationale">
        <p>{candidate.rationale}</p>
      </DetailSection>

      <DetailSection title="Evidence citations">
        {props.research.citations.map((citation) => (
          <article className="evidence-item" key={citation.evidenceKey}>
            <div>
              <strong>{label(citation.sourceKind)}</strong>
              <StatusPill tone={proofTierTone(citation.proofTier)}>{label(citation.proofTier)}</StatusPill>
            </div>
            <span>{citation.summary}</span>
          </article>
        ))}
      </DetailSection>

      <DetailSection title="Secondary keywords">
        <CompactList items={candidate.secondaryKeywords} empty="No secondary keywords selected." />
      </DetailSection>

      <DetailSection title="Missing evidence">
        <CompactList items={candidate.missingEvidence} empty="No missing evidence recorded." />
      </DetailSection>
    </section>
  );
}

function PageProposalActionCard(props: {
  brief: OpportunityBrief;
  isPending: boolean;
  isRunListPending: boolean;
  latestRun?: AgentRunSummary;
  opportunity: OpportunityExplorerOpportunity;
  projectId: string;
  onQueue: () => void;
}) {
  const activeRun = props.latestRun ? isActiveRun(props.latestRun) : false;
  const disabledReason = pageProposalDisabledReason(props.opportunity, props.brief, props.latestRun);
  const canQueue = disabledReason === undefined;
  const statusLabel = props.latestRun ? props.latestRun.status : props.opportunity.status;

  return (
    <section className="decision-card">
      <div className="decision-card__header">
        <h3>Page proposal</h3>
        <StatusPill
          tone={props.latestRun ? runStatusTone(props.latestRun.status) : lifecycleTone(props.opportunity.status)}
        >
          {label(statusLabel)}
        </StatusPill>
      </div>
      <div className="metric-row metric-row--compact metric-row--three">
        <Metric title="Route" value={props.brief.suggestedRoute ?? "not set"} />
        <Metric title="Page type" value={label(props.brief.suggestedPageType)} />
        <Metric title="Run" value={props.latestRun ? shortId(props.latestRun.id) : "none"} />
      </div>
      <div className="decision-card__actions">
        <button
          className="button-primary"
          disabled={!canQueue || props.isPending || props.isRunListPending}
          type="button"
          onClick={props.onQueue}
        >
          {proposalButtonLabel(props.latestRun, props.isPending, activeRun)}
        </button>
        {props.opportunity.status === "brief_created" ? (
          <Link className="button-link" to="/projects/$projectId/pages" params={{ projectId: props.projectId }}>
            Open pages
          </Link>
        ) : null}
      </div>
      {disabledReason ? <p className="muted-text">{disabledReason}</p> : null}
      {props.latestRun?.failure ? (
        <div className="notice notice--danger">
          {props.latestRun.failure.message ?? props.latestRun.failure.code}
          {props.latestRun.failure.gateId ? ` (${props.latestRun.failure.gateId})` : ""}
        </div>
      ) : null}
    </section>
  );
}

function OpportunityResearchMetrics(props: { research: NonNullable<OpportunityExplorerOpportunity["research"]> }) {
  return (
    <section className="detail-section">
      <h3>Research axes</h3>
      <div className="metric-row metric-row--compact">
        <Metric title="Ranking" value={label(props.research.rankingMilestone)} />
        <Metric title="Evidence" value={label(props.research.evidenceReadiness)} />
        <Metric title="Business value" value={label(props.research.businessValue)} />
        <Metric title="Difficulty" value={label(props.research.marketDifficulty)} />
        <Metric title="Effort" value={label(props.research.executionEffort)} />
        <Metric title="Lane" value={label(props.research.lane)} />
      </div>
    </section>
  );
}

function DetailSection(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="detail-section">
      <h3>{props.title}</h3>
      {props.children}
    </section>
  );
}

function EvidenceItem(props: { evidence: EvidenceRef }) {
  return (
    <article className="evidence-item">
      <div>
        <strong>{label(props.evidence.sourceType)}</strong>
        <StatusPill tone={proofTierTone(props.evidence.proofTier)}>{label(props.evidence.proofTier)}</StatusPill>
      </div>
      <span>{props.evidence.summary}</span>
      {props.evidence.locator?.query ? <span>{props.evidence.locator.query}</span> : null}
    </article>
  );
}

function CompactList(props: { items: string[]; empty: string }) {
  if (props.items.length === 0) {
    return <div className="muted-text">{props.empty}</div>;
  }

  return (
    <div className="chip-row">
      {props.items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

function Metric(props: { title: string; value: string }) {
  return (
    <article className="metric-card metric-card--compact">
      <span>{props.title}</span>
      <strong>{props.value}</strong>
    </article>
  );
}
