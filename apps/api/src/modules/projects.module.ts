import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  Param,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import {
  type AiReasoningEnqueueFailureCode,
  CreateOpportunityScoutRunRequestSchema,
  CreateSerpScoutRunRequestSchema,
  CreateWebsiteImportRequestSchema,
  LatestWebsiteImportResponseSchema,
  MainPreviewSchema,
  OpportunityScoutJobDataSchema,
  OpportunityScoutQueueResponseSchema,
  ProjectSummarySchema,
  SerpScoutJobDataSchema,
  SerpScoutQueueResponseSchema,
  WebsiteImportRunSchema,
  WebsiteImportQueueResponseSchema,
  type CreateOpportunityScoutRunRequest,
  type CreateSerpScoutRunRequest,
  type LatestWebsiteImportResponse,
  type MainPreview,
  type OpportunityScoutQueueResponse,
  type ProjectSummary,
  type SerpScoutQueueResponse,
  type WebsiteImportQueueResponse
} from "@localseo/contracts";
import {
  agentRuns,
  isDatabaseUniqueViolation,
  mainWebsites,
  websiteImportRuns,
  type DatabaseClient
} from "@localseo/db";
import { QueueProducerService } from "../queue-producer.js";
import { BetterAuthGuard } from "../auth/guards/better-auth.guard.js";
import { PermissionGuard } from "../auth/permissions/permission.guard.js";
import { RequireProjectPermission } from "../auth/permissions/require-permission.decorator.js";
import { ProjectAccessGuard } from "../auth/project-access.guard.js";
import type { RequestWithAuth } from "../auth/types/authenticated-request.js";
import { DatabaseService } from "../database/database.service.js";
import { CsrfGuard } from "../security/csrf/csrf.guard.js";
import { and, desc, eq, inArray } from "drizzle-orm";

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(QueueProducerService)
    private readonly queues: QueueProducerService,
    @Inject(DatabaseService)
    private readonly database: DatabaseService
  ) {}

  getProject(projectId: string): ProjectSummary {
    return ProjectSummarySchema.parse({
      id: projectId,
      name: "Local SEO Mission Control",
      status: "active",
      nextAction: "Import website or review approvals"
    });
  }

  async getLatestWebsiteImport(projectId: string): Promise<LatestWebsiteImportResponse> {
    if (!this.database.isConfigured()) {
      return LatestWebsiteImportResponseSchema.parse({ projectId });
    }

    const db = this.database.requireDb();
    const [run] = await db
      .select()
      .from(websiteImportRuns)
      .where(eq(websiteImportRuns.projectId, projectId))
      .orderBy(desc(websiteImportRuns.createdAt))
      .limit(1);

    return LatestWebsiteImportResponseSchema.parse({
      projectId,
      importRun: run ? websiteImportRunToResponse(run) : undefined
    });
  }

  async queueWebsiteImport(projectId: string, sourceUrl: string, userId?: string): Promise<WebsiteImportQueueResponse> {
    if (!this.database.isConfigured()) {
      return WebsiteImportQueueResponseSchema.parse({
        jobId: randomUUID(),
        projectId,
        sourceUrl,
        type: "website_import",
        status: "dry_run",
        inputRef: sourceUrl,
        createdBy: userId,
        message: "Database is not configured. Website import persistence is in explicit dry-run mode.",
        createdAt: new Date().toISOString()
      });
    }

    if (!this.queues.isQueueConfigured("website-import")) {
      const jobId = randomUUID();
      await this.queues.enqueue({
        queueName: "website-import",
        jobName: "website_import",
        jobId,
        data: { projectId, sourceUrl, triggeredByUserId: userId ?? null, triggerSource: "user_action" },
        audit: {
          projectId,
          type: "website_import",
          inputRef: sourceUrl,
          actorType: userId ? "user" : "system",
          actorUserId: userId,
          triggerSource: "user_action"
        }
      });

      return WebsiteImportQueueResponseSchema.parse({
        jobId,
        projectId,
        sourceUrl,
        type: "website_import",
        status: "dry_run",
        inputRef: sourceUrl,
        createdBy: userId,
        message: "Website import queue is not configured. This is an explicit dry-run response.",
        createdAt: new Date().toISOString()
      });
    }

    const db = this.database.requireDb();
    const importRunId = randomUUID();
    const jobId = `website_import:${importRunId}`;
    const mainWebsiteId = await upsertMainWebsite(db, projectId, sourceUrl);

    await db.insert(websiteImportRuns).values({
      id: importRunId,
      projectId,
      mainWebsiteId,
      sourceUrl,
      status: "queued"
    });

    let enqueued: boolean;

    try {
      enqueued = await this.queues.enqueue({
        queueName: "website-import",
        jobName: "website_import",
        jobId,
        data: {
          projectId,
          importRunId,
          sourceUrl,
          triggeredByUserId: userId ?? null,
          triggerSource: "user_action"
        },
        options: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000
          }
        },
        audit: {
          projectId,
          type: "website_import",
          inputRef: importRunId,
          actorType: userId ? "user" : "system",
          actorUserId: userId,
          triggerSource: "user_action"
        }
      });
    } catch (error) {
      await markWebsiteImportQueueFailure(db, importRunId, normalizeWebsiteImportQueueFailure(error));
      throw error;
    }

    if (!enqueued) {
      await markWebsiteImportQueueFailure(
        db,
        importRunId,
        "Website import queue was not configured after run creation."
      );
    }

    return WebsiteImportQueueResponseSchema.parse({
      jobId,
      projectId,
      importRunId,
      sourceUrl,
      type: "website_import",
      status: enqueued ? "queued" : "dry_run",
      inputRef: importRunId,
      createdBy: userId,
      message: enqueued ? undefined : "Website import queue is not configured. This is an explicit dry-run response.",
      createdAt: new Date().toISOString()
    });
  }

  async queueOpportunityScout(
    projectId: string,
    input: CreateOpportunityScoutRunRequest = {},
    userId?: string
  ): Promise<OpportunityScoutQueueResponse> {
    const maxBriefs = input.maxBriefs ?? 6;

    if (!this.database.isConfigured()) {
      return OpportunityScoutQueueResponseSchema.parse({
        jobId: randomUUID(),
        projectId,
        type: "opportunity_scout",
        status: "dry_run",
        createdBy: userId,
        message: "Database is not configured. Opportunity scout persistence is in explicit dry-run mode.",
        createdAt: new Date().toISOString()
      });
    }

    if (!this.queues.isQueueConfigured("opportunity-scout")) {
      const jobId = randomUUID();
      const jobData = OpportunityScoutJobDataSchema.parse({
        projectId,
        runId: jobId,
        maxBriefs,
        triggeredByUserId: userId ?? null,
        triggerSource: "user_action"
      });

      await this.queues.enqueue({
        queueName: "opportunity-scout",
        jobName: "opportunity_scout",
        jobId,
        data: jobData,
        audit: {
          projectId,
          type: "opportunity_scout",
          inputRef: jobId,
          actorType: userId ? "user" : "system",
          actorUserId: userId,
          triggerSource: "user_action"
        }
      });

      return OpportunityScoutQueueResponseSchema.parse({
        jobId,
        projectId,
        type: "opportunity_scout",
        status: "dry_run",
        inputRef: jobId,
        createdBy: userId,
        message: "Opportunity scout queue is not configured. This is an explicit dry-run response.",
        createdAt: new Date().toISOString()
      });
    }

    const db = this.database.requireDb();
    const activeRun = await findActiveOpportunityScoutRun(db, projectId);
    if (activeRun) {
      return activeOpportunityScoutResponse(activeRun);
    }

    const runId = randomUUID();
    const jobId = runId;

    try {
      await db.insert(agentRuns).values({
        id: runId,
        projectId,
        task: "opportunity_scout",
        status: "queued"
      });
    } catch (error) {
      if (isDatabaseUniqueViolation(error)) {
        const conflictingRun = await findActiveOpportunityScoutRun(db, projectId);
        if (conflictingRun) {
          return activeOpportunityScoutResponse(conflictingRun);
        }
      }

      throw error;
    }

    let enqueued: boolean;

    try {
      enqueued = await this.queues.enqueue({
        queueName: "opportunity-scout",
        jobName: "opportunity_scout",
        jobId,
        data: OpportunityScoutJobDataSchema.parse({
          projectId,
          runId,
          maxBriefs,
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
          type: "opportunity_scout",
          inputRef: runId,
          actorType: userId ? "user" : "system",
          actorUserId: userId,
          triggerSource: "user_action"
        }
      });
    } catch (error) {
      await markOpportunityScoutQueueFailure(
        db,
        runId,
        "queue_enqueue_failed",
        normalizeOpportunityScoutQueueFailure(error)
      );
      throw error;
    }

    if (!enqueued) {
      await markOpportunityScoutQueueFailure(
        db,
        runId,
        "queue_not_configured",
        "Opportunity scout queue was not configured after run creation."
      );
    }

    return OpportunityScoutQueueResponseSchema.parse({
      jobId,
      projectId,
      runId,
      type: "opportunity_scout",
      status: enqueued ? "queued" : "dry_run",
      inputRef: runId,
      createdBy: userId,
      message: enqueued
        ? undefined
        : "Opportunity scout queue is not configured. This is an explicit dry-run response.",
      createdAt: new Date().toISOString()
    });
  }

  async queueSerpScout(
    projectId: string,
    input: CreateSerpScoutRunRequest,
    userId?: string
  ): Promise<SerpScoutQueueResponse> {
    const snapshotId = randomUUID();
    const jobId = snapshotId;
    const jobData = SerpScoutJobDataSchema.parse({
      projectId,
      snapshotId,
      ...input,
      triggeredByUserId: userId ?? null,
      triggerSource: "user_action"
    });

    if (!this.database.isConfigured()) {
      return SerpScoutQueueResponseSchema.parse({
        jobId,
        projectId,
        snapshotId,
        query: input.query,
        type: "serp_scout",
        status: "dry_run",
        inputRef: snapshotId,
        createdBy: userId,
        message: "Database is not configured. SERP scout persistence is in explicit dry-run mode.",
        createdAt: new Date().toISOString()
      });
    }

    const enqueued = await this.queues.enqueue({
      queueName: "serp-scout",
      jobName: "serp_scout",
      jobId,
      data: jobData,
      options: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000
        }
      },
      audit: {
        projectId,
        type: "serp_scout",
        inputRef: snapshotId,
        actorType: userId ? "user" : "system",
        actorUserId: userId,
        triggerSource: "user_action"
      }
    });

    return SerpScoutQueueResponseSchema.parse({
      jobId,
      projectId,
      snapshotId,
      query: input.query,
      type: "serp_scout",
      status: enqueued ? "queued" : "dry_run",
      inputRef: snapshotId,
      createdBy: userId,
      message: enqueued ? undefined : "SERP scout queue is not configured. This is an explicit dry-run response.",
      createdAt: new Date().toISOString()
    });
  }

  getMainPreview(projectId: string): MainPreview {
    return MainPreviewSchema.parse({
      projectId,
      previewUrl: `https://${projectId}--preview.netlify.app`,
      robots: "noindex"
    });
  }
}

