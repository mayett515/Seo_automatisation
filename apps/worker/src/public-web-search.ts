import { DuckDuckGoHtmlSearchAdapter, DuckDuckGoHtmlSearchError, normalizeDuckDuckGoLocale } from "@localseo/adapters";
import type { PublicWebSearchPort } from "@localseo/ai";
import {
  PublicWebSearchCaptureSchema,
  PublicWebSearchRequestSchema,
  type PublicWebSearchCapture,
  type PublicWebSearchFailureCode,
  type PublicWebSearchRequest
} from "@localseo/contracts";
import { agentRuns, publicWebSearchCaptures, type DatabaseClient } from "@localseo/db";
import { and, eq, sql } from "@localseo/db/query";

export class PersistedDuckDuckGoPublicWebSearch implements PublicWebSearchPort {
  constructor(
    private readonly db: DatabaseClient,
    private readonly provider: DuckDuckGoHtmlSearchAdapter,
    private readonly enabled = true
  ) {}

  async search(value: PublicWebSearchRequest): Promise<PublicWebSearchCapture> {
    const input = PublicWebSearchRequestSchema.parse(value);
    await this.assertCurrentExecution(input);
    const existing = await this.loadExisting(input);
    if (existing) return existing;

    const capturedAt = new Date();
    let values:
      | {
          status: "succeeded";
          failureCode: null;
          effectiveLocale: string;
          observedLocale?: string;
          results: PublicWebSearchCapture["results"];
        }
      | { status: "failed"; failureCode: PublicWebSearchFailureCode; effectiveLocale: string; results: [] };
    try {
      if (!this.enabled) {
        throw new DuckDuckGoHtmlSearchError("Public web search is disabled by runtime policy.", "policy_denied");
      }
      const result = await this.provider.search(input);
      values = {
        status: "succeeded",
        failureCode: null,
        effectiveLocale: result.effectiveLocale,
        observedLocale: result.observedLocale,
        results: result.results
      };
    } catch (error) {
      values = {
        status: "failed",
        failureCode: error instanceof DuckDuckGoHtmlSearchError ? error.code : "provider_unavailable",
        effectiveLocale: normalizeDuckDuckGoLocale(input.requestedLocale, input.requestedRegion),
        results: []
      };
    }

    await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT "id" FROM "agent_runs" WHERE "id" = ${input.runId} AND "project_id" = ${input.projectId} FOR UPDATE`
      );
      const [run] = await tx
        .select({
          status: agentRuns.status,
          workflowName: agentRuns.workflowName,
          executionEpoch: agentRuns.executionEpoch
        })
        .from(agentRuns)
        .where(and(eq(agentRuns.id, input.runId), eq(agentRuns.projectId, input.projectId)))
        .limit(1);
      if (
        !run ||
        run.workflowName !== "opportunity_research" ||
        run.status !== "running" ||
        run.executionEpoch !== input.executionEpoch
      ) {
        throw new Error("Public web search execution no longer owns the Opportunity Research workflow.");
      }
      await tx
        .insert(publicWebSearchCaptures)
        .values({
          projectId: input.projectId,
          agentRunId: input.runId,
          executionEpoch: input.executionEpoch,
          query: input.query,
          requestedLocale: input.requestedLocale,
          requestedRegion: input.requestedRegion,
          maxResults: input.maxResults,
          effectiveLocale: values.effectiveLocale,
          observedLocale: "observedLocale" in values ? values.observedLocale : undefined,
          researchOrdinal: input.researchOrdinal,
          round: input.round,
          status: values.status,
          failureCode: values.failureCode,
          resultsJson: values.results,
          capturedAt
        })
        .onConflictDoNothing();
    });
    const stored = await this.loadExisting(input);
    if (!stored) throw new Error("Public web-search capture could not be persisted.");
    return stored;
  }

  private async loadExisting(input: PublicWebSearchRequest): Promise<PublicWebSearchCapture | undefined> {
    const [row] = await this.db
      .select()
      .from(publicWebSearchCaptures)
      .where(
        and(
          eq(publicWebSearchCaptures.agentRunId, input.runId),
          eq(publicWebSearchCaptures.researchOrdinal, input.researchOrdinal)
        )
      )
      .limit(1);
    if (!row) return undefined;
    if (
      row.projectId !== input.projectId ||
      row.query !== input.query ||
      row.requestedLocale !== input.requestedLocale ||
      (row.requestedRegion ?? undefined) !== input.requestedRegion ||
      row.maxResults !== input.maxResults ||
      row.round !== input.round
    ) {
      throw new Error("Public web-search ordinal replay changed its request identity.");
    }
    return PublicWebSearchCaptureSchema.parse({
      id: row.id,
      projectId: row.projectId,
      runId: row.agentRunId,
      executionEpoch: row.executionEpoch,
      query: row.query,
      provider: row.provider,
      requestedLocale: row.requestedLocale,
      requestedRegion: row.requestedRegion ?? undefined,
      maxResults: row.maxResults,
      effectiveLocale: row.effectiveLocale,
      observedLocale: row.observedLocale ?? undefined,
      researchOrdinal: row.researchOrdinal,
      round: row.round,
      status: row.status,
      failureCode: row.failureCode ?? undefined,
      results: row.resultsJson,
      evidencePolicy: row.evidencePolicy,
      capturedAt: row.capturedAt.toISOString()
    });
  }

  private async assertCurrentExecution(input: PublicWebSearchRequest): Promise<void> {
    const [run] = await this.db
      .select({
        status: agentRuns.status,
        workflowName: agentRuns.workflowName,
        executionEpoch: agentRuns.executionEpoch
      })
      .from(agentRuns)
      .where(and(eq(agentRuns.id, input.runId), eq(agentRuns.projectId, input.projectId)))
      .limit(1);
    if (
      !run ||
      run.workflowName !== "opportunity_research" ||
      run.status !== "running" ||
      run.executionEpoch !== input.executionEpoch
    ) {
      throw new Error("Public web search requires the current Opportunity Research execution epoch.");
    }
  }
}
