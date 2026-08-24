import { StatusPill } from "@localseo/ui";
import { errorMessage } from "../lib/error-message";
import { AgentRunList } from "../features/opportunity-explorer/agent-run-list";
import { OpportunityExplorerActionNotice } from "../features/opportunity-explorer/opportunity-explorer-action-notice";
import { OpportunityDetail } from "../features/opportunity-explorer/opportunity-explorer-detail";
import { OpportunityTable, useOpportunityTable } from "../features/opportunity-explorer/opportunity-explorer-table";
import { RankingProofForm, RankingProofList } from "../features/opportunity-explorer/ranking-proof-form";
import { ScoutRunForm } from "../features/opportunity-explorer/scout-command";
import { useOpportunityExplorerData } from "./opportunity-explorer-data";
import { OpportunityResearchPanel } from "./opportunity-research-panel";

export function OpportunityExplorerScreen(props: { projectId: string }) {
  const data = useOpportunityExplorerData(props.projectId);
  const table = useOpportunityTable(data.opportunityRows);

  return (
    <section className="screen-grid">
      <header className="screen-header">
        <div>
          <h1>Opportunity Explorer</h1>
          <p>{data.projectId}</p>
        </div>
        <StatusPill
          tone={
            data.hasActiveRun || data.hasActivePageProposalRun
              ? "warning"
              : data.opportunityRows.length > 0
                ? "success"
                : "neutral"
          }
        >
          {data.hasActiveRun
            ? "scout running"
            : data.hasActivePageProposalRun
              ? "proposal running"
              : `${data.opportunityRows.length} opportunities`}
        </StatusPill>
      </header>

      <OpportunityResearchPanel
        projectId={data.projectId}
        runs={data.opportunityResearchRuns}
        runsError={data.runs.isError}
        runsPending={data.runs.isPending}
      />

      <section className="explorer-command-strip">
        <ScoutRunForm
          maxBriefs={data.maxBriefs}
          isActive={data.hasActiveRun}
          isPending={data.runScout.isPending}
          onMaxBriefsChange={data.setMaxBriefs}
          onSubmit={() => data.runScout.mutate()}
        />
        <RankingProofForm
          value={data.proofForm}
          isPending={data.createProof.isPending}
          onChange={data.setProofForm}
          onSubmit={() => data.createProof.mutate()}
        />
      </section>

      <OpportunityExplorerActionNotice result={data.latestAction} />

      <section className="explorer-layout">
        <OpportunityTable
          table={table}
          isPending={data.opportunities.isPending}
          isError={data.opportunities.isError}
          rowCount={data.opportunityRows.length}
          selectedId={data.selectedOpportunity?.id}
          onSelect={data.setSelectedOpportunityId}
        />
        <OpportunityDetail
          decisionPending={data.updateOpportunityDecision.isPending}
          pageProposalPending={data.queuePageProposal.isPending}
          pageProposalPendingOpportunityId={data.queuePageProposal.variables?.id}
          pageProposalRun={data.selectedPageProposalRun}
          pageProposalRunsPending={data.pageProposalRuns.isPending}
          projectId={data.projectId}
          opportunity={data.selectedOpportunity}
          onDecide={(opportunity, decision) => data.updateOpportunityDecision.mutate({ opportunity, decision })}
          onQueuePageProposal={(opportunity) => data.queuePageProposal.mutate(opportunity)}
        />
      </section>

      <section className="explorer-lower-grid">
        <AgentRunList
          emptyMessage="No legacy scout runs have been recorded."
          isError={data.runs.isError}
          isPending={data.runs.isPending}
          runs={data.legacyScoutRuns}
          title="Legacy scout runs"
        />
        <AgentRunList
          emptyMessage="No page proposal runs have been recorded."
          isError={data.pageProposalRuns.isError}
          isPending={data.pageProposalRuns.isPending}
          runs={data.pageProposalRuns.data?.runs ?? []}
          title="Page proposal runs"
        />
        <RankingProofList
          proofs={data.proofs.data?.proofs ?? []}
          isPending={data.proofs.isPending}
          isError={data.proofs.isError}
          mutationPending={data.updateRankingProof.isPending}
          onUpdate={(proof, status, reason) => data.updateRankingProof.mutate({ proof, status, reason })}
        />
      </section>
      {data.updateRankingProof.isError ? (
        <div className="notice notice--danger">
          {errorMessage(data.updateRankingProof.error, "Ranking proof decision could not be saved.")}
        </div>
      ) : null}
    </section>
  );
}
