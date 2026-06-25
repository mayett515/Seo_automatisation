import { randomUUID } from "node:crypto";
import { Controller, Get, Injectable, Module, Param, Post } from "@nestjs/common";
import {
  GscConnectionSchema,
  GscOAuthIntentSchema,
  QueueJobSchema,
  type GscConnection,
  type GscOAuthIntent,
  type QueueJob
} from "@localseo/contracts";

@Injectable()
class GscService {
  getConnection(projectId: string): GscConnection {
    return GscConnectionSchema.parse({
      projectId,
      status: "connection_required",
      message: "Connect Google Search Console with OAuth before performance sync, opportunity mining, or reports can use GSC data."
    });
  }

  createOAuthIntent(projectId: string): GscOAuthIntent {
    return GscOAuthIntentSchema.parse({
      projectId,
      status: "connection_required",
      provider: "google_search_console",
      message: "OAuth URL generation is intentionally deferred until Google OAuth credentials are configured."
    });
  }

  queueSync(projectId: string): QueueJob | GscConnection {
    const connection = this.getConnection(projectId);

    if (connection.status !== "connected") {
      return connection;
    }

    return QueueJobSchema.parse({
      jobId: randomUUID(),
      projectId,
      type: "gsc_sync",
      status: "queued",
      inputRef: projectId,
      createdAt: new Date().toISOString()
    });
  }
}

@Controller("projects/:projectId/gsc")
class GscController {
  constructor(private readonly gsc: GscService) {}

  @Get("connection")
  getConnection(@Param("projectId") projectId: string) {
    return this.gsc.getConnection(projectId);
  }

  @Post("connect")
  connect(@Param("projectId") projectId: string) {
    return this.gsc.createOAuthIntent(projectId);
  }

  @Post("sync")
  sync(@Param("projectId") projectId: string) {
    return this.gsc.queueSync(projectId);
  }
}

@Module({
  controllers: [GscController],
  providers: [GscService]
})
export class GscModule {}
