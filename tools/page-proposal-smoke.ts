import {
  CreatePageProposalRunRequestSchema,
  PageProposalQueueResponseSchema,
  type PageProposalQueueResponse
} from "@localseo/contracts";
import { createDatabaseClient } from "@localseo/db";
import {
  assertOpenCodeGoSmokeConfiguration,
  loadReasoningSmokeEnvFile,
  pollReasoningAgentRun,
  printReasoningAgentRunSummary,
  reasoningSmokeNumberAfter,
  reasoningSmokeValueAfter,
  redactReasoningSmokeText,
  type ReasoningSmokeAgentRunRow,
  type ReasoningSmokeSqlClient
} from "./reasoning-smoke-support.js";

const defaults = {
  apiUrl: "http://localhost:4000",
  projectId: "11111111-1111-4111-8111-111111111111",
  userId: "00000000-0000-4000-8000-000000000000",
  opportunityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  timeoutMs: 420_000,
  pollMs: 3_000
} as const;

type CliArgs = {
  envFile?: string;
  apiUrl: string;
  projectId: string;
  userId: string;
  opportunityId: string;
  timeoutMs: number;
  pollMs: number;
};

type PageProposalSmokeRow = {
  proposalId: string;
  route: string;
  proposalStatus: string;
  proposalGenerationSource: string | null;
  proposalGenerationRunId: string | null;
  proposalPageGenerationSource: string | null;
  proposalPageGenerationRunId: string | null;
  proposalSectionsMatchGeneration: boolean;
  versionId: string;
  versionNumber: number;
  versionStatus: string;
  approvedAt: Date | null;
  versionGenerationSource: string | null;
  versionGenerationRunId: string | null;
  versionSectionsMatchGeneration: boolean;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.envFile) {
    await loadReasoningSmokeEnvFile(args.envFile);
  }
  assertOpenCodeGoSmokeConfiguration();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required so the smoke runner can verify durable Page Proposal truth.");
  }

  const handle = createDatabaseClient(databaseUrl, { max: 1, idleTimeoutSeconds: 5, connectTimeoutSeconds: 5 });

  try {
    const response = await enqueuePageProposal(args);
    console.log(`enqueue.status=${response.status}`);
    console.log(`enqueue.jobId=${response.jobId}`);

    if (response.message) {
      console.log(`enqueue.message=${redactReasoningSmokeText(response.message)}`);
    }

    if (!response.runId) {
      throw new Error("The Page Proposal smoke requires a persisted runId and real queue enqueue.");
    }

    const run = await pollReasoningAgentRun(handle.sql, {
      projectId: args.projectId,
      runId: response.runId,
      timeoutMs: args.timeoutMs,
      pollMs: args.pollMs
    });

    printReasoningAgentRunSummary(run);
    assertRealPageProposalReasoningRun(run);

    const proposalRows = await loadPageProposalRows(handle.sql, {
      projectId: args.projectId,
      opportunityId: args.opportunityId,
      runId: run.id
    });
    assertPageProposalProductTruth(run, proposalRows);
    printPageProposalSummary(proposalRows);
  } finally {
    await handle.close();
  }
}

