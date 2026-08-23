import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable, type Row } from "@tanstack/react-table";
import { StatusPill } from "@localseo/ui";
import {
  AgentRunListResponseSchema,
  CreatePageProposalRunRequestSchema,
  OpportunityExplorerListResponseSchema,
  OpportunityExplorerOpportunitySchema,
  PageProposalQueueResponseSchema,
  OpportunityScoutQueueResponseSchema,
  RankingProofListResponseSchema,
  RankingProofSchema,
  UpdateOpportunityLifecycleRequestSchema,
  UpdateRankingProofStatusRequestSchema,
  type AgentRunSummary,
  type EvidenceRef,
  type OpportunityBrief,
  type OpportunityExplorerOpportunity,
  type OpportunityLifecycleStatus,
  type PageProposalQueueResponse,
  type OpportunityScoutQueueResponse,
  type RankingProof
} from "@localseo/contracts";
import { getJson, patchJson, postJson } from "../lib/api";
import { projectApiPath } from "../lib/api-path";
import { errorMessage } from "../lib/error-message";
import { OpportunityResearchPanel } from "./opportunity-research-panel";

type RankingProofFormState = {
  query: string;
  pageUrl: string;
  rank: string;
  notes: string;
};

type OpportunityDecisionStatus = Exclude<OpportunityLifecycleStatus, "brief_created">;

type OpportunityDecisionFormState = {
  status: OpportunityDecisionStatus;
  reason: string;
};

const opportunityColumn = createColumnHelper<OpportunityExplorerOpportunity>();
const opportunityDecisionStatuses = [
  "monitoring",
  "held",
  "rejected",
  "new"
] as const satisfies readonly OpportunityDecisionStatus[];

