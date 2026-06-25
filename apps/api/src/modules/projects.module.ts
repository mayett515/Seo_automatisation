import { randomUUID } from "node:crypto";
import { Controller, Get, Injectable, Module, Param, Post } from "@nestjs/common";
import { QueueJobSchema } from "@localseo/contracts";

@Injectable()
class ProjectsService {
  getProject(projectId: string) {
    return {
      id: projectId,
      name: "Local SEO Mission Control",
      status: "active",
      nextAction: "Import website or review approvals"
    };
  }

  queueWebsiteImport(projectId: string) {
    return QueueJobSchema.parse({
      jobId: randomUUID(),
      projectId,
      type: "website_import",
      status: "queued",
      inputRef: projectId,
      createdAt: new Date().toISOString()
    });
  }
}

@Controller("projects")
class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get(":id")
  getProject(@Param("id") projectId: string) {
    return this.projects.getProject(projectId);
  }

  @Post(":id/import-website")
  importWebsite(@Param("id") projectId: string) {
    return this.projects.queueWebsiteImport(projectId);
  }

  @Get(":id/main-preview")
  getMainPreview(@Param("id") projectId: string) {
    return {
      projectId,
      previewUrl: `https://${projectId}--preview.netlify.app`,
      robots: "noindex"
    };
  }
}

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService]
})
export class ProjectsModule {}
