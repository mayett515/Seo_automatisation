import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable, type Row } from "@tanstack/react-table";
import { StatusPill } from "@localseo/ui";
import {
  AgentRunListResponseSchema,
  OpportunityExplorerListResponseSchema,
  OpportunityScoutQueueResponseSchema,
  RankingProofListResponseSchema,
  RankingProofSchema,
  type AgentRunSummary,
  type EvidenceRef,
  type OpportunityBrief,
  type OpportunityExplorerOpportunity,
  type OpportunityScoutQueueResponse,
  type RankingProof
} from "@localseo/contracts";
import { getJson, postJson } from "../lib/api";

type RankingProofFormState = {
  query: string;
  pageUrl: string;
  rank: string;
  notes: string;
};

const opportunityColumn = createColumnHelper<OpportunityExplorerOpportunity>();

export function OpportunityExplorerScreen() {
  const projectId = useProjectId();
  const queryClient = useQueryClient();
  const previousActiveRun = useRef(false);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | undefined>();
  const [maxBriefs, setMaxBriefs] = useState("8");
  const [proofForm, setProofForm] = useState<RankingProofFormState>({
    query: "",
    pageUrl: "",
    rank: "",
    notes: ""
  });
  const [latestScoutResponse, setLatestScoutResponse] = useState<OpportunityScoutQueueResponse | undefined>();
  const [latestProof, setLatestProof] = useState<RankingProof | undefined>();

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

  const opportunityRows = opportunities.data?.opportunities ?? [];
  const proofRows = proofs.data?.proofs ?? [];
  const runRows = runs.data?.runs ?? [];
  const selectedOpportunity =
    opportunityRows.find((opportunity) => opportunity.id === selectedOpportunityId) ?? opportunityRows[0];
  const hasActiveRun = runRows.some((run) => run.status === "queued" || run.status === "running");
  const workflowState = getWorkflowState({
    opportunityCount: opportunityRows.length,
    proofCount: proofRows.length,
    runCount: runRows.length,
    hasActiveRun
  });
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

  return (
    <section className="screen-grid opportunity-screen">
      <header className="opportunity-hero">
        <div className="opportunity-hero__copy">
          <span className="eyebrow">AI-assisted Local SEO mission control</span>
          <h1>Opportunity Explorer</h1>
          <p>
            Turn project evidence, manual ranking proof, and scout runs into reviewable service-location opportunities.
          </p>
          <div className="chip-row">
            <span>{`Project ${shortId(projectId)}`}</span>
            <span>GSC stays internal radar</span>
            <span>Proof requires rank evidence</span>
          </div>
        </div>
        <article className="workflow-status-card">
          <StatusPill tone={workflowState.tone}>{workflowState.label}</StatusPill>
          <strong>{workflowState.title}</strong>
          <span>{workflowState.description}</span>
        </article>
      </header>

      <section className="opportunity-summary-grid" aria-label="Opportunity scout summary">
        <Metric title="Opportunities" value={opportunityRows.length.toString()} />
        <Metric title="Ranking proof" value={proofRows.length.toString()} />
        <Metric title="Scout runs" value={runRows.length.toString()} />
        <Metric title="Active work" value={hasActiveRun ? "Running" : "Idle"} />
      </section>

      <section className="workflow-strip" aria-label="Opportunity workflow">
        <WorkflowStep index="1" title="Evidence" description="Record proof or load project-owned signals." />
        <WorkflowStep index="2" title="Scout" description="AI proposes; contracts and QA decide what persists." />
        <WorkflowStep index="3" title="Review" description="Inspect the brief, proof tier, risk, and next action." />
      </section>

      <section className="explorer-command-strip">
        <ScoutRunForm
          maxBriefs={maxBriefs}
          isActive={hasActiveRun}
          isPending={runScout.isPending}
          proofCount={proofRows.length}
          onMaxBriefsChange={setMaxBriefs}
          onSubmit={() => runScout.mutate()}
        />
        <RankingProofForm
          value={proofForm}
          isPending={createProof.isPending}
          proofCount={proofRows.length}
          onChange={setProofForm}
          onSubmit={() => createProof.mutate()}
        />
      </section>

      {latestScoutResponse ? (
        <div className="notice notice--neutral">
          <strong>{scoutResponseTitle(latestScoutResponse)}</strong>
          <span>{scoutResponseDescription(latestScoutResponse)}</span>
        </div>
      ) : null}
      {latestProof ? (
        <div className="notice notice--neutral">
          Ranking proof recorded: {latestProof.query}, rank {latestProof.rank}
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

      <section className="explorer-layout">
        <OpportunityTable
          table={table}
          isPending={opportunities.isPending}
          isError={opportunities.isError}
          hasProof={proofRows.length > 0}
          hasRuns={runRows.length > 0}
          isScoutActive={hasActiveRun}
          rowCount={opportunityRows.length}
          selectedId={selectedOpportunity?.id}
          onSelect={setSelectedOpportunityId}
        />
        <OpportunityDetail
          opportunity={selectedOpportunity}
          hasProof={proofRows.length > 0}
          hasRuns={runRows.length > 0}
        />
      </section>

      <section className="explorer-lower-grid">
        <AgentRunList runs={runRows} isPending={runs.isPending} isError={runs.isError} />
        <RankingProofList proofs={proofRows} isPending={proofs.isPending} isError={proofs.isError} />
      </section>
    </section>
  );
}

function useOpportunityTable(rows: OpportunityExplorerOpportunity[]) {
  const columns = useMemo(
    () => [
      opportunityColumn.accessor((row) => row.evidenceJson?.service ?? "Unknown service", {
        id: "service",
        header: "Service",
        cell: (info) => <strong>{info.getValue()}</strong>
      }),
      opportunityColumn.accessor((row) => row.evidenceJson?.location.name ?? "Unknown Ort", {
        id: "location",
        header: "Ort",
        cell: (info) => info.getValue()
      }),
      opportunityColumn.accessor("classification", {
        header: "Class",
        cell: (info) => <StatusPill tone={classificationTone(info.getValue())}>{label(info.getValue())}</StatusPill>
      }),
      opportunityColumn.accessor("score", {
        header: "Score",
        cell: (info) => info.getValue().toString()
      }),
      opportunityColumn.accessor((row) => row.evidenceJson?.recommendedAction ?? row.status, {
        id: "action",
        header: "Next",
        cell: (info) => label(info.getValue())
      })
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
  hasProof: boolean;
  hasRuns: boolean;
  isScoutActive: boolean;
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
        {props.rowCount === 0 ? (
          <OpportunityEmptyState
            hasProof={props.hasProof}
            hasRuns={props.hasRuns}
            isScoutActive={props.isScoutActive}
          />
        ) : null}
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
  hasProof: boolean;
  hasRuns: boolean;
}) {
  const brief = props.opportunity?.evidenceJson;

  if (!props.opportunity) {
    return (
      <section className="detail-panel">
        <h2>Review panel</h2>
        <div className="guided-empty-state guided-empty-state--compact">
          <strong>{emptyDetailTitle(props.hasProof, props.hasRuns)}</strong>
          <span>{emptyDetailDescription(props.hasProof, props.hasRuns)}</span>
        </div>
      </section>
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
        <Metric title="Risk" value={brief.cannibalizationRisk.level} />
        <Metric title="Confidence" value={`${Math.round(brief.confidence * 100)}%`} />
      </div>

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

function ScoutRunForm(props: {
  maxBriefs: string;
  isActive: boolean;
  isPending: boolean;
  proofCount: number;
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
      <div className="command-card__copy">
        <span className="eyebrow">Scout</span>
        <strong>Run opportunity scout</strong>
        <p>
          Uses project evidence and ranking proof to create validated opportunity briefs. The worker cannot publish or
          deploy anything.
        </p>
        <p>
          This button does not search Google from the browser. A real run needs the API queue, worker, Redis, and AI
          provider env configured.
        </p>
        <span className="muted-text">
          {props.proofCount > 0 ? `${props.proofCount} proof rows available.` : "Optional: add manual proof first."}
        </span>
      </div>
      <label className="form-field">
        <span>Brief cap</span>
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
  proofCount: number;
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
      <div className="command-card__copy">
        <span className="eyebrow">Proof</span>
        <strong>Record manual ranking proof</strong>
        <p>
          This form does not search Google. Use it after you manually checked a SERP and saw the project page ranking.
          GSC impressions alone never become customer-safe proof.
        </p>
        <span className="muted-text">{`${props.proofCount} proof rows recorded.`}</span>
      </div>
      <label className="form-field">
        <span>Query</span>
        <small className="field-help">What you searched, for example "dachdecker dachau".</small>
        <input
          placeholder="dachdecker dachau"
          value={props.value.query}
          onChange={(event) => props.onChange({ ...props.value, query: event.target.value })}
          required
        />
      </label>
      <label className="form-field">
        <span>Page URL</span>
        <small className="field-help">The project/customer page that ranked. Not a competitor page.</small>
        <input
          placeholder="https://example.com/dachdecker-dachau/"
          type="url"
          value={props.value.pageUrl}
          onChange={(event) => props.onChange({ ...props.value, pageUrl: event.target.value })}
          required
        />
      </label>
      <label className="form-field form-field--small">
        <span>Rank</span>
        <small className="field-help">The position you saw manually.</small>
        <input
          placeholder="7"
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
        <small className="field-help">Optional context, such as device, city, or manual check note.</small>
        <input
          placeholder="manual desktop check"
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

function AgentRunList(props: { runs: AgentRunSummary[]; isPending: boolean; isError: boolean }) {
  return (
    <section className="table-panel">
      <h2>Agent runs</h2>
      {props.isPending ? <div className="notice notice--neutral">Loading runs</div> : null}
      {props.isError ? <div className="notice notice--danger">Agent runs could not be loaded.</div> : null}
      <div className="run-list">
        {props.runs.map((run) => (
          <article className="run-item" key={run.id}>
            <StatusPill tone={runStatusTone(run.status)}>{run.status}</StatusPill>
            <div>
              <strong>{run.task}</strong>
              <span>{run.failure?.message ?? run.failureCode ?? `${run.opportunityCount} opportunities`}</span>
            </div>
            <span>{run.model ?? run.provider ?? "not started"}</span>
          </article>
        ))}
        {props.runs.length === 0 && !props.isPending ? (
          <div className="notice notice--neutral">No scout runs have been recorded.</div>
        ) : null}
      </div>
    </section>
  );
}

function RankingProofList(props: { proofs: RankingProof[]; isPending: boolean; isError: boolean }) {
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
            </div>
            <span>{new Date(proof.capturedAt).toLocaleDateString()}</span>
          </article>
        ))}
        {props.proofs.length === 0 && !props.isPending ? (
          <div className="notice notice--neutral">No manual ranking proof has been recorded.</div>
        ) : null}
      </div>
    </section>
  );
}

function OpportunityEmptyState(props: { hasProof: boolean; hasRuns: boolean; isScoutActive: boolean }) {
  return (
    <div className="guided-empty-state guided-empty-state--table">
      <strong>{emptyTableTitle(props.hasProof, props.hasRuns, props.isScoutActive)}</strong>
      <span>{emptyTableDescription(props.hasProof, props.hasRuns, props.isScoutActive)}</span>
      <ol>
        <li>Record proof when you have a real rank check.</li>
        <li>Run the scout to generate structured opportunity briefs.</li>
        <li>Review evidence, proof tier, cannibalization risk, and next action before deciding.</li>
      </ol>
    </div>
  );
}

function WorkflowStep(props: { index: string; title: string; description: string }) {
  return (
    <article className="workflow-step">
      <span>{props.index}</span>
      <div>
        <strong>{props.title}</strong>
        <p>{props.description}</p>
      </div>
    </article>
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

function getWorkflowState(input: {
  opportunityCount: number;
  proofCount: number;
  runCount: number;
  hasActiveRun: boolean;
}): { label: string; title: string; description: string; tone: "neutral" | "success" | "warning" | "danger" } {
  if (input.hasActiveRun) {
    return {
      label: "Scout running",
      title: "Worker is classifying evidence",
      description: "The list refreshes when the run completes.",
      tone: "warning"
    };
  }

  if (input.opportunityCount > 0) {
    return {
      label: `${input.opportunityCount} opportunities`,
      title: "Ready for operator review",
      description: "Select a row to inspect proof, risk, and next action.",
      tone: "success"
    };
  }

  if (input.proofCount > 0) {
    return {
      label: "Proof ready",
      title: "Evidence exists, scout has not produced cards",
      description: "Run the scout to turn evidence into reviewable opportunities.",
      tone: "neutral"
    };
  }

  if (input.runCount > 0) {
    return {
      label: "No new cards",
      title: "Scout ran, but nothing persisted",
      description: "Check the run ledger below for failure details or duplicate signals.",
      tone: "neutral"
    };
  }

  return {
    label: "Start with evidence",
    title: "No scout work recorded yet",
    description: "Add proof when available, then run the scout.",
    tone: "neutral"
  };
}

function scoutResponseTitle(response: OpportunityScoutQueueResponse): string {
  if (response.status === "dry_run") {
    return "Scout was not queued";
  }

  if (response.status === "already_active") {
    return "Scout is already active";
  }

  return `Scout ${label(response.status)}`;
}

function scoutResponseDescription(response: OpportunityScoutQueueResponse): string {
  if (response.status === "dry_run") {
    return "The local queue is not configured, so no worker run was created. This is expected in scaffold mode.";
  }

  if (response.status === "already_active") {
    return response.runId
      ? `Run ${shortId(response.runId)} is already queued or running for this project.`
      : "A scout run is already queued or running for this project.";
  }

  if (response.runId) {
    return `Run ${shortId(response.runId)} was accepted. The run list will refresh while the worker processes it.`;
  }

  return "The request completed. Check the run list for the worker status.";
}

function emptyTableTitle(hasProof: boolean, hasRuns: boolean, isScoutActive: boolean): string {
  if (isScoutActive) {
    return "Scout is running";
  }

  if (hasProof) {
    return "Proof is available, but no opportunities exist yet";
  }

  if (hasRuns) {
    return "No persisted opportunities from the last scout";
  }

  return "No opportunities yet";
}

function emptyTableDescription(hasProof: boolean, hasRuns: boolean, isScoutActive: boolean): string {
  if (isScoutActive) {
    return "The table will refresh after the worker finishes and QA accepts the output.";
  }

  if (hasProof) {
    return "Run the scout to classify that evidence into proven wins, near-term targets, or internal radar.";
  }

  if (hasRuns) {
    return "The run history explains whether QA rejected output, the provider failed, or the scout found duplicates.";
  }

  return "This page starts empty by design. The app needs project-owned evidence before it can show opportunity cards.";
}

function emptyDetailTitle(hasProof: boolean, hasRuns: boolean): string {
  if (hasProof) {
    return "Run scout, then select a card";
  }

  if (hasRuns) {
    return "Check the run ledger";
  }

  return "Evidence review appears here";
}

function emptyDetailDescription(hasProof: boolean, hasRuns: boolean): string {
  if (hasProof) {
    return "Recorded proof is listed below. The detail panel fills after a scout run creates a contract-valid brief.";
  }

  if (hasRuns) {
    return "When a run produces no cards, use the run list to see whether this was a duplicate, QA rejection, or provider issue.";
  }

  return "Once opportunities exist, this panel shows the evidence stack, missing evidence, competitor observations, and corridor context.";
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

function classificationTone(classification: OpportunityExplorerOpportunity["classification"]) {
  if (classification === "proven_win") {
    return "success";
  }

  if (classification === "near_term_target") {
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

function runStatusTone(status: AgentRunSummary["status"]) {
  if (status === "succeeded") {
    return "success";
  }

  if (status === "failed") {
    return "danger";
  }

  return "warning";
}

function label(value: string): string {
  return value.replaceAll("_", " ");
}

function numberFromForm(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${fallback} ${error.message}`;
  }

  return fallback;
}

function safeUrlLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function shortId(value: string): string {
  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function useProjectId(): string {
  const params = useParams({ strict: false });
  return typeof params.projectId === "string" ? params.projectId : "demo-project";
}

function projectApiPath(projectId: string, suffix: string): string {
  return `/projects/${encodeURIComponent(projectId)}${suffix}`;
}