export function OpportunityExplorerScreen(props: { projectId: string }) {
  const projectId = props.projectId;
  const queryClient = useQueryClient();
  const previousActiveRun = useRef(false);
  const previousActivePageProposalRun = useRef(false);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | undefined>();
  const [maxBriefs, setMaxBriefs] = useState("8");
  const [proofForm, setProofForm] = useState<RankingProofFormState>({
    query: "",
    pageUrl: "",
    rank: "",
    notes: ""
  });
  const [latestScoutResponse, setLatestScoutResponse] = useState<OpportunityScoutQueueResponse | undefined>();
  const [latestPageProposalResponse, setLatestPageProposalResponse] = useState<PageProposalQueueResponse | undefined>();
  const [latestProof, setLatestProof] = useState<RankingProof | undefined>();
  const [latestDecision, setLatestDecision] = useState<OpportunityExplorerOpportunity | undefined>();

  const opportunities = useQuery({
    queryKey: ["opportunities", projectId],
    queryFn: () => getJson(projectApiPath(projectId, "/opportunities"), OpportunityExplorerListResponseSchema),
    retry: false
  });
  const runs = useQuery({
    queryKey: ["agent-runs", projectId, "opportunity_scout"],
    queryFn: () => getJson(projectApiPath(projectId, "/agent-runs?task=opportunity_scout"), AgentRunListResponseSchema),
    retry: false,
    refetchInterval: (query) => {
      const active = query.state.data?.runs.some((run) => run.status === "queued" || run.status === "running");
      return active ? 3000 : false;
    }
  });
  const pageProposalRuns = useQuery({
    queryKey: ["agent-runs", projectId, "page_brief_draft"],
    queryFn: () => getJson(projectApiPath(projectId, "/agent-runs?task=page_brief_draft"), AgentRunListResponseSchema),
    retry: false,
    refetchInterval: (query) => {
      const active = query.state.data?.runs.some(isActiveRun);
      return active ? 3000 : false;
    }
  });
  const proofs = useQuery({
    queryKey: ["ranking-proofs", projectId],
    queryFn: () => getJson(projectApiPath(projectId, "/ranking-proofs"), RankingProofListResponseSchema),
    retry: false
  });

  const runScout = useMutation({
    mutationFn: () =>
      postJson(
        projectApiPath(projectId, "/opportunity-scout/runs"),
        { maxBriefs: numberFromForm(maxBriefs, 8) },
        OpportunityScoutQueueResponseSchema
      ),
    onSuccess: async (response) => {
      setLatestScoutResponse(response);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agent-runs", projectId, "opportunity_scout"] }),
        queryClient.invalidateQueries({ queryKey: ["opportunities", projectId] })
      ]);
    }
  });
  const createProof = useMutation({
    mutationFn: () =>
      postJson(
        projectApiPath(projectId, "/ranking-proofs"),
        {
          query: proofForm.query,
          pageUrl: proofForm.pageUrl,
          rank: numberFromForm(proofForm.rank, 1),
          notes: proofForm.notes.trim().length > 0 ? proofForm.notes : undefined
        },
        RankingProofSchema
      ),
    onSuccess: async (proof) => {
      setLatestProof(proof);
      setProofForm({ query: "", pageUrl: "", rank: "", notes: "" });
      await queryClient.invalidateQueries({ queryKey: ["ranking-proofs", projectId] });
    }
  });
  const updateOpportunityDecision = useMutation({
    mutationFn: (input: { opportunity: OpportunityExplorerOpportunity; decision: OpportunityDecisionFormState }) => {
      const body = UpdateOpportunityLifecycleRequestSchema.parse({
        expectedStatus: input.opportunity.status,
        expectedRowVersion: input.opportunity.rowVersion,
        status: input.decision.status,
        reason: normalizedReason(input.decision.reason)
      });

      return patchJson(
        projectApiPath(projectId, `/opportunities/${encodeURIComponent(input.opportunity.id)}/status`),
        body,
        OpportunityExplorerOpportunitySchema
      );
    },
    onSuccess: async (opportunity) => {
      setLatestDecision(opportunity);
      setSelectedOpportunityId(opportunity.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["opportunities", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["agent-runs", projectId, "opportunity_scout"] })
      ]);
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: ["opportunities", projectId] });
    }
  });
  const updateRankingProof = useMutation({
    mutationFn: (input: { proof: RankingProof; status: "reviewed" | "invalidated"; reason?: string }) => {
      const body = UpdateRankingProofStatusRequestSchema.parse(
        input.status === "reviewed"
          ? {
              expectedStatus: input.proof.status,
              expectedRowVersion: input.proof.rowVersion,
              status: "reviewed"
            }
          : {
              expectedStatus: input.proof.status,
              expectedRowVersion: input.proof.rowVersion,
              status: "invalidated",
              reason: input.reason
            }
      );
      return patchJson(
        projectApiPath(projectId, `/ranking-proofs/${encodeURIComponent(input.proof.id)}/status`),
        body,
        RankingProofSchema
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ranking-proofs", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["opportunity-research-state", projectId] })
      ]);
    },
    onError: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ranking-proofs", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["opportunity-research-state", projectId] })
      ]);
    }
  });
  const queuePageProposal = useMutation({
    mutationFn: (opportunity: OpportunityExplorerOpportunity) => {
      const body = CreatePageProposalRunRequestSchema.parse({
        opportunityId: opportunity.id,
        expectedOpportunity: {
          status: opportunity.status,
          rowVersion: opportunity.rowVersion
        }
      });

      return postJson(projectApiPath(projectId, "/pages/proposals/runs"), body, PageProposalQueueResponseSchema);
    },
    onSuccess: async (response) => {
      setLatestPageProposalResponse(response);
      if (response.opportunityId) {
        setSelectedOpportunityId(response.opportunityId);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agent-runs", projectId, "page_brief_draft"] }),
        queryClient.invalidateQueries({ queryKey: ["opportunities", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["page-proposals", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["page-versions", projectId] })
      ]);
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: ["opportunities", projectId] });
    }
  });

  const opportunityRows = opportunities.data?.opportunities ?? [];
  const selectedOpportunity =
    opportunityRows.find((opportunity) => opportunity.id === selectedOpportunityId) ?? opportunityRows[0];
  const pageProposalRunsByOpportunity = useMemo(
    () => latestRunBySubject(pageProposalRuns.data?.runs ?? []),
    [pageProposalRuns.data?.runs]
  );
  const selectedPageProposalRun = selectedOpportunity
    ? pageProposalRunsByOpportunity.get(selectedOpportunity.id)
    : undefined;
  const hasActiveRun = runs.data?.runs.some(isActiveRun) ?? false;
  const hasActivePageProposalRun = pageProposalRuns.data?.runs.some(isActiveRun) ?? false;
  const opportunityResearchRuns = (runs.data?.runs ?? []).filter((run) => run.workflowName === "opportunity_research");
  const legacyScoutRuns = (runs.data?.runs ?? []).filter((run) => run.workflowName !== "opportunity_research");
  const table = useOpportunityTable(opportunityRows);

  useEffect(() => {
    if (previousActiveRun.current && !hasActiveRun) {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["opportunities", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["ranking-proofs", projectId] })
      ]);
    }

    previousActiveRun.current = hasActiveRun;
  }, [hasActiveRun, projectId, queryClient]);

  useEffect(() => {
    if (previousActivePageProposalRun.current && !hasActivePageProposalRun) {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agent-runs", projectId, "page_brief_draft"] }),
        queryClient.invalidateQueries({ queryKey: ["opportunities", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["page-proposals", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["page-versions", projectId] })
      ]);
    }

    previousActivePageProposalRun.current = hasActivePageProposalRun;
  }, [hasActivePageProposalRun, projectId, queryClient]);

  return (
    <section className="screen-grid">
      <header className="screen-header">
        <div>
          <h1>Opportunity Explorer</h1>
          <p>{projectId}</p>
        </div>
        <StatusPill
          tone={
            hasActiveRun || hasActivePageProposalRun ? "warning" : opportunityRows.length > 0 ? "success" : "neutral"
          }
        >
          {hasActiveRun
            ? "scout running"
            : hasActivePageProposalRun
              ? "proposal running"
              : `${opportunityRows.length} opportunities`}
        </StatusPill>
      </header>

      <OpportunityResearchPanel
        projectId={projectId}
        runs={opportunityResearchRuns}
        runsError={runs.isError}
        runsPending={runs.isPending}
      />

      <section className="explorer-command-strip">
        <ScoutRunForm
          maxBriefs={maxBriefs}
          isActive={hasActiveRun}
          isPending={runScout.isPending}
          onMaxBriefsChange={setMaxBriefs}
          onSubmit={() => runScout.mutate()}
        />
        <RankingProofForm
          value={proofForm}
          isPending={createProof.isPending}
          onChange={setProofForm}
          onSubmit={() => createProof.mutate()}
        />
      </section>

      {latestScoutResponse ? (
        <div className="notice notice--neutral">
          Scout response: {latestScoutResponse.status.replaceAll("_", " ")}
          {latestScoutResponse.runId ? ` (${latestScoutResponse.runId})` : ""}
        </div>
      ) : null}
      {latestProof ? (
        <div className="notice notice--neutral">
          Ranking proof recorded: {latestProof.query}, rank {latestProof.rank}
        </div>
      ) : null}
      {latestDecision ? (
        <div className="notice notice--neutral">
          Opportunity decision saved: {label(latestDecision.status)}
          {latestDecision.statusReason ? ` (${latestDecision.statusReason})` : ""}
        </div>
      ) : null}
      {latestPageProposalResponse ? (
        <div className="notice notice--neutral">
          Page proposal response: {latestPageProposalResponse.status.replaceAll("_", " ")}
          {latestPageProposalResponse.runId ? ` (${latestPageProposalResponse.runId})` : ""}
        </div>
      ) : null}
      {runScout.isError ? (
        <div className="notice notice--danger">
          {errorMessage(runScout.error, "Opportunity scout could not be queued.")}
        </div>
      ) : null}
      {createProof.isError ? (
        <div className="notice notice--danger">
          {errorMessage(createProof.error, "Ranking proof could not be recorded.")}
        </div>
      ) : null}
      {updateOpportunityDecision.isError ? (
        <div className="notice notice--danger">
          {errorMessage(updateOpportunityDecision.error, "Opportunity decision could not be saved.")}
        </div>
      ) : null}
      {queuePageProposal.isError ? (
        <div className="notice notice--danger">
          {errorMessage(queuePageProposal.error, "Page proposal could not be queued.")}
        </div>
      ) : null}

      <section className="explorer-layout">
        <OpportunityTable
          table={table}
          isPending={opportunities.isPending}
          isError={opportunities.isError}
          rowCount={opportunityRows.length}
          selectedId={selectedOpportunity?.id}
          onSelect={setSelectedOpportunityId}
        />
        <OpportunityDetail
          decisionPending={updateOpportunityDecision.isPending}
          pageProposalPending={queuePageProposal.isPending}
          pageProposalPendingOpportunityId={queuePageProposal.variables?.id}
          pageProposalRun={selectedPageProposalRun}
          pageProposalRunsPending={pageProposalRuns.isPending}
          projectId={projectId}
          opportunity={selectedOpportunity}
          onDecide={(opportunity, decision) => updateOpportunityDecision.mutate({ opportunity, decision })}
          onQueuePageProposal={(opportunity) => queuePageProposal.mutate(opportunity)}
        />
      </section>

      <section className="explorer-lower-grid">
        <AgentRunList
          emptyMessage="No legacy scout runs have been recorded."
          isError={runs.isError}
          isPending={runs.isPending}
          runs={legacyScoutRuns}
          title="Legacy scout runs"
        />
        <AgentRunList
          emptyMessage="No page proposal runs have been recorded."
          isError={pageProposalRuns.isError}
          isPending={pageProposalRuns.isPending}
          runs={pageProposalRuns.data?.runs ?? []}
          title="Page proposal runs"
        />
        <RankingProofList
          proofs={proofs.data?.proofs ?? []}
          isPending={proofs.isPending}
          isError={proofs.isError}
          mutationPending={updateRankingProof.isPending}
          onUpdate={(proof, status, reason) => updateRankingProof.mutate({ proof, status, reason })}
        />
      </section>
      {updateRankingProof.isError ? (
        <div className="notice notice--danger">
          {errorMessage(updateRankingProof.error, "Ranking proof decision could not be saved.")}
        </div>
      ) : null}
    </section>
  );
}

