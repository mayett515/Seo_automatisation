import { OpportunityScoutQueueResponseSchema, type OpportunityScoutQueueResponse } from "@localseo/contracts";
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
  maxBriefs: 6,
  timeoutMs: 180_000,
  pollMs: 3_000
} as const;

type CliArgs = {
  envFile?: string;
  apiUrl: string;
  projectId: string;
  userId: string;
  maxBriefs: number;
  timeoutMs: number;
  pollMs: number;
};

type OpportunityCountRow = {
  classification: string;
  count: number;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.envFile) {
    await loadReasoningSmokeEnvFile(args.envFile);
  }
  assertOpenCodeGoSmokeConfiguration();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required so the smoke runner can poll agent_runs.");
  }

  const handle = createDatabaseClient(databaseUrl, { max: 1, idleTimeoutSeconds: 5, connectTimeoutSeconds: 5 });

  try {
    const response = await enqueueScout(args);
    console.log(`enqueue.status=${response.status}`);
    console.log(`enqueue.jobId=${response.jobId}`);

    if (response.message) {
      console.log(`enqueue.message=${redactReasoningSmokeText(response.message)}`);
    }

    if (!response.runId) {
      console.log("No agent run was created. This is expected for explicit dry-run responses.");
      return;
    }

    const run = await pollReasoningAgentRun(handle.sql, {
      projectId: args.projectId,
      runId: response.runId,
      timeoutMs: args.timeoutMs,
      pollMs: args.pollMs
    });

    printReasoningAgentRunSummary(run);
    assertRealOpportunityScoutReasoningRun(run);
    await printOpportunitySummary(handle.sql, { projectId: args.projectId, runId: run.id });
  } finally {
    await handle.close();
  }
}

async function enqueueScout(args: CliArgs): Promise<OpportunityScoutQueueResponse> {
  const endpoint = `${args.apiUrl.replace(/\/$/u, "")}/projects/${args.projectId}/opportunity-scout/runs`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": args.userId
    },
    body: JSON.stringify({ maxBriefs: args.maxBriefs })
  });

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Scout enqueue failed with HTTP ${response.status}. Check API logs for the request body.`);
  }

  return OpportunityScoutQueueResponseSchema.parse(await response.json());
}

function assertRealOpportunityScoutReasoningRun(run: ReasoningSmokeAgentRunRow): void {
  if (run.task !== "opportunity_scout") {
    throw new Error(`Expected opportunity_scout, received ${run.task}.`);
  }

  if (run.provider !== "opencode_go") {
    throw new Error(`Expected the real OpenCode Go adapter, received ${run.provider ?? "no provider"}.`);
  }

  if (!run.inputRef) {
    throw new Error("The Opportunity Scout smoke run did not persist its redacted evidence packet reference.");
  }
}

async function printOpportunitySummary(
  sql: ReasoningSmokeSqlClient,
  input: { projectId: string; runId: string }
): Promise<void> {
  const rows = await sql<OpportunityCountRow[]>`
    select
      classification,
      count(*)::int as "count"
    from opportunities
    where project_id = ${input.projectId}
      and agent_run_id = ${input.runId}
    group by classification
    order by classification
  `;

  const histogram = Object.fromEntries(rows.map((row) => [row.classification, Number(row.count)]));
  const total = Object.values(histogram).reduce((sum, count) => sum + count, 0);

  console.log(`opportunity.count=${total}`);
  console.log(`opportunity.classifications=${redactReasoningSmokeText(JSON.stringify(histogram))}`);
}

function parseArgs(args: string[]): CliArgs {
  return {
    envFile: reasoningSmokeValueAfter(args, "--env-file"),
    apiUrl: reasoningSmokeValueAfter(args, "--api-url") ?? process.env.API_PUBLIC_URL ?? defaults.apiUrl,
    projectId: reasoningSmokeValueAfter(args, "--project-id") ?? defaults.projectId,
    userId: reasoningSmokeValueAfter(args, "--user-id") ?? defaults.userId,
    maxBriefs: reasoningSmokeNumberAfter(args, "--max-briefs") ?? defaults.maxBriefs,
    timeoutMs: reasoningSmokeNumberAfter(args, "--timeout-ms") ?? defaults.timeoutMs,
    pollMs: reasoningSmokeNumberAfter(args, "--poll-ms") ?? defaults.pollMs
  };
}

void main().catch((error: unknown) => {
  console.error(redactReasoningSmokeText(error instanceof Error ? error.message : "Opportunity scout smoke failed."));
  process.exit(1);
});