async function enqueuePageProposal(args: CliArgs): Promise<PageProposalQueueResponse> {
  const endpoint = `${args.apiUrl.replace(/\/$/u, "")}/projects/${args.projectId}/pages/proposals/runs`;
  const body = CreatePageProposalRunRequestSchema.parse({ opportunityId: args.opportunityId });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": args.userId
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Page Proposal enqueue failed with HTTP ${response.status}. Check API logs for details.`);
  }

  return PageProposalQueueResponseSchema.parse(await response.json());
}

async function loadPageProposalRows(
  sql: ReasoningSmokeSqlClient,
  input: { projectId: string; opportunityId: string; runId: string }
): Promise<PageProposalSmokeRow[]> {
  return sql<PageProposalSmokeRow[]>`
    select
      pp.id as "proposalId",
      pp.route,
      pp.status as "proposalStatus",
      pp.proposal_json #>> '{generation,source}' as "proposalGenerationSource",
      pp.proposal_json #>> '{generation,agentRunId}' as "proposalGenerationRunId",
      pp.proposal_json #>> '{page,generation,source}' as "proposalPageGenerationSource",
      pp.proposal_json #>> '{page,generation,agentRunId}' as "proposalPageGenerationRunId",
      coalesce(
        jsonb_array_length(pp.proposal_json -> 'page' -> 'sections') > 0
        and not exists (
          select 1
          from jsonb_array_elements(pp.proposal_json -> 'page' -> 'sections') as section
          where section #>> '{generation,source}' is distinct from 'agent'
             or section #>> '{generation,agentRunId}' is distinct from ${input.runId}
        ),
        false
      ) as "proposalSectionsMatchGeneration",
      pv.id as "versionId",
      pv.version_number as "versionNumber",
      pv.status as "versionStatus",
      pv.approved_at as "approvedAt",
      pv.page_json #>> '{generation,source}' as "versionGenerationSource",
      pv.page_json #>> '{generation,agentRunId}' as "versionGenerationRunId",
      coalesce(
        jsonb_array_length(pv.page_json -> 'sections') > 0
        and not exists (
          select 1
          from jsonb_array_elements(pv.page_json -> 'sections') as section
          where section #>> '{generation,source}' is distinct from 'agent'
             or section #>> '{generation,agentRunId}' is distinct from ${input.runId}
        ),
        false
      ) as "versionSectionsMatchGeneration"
    from page_proposals pp
    inner join page_versions pv on pv.page_proposal_id = pp.id
    where pp.project_id = ${input.projectId}
      and pp.opportunity_id = ${input.opportunityId}
    order by pp.created_at, pv.version_number
  `;
}

function assertRealPageProposalReasoningRun(run: ReasoningSmokeAgentRunRow): void {
  if (run.task !== "page_brief_draft") {
    throw new Error(`Expected page_brief_draft, received ${run.task}.`);
  }

  if (run.provider !== "opencode_go") {
    throw new Error(`Expected the real OpenCode Go adapter, received ${run.provider ?? "no provider"}.`);
  }

  if (!run.inputRef) {
    throw new Error("The Page Proposal smoke run did not persist its redacted evidence packet reference.");
  }
}

function assertPageProposalProductTruth(run: ReasoningSmokeAgentRunRow, rows: readonly PageProposalSmokeRow[]): void {
  if (run.status === "failed") {
    if (rows.length > 0) {
      throw new Error("A failed Page Proposal smoke run persisted proposal/version product rows.");
    }
    return;
  }

  if (run.status !== "succeeded") {
    throw new Error(`Unexpected non-terminal Page Proposal smoke status ${run.status}.`);
  }

  if (rows.length !== 1) {
    throw new Error(
      `A succeeded first-generation smoke run must persist exactly one proposal/version row, got ${rows.length}.`
    );
  }

  const row = rows[0];
  if (!row) {
    throw new Error("Page Proposal smoke row disappeared during validation.");
  }

  if (
    row.proposalStatus !== "draft" ||
    row.versionNumber !== 1 ||
    row.versionStatus !== "preview" ||
    row.approvedAt !== null
  ) {
    throw new Error("A real reasoning smoke may persist only a draft proposal and unapproved preview version.");
  }

  if (
    row.proposalGenerationSource !== "agent" ||
    row.proposalGenerationRunId !== run.id ||
    row.proposalPageGenerationSource !== "agent" ||
    row.proposalPageGenerationRunId !== run.id ||
    row.versionGenerationSource !== "agent" ||
    row.versionGenerationRunId !== run.id ||
    !row.proposalSectionsMatchGeneration ||
    !row.versionSectionsMatchGeneration
  ) {
    throw new Error("Persisted Page Proposal generation provenance does not match the durable agent run.");
  }
}

function printPageProposalSummary(rows: readonly PageProposalSmokeRow[]): void {
  console.log(`page_proposal.count=${rows.length}`);
  const row = rows[0];
  if (!row) {
    return;
  }

  console.log(`page_proposal.id=${row.proposalId}`);
  console.log(`page_proposal.route=${row.route}`);
  console.log(`page_proposal.status=${row.proposalStatus}`);
  console.log(`page_version.id=${row.versionId}`);
  console.log(`page_version.number=${row.versionNumber}`);
  console.log(`page_version.status=${row.versionStatus}`);
  console.log(`page_version.approvedAt=${row.approvedAt?.toISOString() ?? ""}`);
}

function parseArgs(args: string[]): CliArgs {
  return {
    envFile: reasoningSmokeValueAfter(args, "--env-file"),
    apiUrl: reasoningSmokeValueAfter(args, "--api-url") ?? process.env.API_PUBLIC_URL ?? defaults.apiUrl,
    projectId: reasoningSmokeValueAfter(args, "--project-id") ?? defaults.projectId,
    userId: reasoningSmokeValueAfter(args, "--user-id") ?? defaults.userId,
    opportunityId: reasoningSmokeValueAfter(args, "--opportunity-id") ?? defaults.opportunityId,
    timeoutMs: reasoningSmokeNumberAfter(args, "--timeout-ms") ?? defaults.timeoutMs,
    pollMs: reasoningSmokeNumberAfter(args, "--poll-ms") ?? defaults.pollMs
  };
}

void main().catch((error: unknown) => {
  console.error(redactReasoningSmokeText(error instanceof Error ? error.message : "Page Proposal smoke failed."));
  process.exit(1);
});
