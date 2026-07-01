import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import {
  CreateWebsiteImportRequestSchema,
  LatestWebsiteImportResponseSchema,
  MainPreviewSchema,
  ProjectSummarySchema,
  WebsiteImportRunSchema,
  WebsiteImportQueueResponseSchema,
  type LatestWebsiteImportResponse,
  type MainPreview,
  type ProjectSummary,
  type WebsiteImportQueueResponse
} from "@localseo/contracts";
import { mainWebsites, websiteImportRuns, type DatabaseClient } from "@localseo/db";
import { QueueProducerService } from "../queue-producer.js";
import { BetterAuthGuard } from "../auth/guards/better-auth.guard.js";
import { PermissionGuard } from "../auth/permissions/permission.guard.js";
import { RequireProjectPermission } from "../auth/permissions/require-permission.decorator.js";
import { ProjectAccessGuard } from "../auth/project-access.guard.js";
import type { RequestWithAuth } from "../auth/types/authenticated-request.js";
import { DatabaseService } from "../database/database.service.js";
import { CsrfGuard } from "../security/csrf/csrf.guard.js";
import { desc, eq } from "drizzle-orm";

@Injectable()
class ProjectsService {
  constructor(
    private readonly queues: QueueProducerService,
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
  constructor(private readonly projects: ProjectsService) {}

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

function normalizeWebsiteImportQueueFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "website_import_queue_failed";
  return message.slice(0, 500);
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
