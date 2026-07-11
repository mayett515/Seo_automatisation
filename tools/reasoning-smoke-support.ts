import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AgentRunFailureCodeSchema, AgentRunStatusSchema, type AgentRunStatus } from "@localseo/contracts";
import { createDatabaseClient } from "@localseo/db";

const terminalRunStatuses = new Set<AgentRunStatus>(["succeeded", "failed"]);

export type ReasoningSmokeSqlClient = ReturnType<typeof createDatabaseClient>["sql"];

export type ReasoningSmokeAgentRunRow = {
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

export async function loadReasoningSmokeEnvFile(path: string): Promise<void> {
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

export function assertOpenCodeGoSmokeConfiguration(): void {
  if (process.env.AI_REASONING_PROVIDER !== "opencode_go") {
    throw new Error("AI_REASONING_PROVIDER must be opencode_go for a real-provider smoke run.");
  }

  if (!process.env.AI_REASONING_OPENCODE_GO_API_KEY) {
    throw new Error("AI_REASONING_OPENCODE_GO_API_KEY is required for a real-provider smoke run.");
  }

  if (!process.env.AI_REASONING_MODEL) {
    throw new Error("AI_REASONING_MODEL is required for a real-provider smoke run.");
  }
}

export async function pollReasoningAgentRun(
  sql: ReasoningSmokeSqlClient,
  input: { projectId: string; runId: string; timeoutMs: number; pollMs: number }
): Promise<ReasoningSmokeAgentRunRow> {
  const startedAt = Date.now();
  let lastStatus: string | undefined;

  while (Date.now() - startedAt <= input.timeoutMs) {
    const [run] = await sql<ReasoningSmokeAgentRunRow[]>`
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
    if (run.failureCode) {
      AgentRunFailureCodeSchema.parse(run.failureCode);
    }

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

export function printReasoningAgentRunSummary(run: ReasoningSmokeAgentRunRow): void {
  console.log(`agent_run.id=${run.id}`);
  console.log(`agent_run.status=${run.status}`);
  console.log(`agent_run.failureCode=${run.failureCode ?? ""}`);
  console.log(`agent_run.provider=${run.provider ?? ""}`);
  console.log(`agent_run.model=${run.model ?? ""}`);
  console.log(`agent_run.latencyMs=${run.latencyMs ?? ""}`);
  console.log(`agent_run.inputRef=${run.inputRef ?? ""}`);
  console.log(`agent_run.usage=${redactReasoningSmokeText(JSON.stringify(run.usageJson ?? {}))}`);

  const diagnostics = recordFromUnknown(run.diagnosticsJson);
  const safeDiagnostics = {
    gateId: stringFromUnknown(diagnostics.gateId),
    message: stringFromUnknown(diagnostics.message),
    detail: stringFromUnknown(diagnostics.detail)
  };
  console.log(`agent_run.diagnostics=${redactReasoningSmokeText(JSON.stringify(safeDiagnostics))}`);
}

export function reasoningSmokeValueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

export function reasoningSmokeNumberAfter(args: readonly string[], flag: string): number | undefined {
  const value = reasoningSmokeValueAfter(args, flag);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive number.`);
  }

  return parsed;
}

export function redactReasoningSmokeText(value: string): string {
  const secrets = [
    process.env.AI_REASONING_OPENCODE_GO_API_KEY,
    process.env.BETTER_AUTH_SECRET,
    process.env.GSC_TOKEN_ENCRYPTION_KEY,
    process.env.GSC_OAUTH_STATE_SECRET,
    process.env.DATABASE_URL,
    process.env.REDIS_URL
  ].filter((secret): secret is string => typeof secret === "string" && secret.length > 0);

  return secrets.reduce((text, secret) => text.replaceAll(secret, "[redacted]"), value);
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
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