function useOpportunityTable(rows: OpportunityExplorerOpportunity[]) {
  const columns = useMemo(
    () => [
      opportunityColumn.accessor(
        (row) => row.research?.candidate.service ?? row.evidenceJson?.service ?? "Unknown service",
        {
          id: "service",
          header: "Service",
          cell: (info) => <strong>{info.getValue()}</strong>
        }
      ),
      opportunityColumn.accessor(
        (row) => row.research?.candidate.area ?? row.evidenceJson?.location.name ?? "Unknown Ort",
        {
          id: "location",
          header: "Ort",
          cell: (info) => info.getValue()
        }
      ),
      opportunityColumn.accessor((row) => row.research?.lane ?? row.classification, {
        id: "lane",
        header: "Lane",
        cell: (info) => (
          <StatusPill tone={classificationTone(info.getValue())}>{label(info.getValue() ?? "unclassified")}</StatusPill>
        )
      }),
      opportunityColumn.accessor((row) => row.research?.portfolioOrder ?? row.score, {
        id: "portfolio",
        header: "Portfolio",
        cell: (info) => info.getValue()?.toString() ?? "-"
      }),
      opportunityColumn.accessor(
        (row) => row.research?.evidenceReadiness ?? row.evidenceJson?.recommendedAction ?? row.status,
        {
          id: "evidence",
          header: "Evidence",
          cell: (info) => label(info.getValue())
        }
      )
    ],
    []
  );

  return useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel()
  });
}