@Controller("projects")
@UseGuards(BetterAuthGuard, CsrfGuard, ProjectAccessGuard, PermissionGuard)
class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Get(":id")
  getProject(@Param("id") projectId: string) {
    return this.projects.getProject(projectId);
  }

  @Post(":id/import-website")
  @RequireProjectPermission("website:import")
  importWebsite(@Param("id") projectId: string, @Body() body: unknown, @Req() request: RequestWithAuth) {
    const parsed = CreateWebsiteImportRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Website import requires a valid http(s) sourceUrl.");
    }

    return this.projects.queueWebsiteImport(projectId, parsed.data.sourceUrl, request.auth?.user.id);
  }

  @Get(":id/import-website/latest")
  @RequireProjectPermission("website:import")
  getLatestWebsiteImport(@Param("id") projectId: string) {
    return this.projects.getLatestWebsiteImport(projectId);
  }

  @Post(":id/opportunity-scout/runs")
  @RequireProjectPermission("opportunity:run")
  runOpportunityScout(@Param("id") projectId: string, @Body() body: unknown, @Req() request: RequestWithAuth) {
    const parsed = CreateOpportunityScoutRunRequestSchema.safeParse(body ?? {});

    if (!parsed.success) {
      throw new BadRequestException(
        "Opportunity scout requires maxBriefs to be a positive integer no greater than 12."
      );
    }

    return this.projects.queueOpportunityScout(projectId, parsed.data, request.auth?.user.id);
  }

  @Post(":id/serp-scout/runs")
  @RequireProjectPermission("opportunity:run")
  runSerpScout(@Param("id") projectId: string, @Body() body: unknown, @Req() request: RequestWithAuth) {
    const parsed = CreateSerpScoutRunRequestSchema.safeParse(body ?? {});

    if (!parsed.success) {
      throw new BadRequestException(
        "SERP scout requires a query and optional searchEngine, device, locale, region, or maxResults."
      );
    }

    return this.projects.queueSerpScout(projectId, parsed.data, request.auth?.user.id);
  }

  @Get(":id/main-preview")
  getMainPreview(@Param("id") projectId: string) {
    return this.projects.getMainPreview(projectId);
  }
}

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService]
})
export class ProjectsModule {}

