import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  AgentRunStatusSchema,
  OpportunityScoutQueueResponseSchema,
  type AgentRunStatus,
  type OpportunityScoutQueueResponse
} from "@localseo/contracts";
import { createDatabaseClient } from "@localseo/db";

const terminalRunStatuses = new Set<AgentRunStatus>(["succeeded", "failed"]);

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

type SqlClient = ReturnType<typeof createDatabaseClient>["sql"];

type AgentRunRow = {
  id: string;
  projectId: string;
  task: string;
  status: string;
  failureCode: string | null;
  provider: string | null;
  model: string | null;
  inputRef: string | null;
  usageJson: Record<string, unknown> | null;
  diagnosticsJson: Record<string, unknown> | null;
  latencyMs: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.envFile) {
    await loadEnvFile(args.envFile);
  }

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
      console.log(`enqueue.message=${redact(response.message)}`);
    }

    if (!response.runId) {
      console.log("No agent run was created. This is expected for explicit dry-run responses.");
      return;
    }

    const run = await pollRun(handle.sql, {
      projectId: args.projectId,
      runId: response.runId,
      timeoutMs: args.timeoutMs,
      pollMs: args.pollMs
    });

    printRunSummary(run);
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
    const body = await response.text().catch(() => "");
    throw new Error(`Scout enqueue failed with HTTP ${response.status}: ${redact(body).slice(0, 500)}`);
  }

  return OpportunityScoutQueueResponseSchema.parse(await response.json());
}

async function pollRun(
  sql: SqlClient,
  input: { projectId: string; runId: string; timeoutMs: number; pollMs: number }
): Promise<AgentRunRow> {
  const startedAt = Date.now();
  let lastStatus: string | undefined;

  while (Date.now() - startedAt <= input.timeoutMs) {
    const [run] = await sql<AgentRunRow[]>`
      select
        id,
        project_id as "projectId",
        task,
        status,
        failure_code as "failureCode",
        provider,
        model,
        input_ref as "inputRef",
        usage_json as "usageJson",
        diagnostics_json as "diagnosticsJson",
        latency_ms as "latencyMs",
        started_at as "startedAt",
        completed_at as "completedAt"
      from agent_runs
      where id = ${input.runId}
        and project_id = ${input.projectId}
      limit 1
    `;

    if (!run) {
      throw new Error(`Agent run ${input.runId} was not found.`);
    }

    const status = AgentRunStatusSchema.parse(run.status);
    if (status !== lastStatus) {
      console.log(`agent_run.status=${status}`);
      lastStatus = status;
    }

    if (terminalRunStatuses.has(status)) {
      return run;
    }

    await delay(input.pollMs);
  }

  throw new Error(`Timed out waiting for agent run ${input.runId} after ${input.timeoutMs}ms.`);
}

function printRunSummary(run: AgentRunRow): void {
  console.log(`agent_run.id=${run.id}`);
  console.log(`agent_run.status=${run.status}`);
  console.log(`agent_run.failureCode=${run.failureCode ?? ""}`);
  console.log(`agent_run.provider=${run.provider ?? ""}`);
  console.log(`agent_run.model=${run.model ?? ""}`);
  console.log(`agent_run.latencyMs=${run.latencyMs ?? ""}`);
  console.log(`agent_run.inputRef=${run.inputRef ?? ""}`);
  console.log(`agent_run.usage=${redact(JSON.stringify(run.usageJson ?? {}))}`);

  const diagnostics = recordFromUnknown(run.diagnosticsJson);
  const safeDiagnostics = {
    gateId: stringFromUnknown(diagnostics.gateId),
    message: stringFromUnknown(diagnostics.message),
    detail: stringFromUnknown(diagnostics.detail)
  };
  console.log(`agent_run.diagnostics=${redact(JSON.stringify(safeDiagnostics))}`);
}

async function loadEnvFile(path: string): Promise<void> {
  const content = await readFile(resolve(path), "utf8");
  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = stripQuotes(trimmed.slice(separator + 1).trim());
    process.env[key] = value;
  }
}

function parseArgs(args: string[]): CliArgs {
  return {
    envFile: valueAfter(args, "--env-file"),
    apiUrl: valueAfter(args, "--api-url") ?? process.env.API_PUBLIC_URL ?? defaults.apiUrl,
    projectId: valueAfter(args, "--project-id") ?? defaults.projectId,
    userId: valueAfter(args, "--user-id") ?? defaults.userId,
    maxBriefs: numberAfter(args, "--max-briefs") ?? defaults.maxBriefs,
    timeoutMs: numberAfter(args, "--timeout-ms") ?? defaults.timeoutMs,
    pollMs: numberAfter(args, "--poll-ms") ?? defaults.pollMs
  };
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

function numberAfter(args: string[], flag: string): number | undefined {
  const value = valueAfter(args, flag);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive number.`);
  }

  return parsed;
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

function redact(value: string): string {
  const secrets = [
    process.env.AI_REASONING_OPENCODE_GO_API_KEY,
    process.env.BETTER_AUTH_SECRET,
    process.env.GSC_TOKEN_ENCRYPTION_KEY,
    process.env.GSC_OAUTH_STATE_SECRET
  ].filter((secret): secret is string => typeof secret === "string" && secret.length > 0);

  return secrets.reduce((text, secret) => text.replaceAll(secret, "[redacted]"), value);
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value.slice(0, 500) : undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

void main().catch((error: unknown) => {
  console.error(redact(error instanceof Error ? error.message : "Opportunity scout smoke failed."));
  process.exit(1);
});
