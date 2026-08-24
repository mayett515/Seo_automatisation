import { randomUUID } from "node:crypto";
import {
  PageProposalDetailSchema,
  PageProposalJobDataSchema,
  PageProposalListResponseSchema,
  PageProposalQueueResponseSchema,
  queueJobNames,
  type CreatePageProposalRunRequest,
  type PageProposalDetail,
  type PageProposalListResponse,
  type PageProposalQueueResponse
} from "@localseo/contracts";
import { agentRuns, isDatabaseUniqueViolation } from "@localseo/db";
import { DatabaseService } from "../../database/database.service.js";
import { QueueProducerService } from "../../queue-producer.js";
import {
  activePageProposalResponse,
  assertPageProposalTargetAdmission,
  findActivePageProposalRun,
  loadPageProposal,
  lockAndLoadPageProposalTarget,
  markPageProposalQueueFailure,
  normalizePageProposalQueueFailure,
  pageProposalSummaryToResponse,
  pageVersionSummaryToResponse,
  parseStoredProposalJson,
  selectPageProposalRows,
  selectPageVersionCountsByProposal,
  selectPageVersionRows
} from "./page-aggregate-store.js";

export class PageProposalCapability {
  constructor(
    private readonly database: DatabaseService,
    private readonly queues: QueueProducerService
  ) {}

  async listPageProposals(projectId: string): Promise<PageProposalListResponse> {
    const db = this.database.requireDb();
    const [proposalRows, versionCounts] = await Promise.all([
      selectPageProposalRows(db, projectId),
      selectPageVersionCountsByProposal(db, projectId)
    ]);

    return PageProposalListResponseSchema.parse({
      projectId,
      pageProposals: proposalRows.map((row) => pageProposalSummaryToResponse(row, versionCounts.get(row.id) ?? 0))
    });
  }

  async queuePageProposal(
    projectId: string,
    input: CreatePageProposalRunRequest,
    userId?: string
  ): Promise<PageProposalQueueResponse> {
    if (!this.database.isConfigured()) {
      return PageProposalQueueResponseSchema.parse({
        jobId: randomUUID(),
        projectId,
        type: "page_generation",
        status: "dry_run",
        opportunityId: input.opportunityId,
        createdBy: userId,
        message: "Database is not configured. Page proposal persistence is in explicit dry-run mode.",
        createdAt: new Date().toISOString()
      });
    }

    const db = this.database.requireDb();

    if (!this.queues.isQueueConfigured("page-generation")) {
      await db.transaction(async (tx) => {
        const opportunity = await lockAndLoadPageProposalTarget(tx, projectId, input.opportunityId);
        assertPageProposalTargetAdmission(input.expectedOpportunity, opportunity);
      });

      const jobId = randomUUID();
      const jobData = PageProposalJobDataSchema.parse({
        projectId,
        runId: jobId,
        opportunityId: input.opportunityId,
        triggeredByUserId: userId ?? null,
        triggerSource: "user_action"
      });

      await this.queues.enqueue({
        queueName: "page-generation",
        jobName: queueJobNames["page-generation"],
        jobId,
        data: jobData,
        audit: {
          projectId,
          type: "page_generation",
          inputRef: jobId,
          actorType: userId ? "user" : "system",
          actorUserId: userId,
          triggerSource: "user_action"
        }
      });

      return PageProposalQueueResponseSchema.parse({
        jobId,
        projectId,
        type: "page_generation",
        status: "dry_run",
        runId: undefined,
        opportunityId: input.opportunityId,
        inputRef: jobId,
        createdBy: userId,
        message: "Page generation queue is not configured. This is an explicit dry-run response.",
        createdAt: new Date().toISOString()
      });
    }

    const runId = randomUUID();
    let activeRun: typeof agentRuns.$inferSelect | undefined;

    try {
      activeRun = await db.transaction(async (tx) => {
        const opportunity = await lockAndLoadPageProposalTarget(tx, projectId, input.opportunityId);
        assertPageProposalTargetAdmission(input.expectedOpportunity, opportunity);

        const currentActiveRun = await findActivePageProposalRun(tx, projectId, input.opportunityId);
        if (currentActiveRun) {
          return currentActiveRun;
        }

        await tx.insert(agentRuns).values({
          id: runId,
          projectId,
          subjectId: input.opportunityId,
          task: "page_brief_draft",
          status: "queued",
          diagnosticsJson: {
            opportunityId: input.opportunityId,
            admittedOpportunity: opportunity
          }
        });

        return undefined;
      });
    } catch (error) {
      if (isDatabaseUniqueViolation(error)) {
        const conflictingRun = await db.transaction(async (tx) => {
          const opportunity = await lockAndLoadPageProposalTarget(tx, projectId, input.opportunityId);
          assertPageProposalTargetAdmission(input.expectedOpportunity, opportunity);
          return findActivePageProposalRun(tx, projectId, input.opportunityId);
        });
        if (conflictingRun) {
          return activePageProposalResponse(conflictingRun);
        }
      }

      throw error;
    }

    if (activeRun) {
      return activePageProposalResponse(activeRun);
    }

    let enqueued: boolean;

    try {
      enqueued = await this.queues.enqueue({
        queueName: "page-generation",
        jobName: queueJobNames["page-generation"],
        jobId: runId,
        data: PageProposalJobDataSchema.parse({
          projectId,
          runId,
          opportunityId: input.opportunityId,
          triggeredByUserId: userId ?? null,
          triggerSource: "user_action"
        }),
        options: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000
          }
        },
        audit: {
          projectId,
          type: "page_generation",
          inputRef: runId,
          actorType: userId ? "user" : "system",
          actorUserId: userId,
          triggerSource: "user_action"
        }
      });
    } catch (error) {
      await markPageProposalQueueFailure(db, runId, "queue_enqueue_failed", normalizePageProposalQueueFailure(error));
      throw error;
    }

    if (!enqueued) {
      await markPageProposalQueueFailure(
        db,
        runId,
        "queue_not_configured",
        "Page generation queue was not configured after run creation."
      );
    }

    return PageProposalQueueResponseSchema.parse({
      jobId: runId,
      projectId,
      runId,
      opportunityId: input.opportunityId,
      type: "page_generation",
      status: enqueued ? "queued" : "dry_run",
      inputRef: runId,
      createdBy: userId,
      message: enqueued ? undefined : "Page generation queue is not configured. This is an explicit dry-run response.",
      createdAt: new Date().toISOString()
    });
  }

  async getPageProposal(projectId: string, pageProposalId: string): Promise<PageProposalDetail> {
    const proposal = await loadPageProposal(this.database.requireDb(), projectId, pageProposalId);
    const versions = await selectPageVersionRows(this.database.requireDb(), projectId, { pageProposalId });
    const proposalJson = parseStoredProposalJson(proposal);

    return PageProposalDetailSchema.parse({
      ...pageProposalSummaryToResponse(proposal, versions.length),
      proposalJson,
      versions: versions.map((row) => pageVersionSummaryToResponse(row))
    });
  }
}