function OpportunityTable(props: {
  table: ReturnType<typeof useOpportunityTable>;
  isPending: boolean;
  isError: boolean;
  selectedId?: string;
  onSelect: (id: string) => void;
  rowCount: number;
}) {
  if (props.isPending) {
    return <section className="table-panel">Loading opportunities</section>;
  }

  if (props.isError) {
    return <section className="notice notice--danger">Opportunities could not be loaded.</section>;
  }

  return (
    <section className="table-panel">
      <h2>Opportunities</h2>
      <div className="data-table data-table--opportunities">
        {props.table.getHeaderGroups().map((headerGroup) => (
          <div className="data-table__row data-table__row--head data-table__row--opportunity" key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <span key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</span>
            ))}
          </div>
        ))}
        {props.table.getRowModel().rows.map((row) => (
          <OpportunityRow key={row.id} onSelect={props.onSelect} row={row} selectedId={props.selectedId} />
        ))}
        {props.rowCount === 0 ? <div className="data-table__row">No opportunities yet.</div> : null}
      </div>
    </section>
  );
}

function OpportunityRow(props: {
  onSelect: (id: string) => void;
  row: Row<OpportunityExplorerOpportunity>;
  selectedId?: string;
}) {
  const isSelected = props.selectedId === props.row.original.id;

  return (
    <button
      className={`data-table__row data-table__row--opportunity data-table__row--button${
        isSelected ? " data-table__row--selected" : ""
      }`}
      type="button"
      onClick={() => props.onSelect(props.row.original.id)}
    >
      {props.row.getVisibleCells().map((cell) => (
        <span key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</span>
      ))}
    </button>
  );
}

