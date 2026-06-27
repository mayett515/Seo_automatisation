import { randomUUID } from "node:crypto";
import { Controller, Get, Injectable, Module, Param, Post, UseGuards } from "@nestjs/common";
import {
  MainPreviewSchema,
  ProjectSummarySchema,
  QueueJobSchema,
  type MainPreview,
  type QueueJob,
  type ProjectSummary
} from "@localseo/contracts";
import { QueueProducerService } from "../queue-producer.js";
import { BetterAuthGuard } from "../auth/guards/better-auth.guard.js";
import { PermissionGuard } from "../auth/permissions/permission.guard.js";
import { RequireProjectPermission } from "../auth/permissions/require-permission.decorator.js";
import { ProjectAccessGuard } from "../auth/project-access.guard.js";
import { CsrfGuard } from "../security/csrf/csrf.guard.js";

@Injectable()
class ProjectsService {
  constructor(private readonly queues: QueueProducerService) {}

  getProject(projectId: string): ProjectSummary {
    return ProjectSummarySchema.parse({
      id: projectId,
      name: "Local SEO Mission Control",
      status: "active",
      nextAction: "Import website or review approvals"
    });
  }

  async queueWebsiteImport(projectId: string): Promise<QueueJob> {
    const jobId = randomUUID();
    const enqueued = await this.queues.enqueue({
      queueName: "website-import",
      jobName: "website_import",
      jobId,
      data: { projectId }
    });

    return QueueJobSchema.parse({
      jobId,
      projectId,
      type: "website_import",
      status: enqueued ? "queued" : "dry_run",
      inputRef: projectId,
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
  importWebsite(@Param("id") projectId: string) {
    return this.projects.queueWebsiteImport(projectId);
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