async function upsertMainWebsite(db: DatabaseClient, projectId: string, sourceUrl: string): Promise<string> {
  const [existing] = await db
    .select({ id: mainWebsites.id })
    .from(mainWebsites)
    .where(eq(mainWebsites.projectId, projectId))
    .orderBy(desc(mainWebsites.createdAt))
    .limit(1);

  if (existing) {
    await db
      .update(mainWebsites)
      .set({
        sourceUrl,
        updatedAt: new Date()
      })
      .where(eq(mainWebsites.id, existing.id));
    return existing.id;
  }

  const [inserted] = await db
    .insert(mainWebsites)
    .values({
      projectId,
      sourceUrl
    })
    .returning({ id: mainWebsites.id });

  if (!inserted) {
    throw new Error("Failed to create main website record.");
  }

  return inserted.id;
}

async function markWebsiteImportQueueFailure(db: DatabaseClient, importRunId: string, message: string): Promise<void> {
  await db
    .update(websiteImportRuns)
    .set({
      status: "failed",
      failureJson: {
        message
      },
      completedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(websiteImportRuns.id, importRunId));
}

async function markOpportunityScoutQueueFailure(
  db: DatabaseClient,
  runId: string,
  failureCode: AiReasoningEnqueueFailureCode,
  message: string
): Promise<void> {
  await db
    .update(agentRuns)
    .set({
      status: "failed",
      failureCode,
      diagnosticsJson: {
        message
      },
      completedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(agentRuns.id, runId));
}

function normalizeWebsiteImportQueueFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "website_import_queue_failed";
  return message.slice(0, 500);
}

function normalizeOpportunityScoutQueueFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "opportunity_scout_queue_failed";
  return message.slice(0, 500);
}

