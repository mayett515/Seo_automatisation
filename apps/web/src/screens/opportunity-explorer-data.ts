import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  type AgentRunListResponse,
  type AgentRunSummary,
  type OpportunityExplorerOpportunity,
  type PageProposalQueueResponse,
  type OpportunityScoutQueueResponse,
  type RankingProof
} from "@localseo/contracts";
import { getJson, patchJson, postJson } from "../lib/api";
import { projectApiPath } from "../lib/api-path";
import { isActiveRun } from "../features/opportunity-explorer/opportunity-explorer-utils";
import type { OpportunityDecisionStatus } from "../features/opportunity-explorer/opportunity-explorer-utils";

export type RankingProofFormState = {
  query: string;
  pageUrl: string;
  rank: string;
  notes: string;
};

export type OpportunityDecisionFormState = {
  status: OpportunityDecisionStatus;
  reason: string;
};

export type OpportunityExplorerActionResult =
  | { kind: "scout_queued"; response: OpportunityScoutQueueResponse }
  | { kind: "scout_failed"; error: unknown }
  | { kind: "proof_recorded"; proof: RankingProof }
  | { kind: "proof_failed"; error: unknown }
  | { kind: "decision_saved"; opportunity: OpportunityExplorerOpportunity }
  | { kind: "decision_failed"; error: unknown }
  | { kind: "page_proposal_queued"; response: PageProposalQueueResponse }
  | { kind: "page_proposal_failed"; error: unknown };

export function normalizedReason(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function numberFromForm(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

function runListJustBecameIdle(
  previousRuns: readonly AgentRunSummary[] | undefined,
  nextRuns: readonly AgentRunSummary[]
): boolean {
  return (previousRuns?.some(isActiveRun) ?? false) && !nextRuns.some(isActiveRun);
}

export function useOpportunityExplorerData(projectId: string) {
  const queryClient = useQueryClient();
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | undefined>();
  const [maxBriefs, setMaxBriefs] = useState("8");
  const [proofForm, setProofForm] = useState<RankingProofFormState>({
    query: "",
    pageUrl: "",
    rank: "",
    notes: ""
  });
  const [latestAction, setLatestAction] = useState<OpportunityExplorerActionResult | undefined>();

  const opportunities = useQuery({
    queryKey: ["opportunities", projectId],
    queryFn: () => getJson(projectApiPath(projectId, "/opportunities"), OpportunityExplorerListResponseSchema),
    retry: false
  });
  const runs = useQuery({
    queryKey: ["agent-runs", projectId, "opportunity_scout"],
    queryFn: async ({ client, queryKey }) => {
      const previous = client.getQueryData<AgentRunListResponse>(queryKey);
      const data = await getJson(
        projectApiPath(projectId, "/agent-runs?task=opportunity_scout"),
        AgentRunListResponseSchema
      );
      if (runListJustBecameIdle(previous?.runs, data.runs)) {
        void Promise.all([
          client.invalidateQueries({ queryKey: ["opportunities", projectId] }),
          client.invalidateQueries({ queryKey: ["ranking-proofs", projectId] })
        ]);
      }
      return data;
    },
    retry: false,
    refetchInterval: (query) => {
      const active = query.state.data?.runs.some((run) => run.status === "queued" || run.status === "running");
      return active ? 3000 : false;
    }
  });
  const pageProposalRuns = useQuery({
    queryKey: ["agent-runs", projectId, "page_brief_draft"],
    queryFn: async ({ client, queryKey }) => {
      const previous = client.getQueryData<AgentRunListResponse>(queryKey);
      const data = await getJson(
        projectApiPath(projectId, "/agent-runs?task=page_brief_draft"),
        AgentRunListResponseSchema
      );
      if (runListJustBecameIdle(previous?.runs, data.runs)) {
        void Promise.all([
          client.invalidateQueries({ queryKey: ["agent-runs", projectId, "page_brief_draft"] }),
          client.invalidateQueries({ queryKey: ["opportunities", projectId] }),
          client.invalidateQueries({ queryKey: ["page-proposals", projectId] }),
          client.invalidateQueries({ queryKey: ["page-versions", projectId] })
        ]);
      }
      return data;
    },
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
      setLatestAction({ kind: "scout_queued", response });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agent-runs", projectId, "opportunity_scout"] }),
        queryClient.invalidateQueries({ queryKey: ["opportunities", projectId] })
      ]);
    },
    onError: (error) => {
      setLatestAction({ kind: "scout_failed", error });
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
      setLatestAction({ kind: "proof_recorded", proof });
      setProofForm({ query: "", pageUrl: "", rank: "", notes: "" });
      await queryClient.invalidateQueries({ queryKey: ["ranking-proofs", projectId] });
    },
    onError: (error) => {
      setLatestAction({ kind: "proof_failed", error });
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
      setLatestAction({ kind: "decision_saved", opportunity });
      setSelectedOpportunityId(opportunity.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["opportunities", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["agent-runs", projectId, "opportunity_scout"] })
      ]);
    },
    onError: async (error) => {
      setLatestAction({ kind: "decision_failed", error });
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
      setLatestAction({ kind: "page_proposal_queued", response });
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
    onError: async (error) => {
      setLatestAction({ kind: "page_proposal_failed", error });
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

  return {
    projectId,
    selectedOpportunityId,
    setSelectedOpportunityId,
    maxBriefs,
    setMaxBriefs,
    proofForm,
    setProofForm,
    latestAction,
    opportunityRows,
    selectedOpportunity,
    selectedPageProposalRun,
    hasActiveRun,
    hasActivePageProposalRun,
    opportunityResearchRuns,
    legacyScoutRuns,
    opportunities,
    runs,
    pageProposalRuns,
    proofs,
    runScout,
    createProof,
    updateOpportunityDecision,
    updateRankingProof,
    queuePageProposal
  };
}