function OpportunityDetail(props: {
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

function OpportunityDecisionForm(props: {
  opportunity: OpportunityExplorerOpportunity;
  isPending: boolean;
  onSubmit: (decision: OpportunityDecisionFormState) => void;
}) {
  const form = useForm({
    defaultValues: {
      status: props.opportunity.status === "brief_created" ? "monitoring" : props.opportunity.status,
      reason: props.opportunity.statusReason ?? ""
    } satisfies OpportunityDecisionFormState,
    onSubmit: ({ value }) => {
      if (value.status === "rejected" && normalizedReason(value.reason) === undefined) {
        return;
      }

      props.onSubmit(value);
    }
  });

  return (
    <form
      className="decision-card"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="decision-card__header">
        <h3>Operator decision</h3>
        <StatusPill tone={lifecycleTone(props.opportunity.status)}>{label(props.opportunity.status)}</StatusPill>
      </div>
      <form.Field name="status">
        {(field) => (
          <div className="decision-button-row">
            {opportunityDecisionStatuses.map((status) => (
              <button
                className={`button-secondary${field.state.value === status ? " button-secondary--active" : ""}`}
                key={status}
                type="button"
                onClick={() => field.handleChange(status)}
              >
                {decisionLabel(status)}
              </button>
            ))}
          </div>
        )}
      </form.Field>
      <form.Field name="reason">
        {(field) => (
          <label className="form-field">
            <span>Reason</span>
            <textarea
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Required when rejecting; optional for hold or monitor."
            />
          </label>
        )}
      </form.Field>
      <form.Subscribe selector={(state) => ({ isSubmitting: state.isSubmitting, values: state.values })}>
        {(state) => {
          const rejectNeedsReason =
            state.values.status === "rejected" && normalizedReason(state.values.reason) === undefined;
          return (
            <button
              className="button-primary"
              type="submit"
              disabled={props.isPending || state.isSubmitting || rejectNeedsReason}
            >
              Save decision
            </button>
          );
        }}
      </form.Subscribe>
    </form>
  );
}

function ScoutRunForm(props: {
  maxBriefs: string;
  isActive: boolean;
  isPending: boolean;
  onMaxBriefsChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="command-card"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit();
      }}
    >
      <label className="form-field">
        <span>Scout briefs</span>
        <input
          min="1"
          max="12"
          type="number"
          value={props.maxBriefs}
          onChange={(event) => props.onMaxBriefsChange(event.target.value)}
        />
      </label>
      <button className="button-primary" type="submit" disabled={props.isPending || props.isActive}>
        {props.isActive ? "Run active" : "Run scout"}
      </button>
    </form>
  );
}

function RankingProofForm(props: {
  value: RankingProofFormState;
  isPending: boolean;
  onChange: (value: RankingProofFormState) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="command-card command-card--wide"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit();
      }}
    >
      <label className="form-field">
        <span>Query</span>
        <input
          value={props.value.query}
          onChange={(event) => props.onChange({ ...props.value, query: event.target.value })}
          required
        />
      </label>
      <label className="form-field">
        <span>Page URL</span>
        <input
          type="url"
          value={props.value.pageUrl}
          onChange={(event) => props.onChange({ ...props.value, pageUrl: event.target.value })}
          required
        />
      </label>
      <label className="form-field form-field--small">
        <span>Rank</span>
        <input
          min="1"
          max="100"
          type="number"
          value={props.value.rank}
          onChange={(event) => props.onChange({ ...props.value, rank: event.target.value })}
          required
        />
      </label>
      <label className="form-field">
        <span>Note</span>
        <input
          value={props.value.notes}
          onChange={(event) => props.onChange({ ...props.value, notes: event.target.value })}
        />
      </label>
      <button className="button-secondary" type="submit" disabled={props.isPending}>
        Add proof
      </button>
    </form>
  );
}