async function findActiveOpportunityScoutRun(db: DatabaseClient, projectId: string) {
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.projectId, projectId),
        eq(agentRuns.task, "opportunity_scout"),
        inArray(agentRuns.status, ["queued", "running"])
      )
    )
    .orderBy(desc(agentRuns.createdAt))
    .limit(1);

  return run;
}

function activeOpportunityScoutResponse(run: typeof agentRuns.$inferSelect): OpportunityScoutQueueResponse {
  return OpportunityScoutQueueResponseSchema.parse({
    jobId: run.id,
    projectId: run.projectId,
    runId: run.id,
    type: "opportunity_scout",
    status: "already_active",
    inputRef: run.inputRef ?? run.id,
    message: "An opportunity scout run is already queued or running for this project.",
    createdAt: run.createdAt.toISOString()
  });
}

function websiteImportRunToResponse(row: typeof websiteImportRuns.$inferSelect) {
  const summary = recordFromUnknown(row.summaryJson);
  const failure = recordFromUnknown(row.failureJson);

  return WebsiteImportRunSchema.parse({
    importRunId: row.id,
    projectId: row.projectId,
    sourceUrl: row.sourceUrl,
    status: row.status,
    artifactKey: row.artifactKey ?? undefined,
    pageCount: numberFromUnknown(summary.pageCount),
    discoveredRoutes: stringArrayFromUnknown(summary.discoveredRoutes),
    facts: summary.facts,
    message: stringFromUnknown(failure.message),
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString(),
    completedAt: row.completedAt?.toISOString()
  });
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringArrayFromUnknown(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numberFromUnknown(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