function AgentRunList(props: {
  emptyMessage: string;
  isError: boolean;
  isPending: boolean;
  runs: AgentRunSummary[];
  title: string;
}) {
  return (
    <section className="table-panel">
      <h2>{props.title}</h2>
      {props.isPending ? <div className="notice notice--neutral">Loading runs</div> : null}
      {props.isError ? <div className="notice notice--danger">Agent runs could not be loaded.</div> : null}
      <div className="run-list">
        {props.runs.map((run) => (
          <article className="run-item" key={run.id}>
            <StatusPill tone={runStatusTone(run.status)}>{run.status}</StatusPill>
            <div>
              <strong>{run.task}</strong>
              <span>{agentRunDescription(run)}</span>
            </div>
            <span>{run.model ?? run.provider ?? "not started"}</span>
          </article>
        ))}
        {props.runs.length === 0 && !props.isPending ? (
          <div className="notice notice--neutral">{props.emptyMessage}</div>
        ) : null}
      </div>
    </section>
  );
}

function RankingProofList(props: {
  proofs: RankingProof[];
  isPending: boolean;
  isError: boolean;
  mutationPending: boolean;
  onUpdate: (proof: RankingProof, status: "reviewed" | "invalidated", reason?: string) => void;
}) {
  return (
    <section className="table-panel">
      <h2>Ranking proof</h2>
      {props.isPending ? <div className="notice notice--neutral">Loading proof</div> : null}
      {props.isError ? <div className="notice notice--danger">Ranking proof could not be loaded.</div> : null}
      <div className="run-list">
        {props.proofs.map((proof) => (
          <article className="run-item" key={proof.id}>
            <StatusPill tone={proof.rank <= 10 ? "success" : "neutral"}>{`rank ${proof.rank}`}</StatusPill>
            <div>
              <strong>{proof.query}</strong>
              <span>{safeUrlLabel(proof.pageUrl)}</span>
              <RankingProofActions isPending={props.mutationPending} proof={proof} onUpdate={props.onUpdate} />
            </div>
            <StatusPill
              tone={proof.status === "reviewed" ? "success" : proof.status === "invalidated" ? "danger" : "warning"}
            >
              {proof.status}
            </StatusPill>
          </article>
        ))}
        {props.proofs.length === 0 && !props.isPending ? (
          <div className="notice notice--neutral">No manual ranking proof has been recorded.</div>
        ) : null}
      </div>
    </section>
  );
}

function RankingProofActions(props: {
  proof: RankingProof;
  isPending: boolean;
  onUpdate: (proof: RankingProof, status: "reviewed" | "invalidated", reason?: string) => void;
}) {
  const form = useForm({
    defaultValues: { reason: "" },
    onSubmit: ({ value }) => {
      const reason = normalizedReason(value.reason);
      if (reason) props.onUpdate(props.proof, "invalidated", reason);
    }
  });

  if (props.proof.status === "captured") {
    return (
      <button
        className="button-secondary"
        disabled={props.isPending}
        type="button"
        onClick={() => props.onUpdate(props.proof, "reviewed")}
      >
        Confirm proof
      </button>
    );
  }

  if (props.proof.status !== "reviewed") return null;

  return (
    <form
      className="knowledge-reject-form"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="reason">
        {(field) => (
          <input
            aria-label={`Invalidation reason for ${props.proof.query}`}
            maxLength={2000}
            placeholder="Invalidation reason"
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.values.reason.trim().length > 0}>
        {(hasReason) => (
          <button className="button-secondary" disabled={!hasReason || props.isPending} type="submit">
            Invalidate
          </button>
        )}
      </form.Subscribe>
    </form>
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

function maxProofTier(brief: OpportunityBrief): EvidenceRef["proofTier"] {
  if (brief.evidence.some((evidence) => evidence.proofTier === "customer_safe_proof")) {
    return "customer_safe_proof";
  }

  if (brief.evidence.some((evidence) => evidence.proofTier === "supporting_context")) {
    return "supporting_context";
  }

  return "internal_signal";
}

function classificationTone(classification: string | undefined) {
  if (classification === "proven_win" || classification === "defend_advance") {
    return "success";
  }

  if (
    classification === "near_term_target" ||
    classification === "quick_win" ||
    classification === "strategic_market"
  ) {
    return "warning";
  }

  if (classification === "rejected") {
    return "danger";
  }

  return "neutral";
}

function proofTierTone(proofTier: EvidenceRef["proofTier"]) {
  if (proofTier === "customer_safe_proof") {
    return "success";
  }

  if (proofTier === "supporting_context") {
    return "warning";
  }

  return "neutral";
}

function researchEvidenceTone(readiness: NonNullable<OpportunityExplorerOpportunity["research"]>["evidenceReadiness"]) {
  if (readiness === "reviewed_proof") return "success";
  if (readiness === "supporting_context") return "warning";
  return "neutral";
}

function runStatusTone(status: AgentRunSummary["status"]) {
  if (status === "succeeded") {
    return "success";
  }

  if (status === "failed") {
    return "danger";
  }

  return "warning";
}

function latestRunBySubject(runs: AgentRunSummary[]): Map<string, AgentRunSummary> {
  const latest = new Map<string, AgentRunSummary>();

  for (const run of runs) {
    if (!run.subjectId) {
      continue;
    }

    // For page_brief_draft runs, subjectId is the source opportunity id.
    const existing = latest.get(run.subjectId);
    if (!existing || new Date(run.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
      latest.set(run.subjectId, run);
    }
  }

  return latest;
}

function isActiveRun(run: AgentRunSummary): boolean {
  return run.status === "queued" || run.status === "running";
}

function agentRunDescription(run: AgentRunSummary): string {
  if (run.failure?.message) {
    return run.failure.message;
  }

  if (run.failureCode) {
    return run.failure?.gateId ? `${run.failureCode}: ${run.failure.gateId}` : run.failureCode;
  }

  if (run.task === "page_brief_draft") {
    return run.subjectId ? `opportunity ${shortId(run.subjectId)}` : "opportunity unknown";
  }

  return `${run.opportunityCount} opportunities`;
}

function pageProposalDisabledReason(
  opportunity: OpportunityExplorerOpportunity,
  brief: OpportunityBrief,
  latestRun?: AgentRunSummary
): string | undefined {
  if (latestRun && isActiveRun(latestRun)) {
    return "A proposal run is already active for this opportunity.";
  }

  if (latestRun?.status === "succeeded") {
    return "A draft proposal already exists for this opportunity.";
  }

  if (opportunity.status === "rejected") {
    return "Rejected opportunities cannot create page proposals.";
  }

  if (opportunity.status === "brief_created") {
    return "A draft proposal already exists for this opportunity.";
  }

  if (brief.recommendedAction !== "create_page_proposal") {
    return `Recommended action is ${label(brief.recommendedAction)}.`;
  }

  return undefined;
}

function proposalButtonLabel(latestRun: AgentRunSummary | undefined, isPending: boolean, activeRun: boolean): string {
  if (isPending) {
    return "Queueing";
  }

  if (activeRun) {
    return "Run active";
  }

  if (latestRun?.status === "failed") {
    return "Retry proposal";
  }

  return "Generate proposal";
}

function lifecycleTone(status: OpportunityExplorerOpportunity["status"]) {
  if (status === "monitoring" || status === "brief_created") {
    return "success";
  }

  if (status === "held") {
    return "warning";
  }

  if (status === "rejected") {
    return "danger";
  }

  return "neutral";
}

function decisionLabel(status: OpportunityDecisionStatus): string {
  if (status === "new") {
    return "Reopen";
  }

  return label(status);
}

function normalizedReason(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function label(value: string): string {
  return value.replaceAll("_", " ");
}

function shortId(value: string): string {
  return value.length > 8 ? value.slice(0, 8) : value;
}

function numberFromForm(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function safeUrlLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}
