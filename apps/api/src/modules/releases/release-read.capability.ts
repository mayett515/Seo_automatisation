import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import {
  ReleaseNoteSchema,
  RollbackPointSchema,
  type ReleaseNote,
  type ReleasePlan,
  type RollbackPoint
} from "@localseo/contracts";
import { releaseNotes, rollbackPoints } from "@localseo/db";
import { and, desc, eq } from "@localseo/db/query";
import { isPersistedId } from "../../persisted-id.js";
import { DatabaseService } from "../../database/database.service.js";
import { assertReleasePlanForProject, loadReleasePlanForProject, mapReleasePlan } from "./release-aggregate-store.js";

export class ReleaseReadCapability {
  constructor(private readonly database: DatabaseService) {}

  async getRelease(projectId: string, releasePlanId: string): Promise<ReleasePlan> {
    if (!isPersistedId(releasePlanId)) {
      throw new BadRequestException("Release plan id must be a UUID.");
    }

    if (!this.database.db) {
      throw new ServiceUnavailableException("Release persistence is required to read release plans.");
    }

    return mapReleasePlan(await loadReleasePlanForProject(this.database.db, projectId, releasePlanId));
  }

  async listNotes(
    projectId: string,
    releasePlanId: string
  ): Promise<{ projectId: string; releasePlanId: string; notes: ReleaseNote[] }> {
    await assertReleasePlanForProject(this.database.db, projectId, releasePlanId);
    const db = this.database.requireDb();
    const rows = await db
      .select()
      .from(releaseNotes)
      .where(eq(releaseNotes.releasePlanId, releasePlanId))
      .orderBy(desc(releaseNotes.createdAt));

    return {
      projectId,
      releasePlanId,
      notes: rows.map((row) =>
        ReleaseNoteSchema.parse({
          releasePlanId: row.releasePlanId,
          audience: row.audience,
          title: row.title,
          body: row.body,
          createdAt: row.createdAt.toISOString()
        })
      )
    };
  }

  async listRollbackPoints(
    projectId: string,
    releasePlanId: string
  ): Promise<{
    projectId: string;
    releasePlanId: string;
    rollbackPoints: RollbackPoint[];
  }> {
    await assertReleasePlanForProject(this.database.db, projectId, releasePlanId);
    const db = this.database.requireDb();
    const rows = await db
      .select()
      .from(rollbackPoints)
      .where(and(eq(rollbackPoints.projectId, projectId), eq(rollbackPoints.releasePlanId, releasePlanId)));

    return {
      projectId,
      releasePlanId,
      rollbackPoints: rows.map((row) =>
        RollbackPointSchema.parse({
          releasePlanId: row.releasePlanId,
          deploymentId: row.deploymentId ?? undefined,
          artifactKey: row.artifactKey,
          providerDeployId: row.providerDeployId ?? undefined,
          liveUrl: row.liveUrl ?? undefined,
          evidence: row.evidenceJson ?? undefined,
          createdAt: row.createdAt.toISOString()
        })
      )
    };
  }
}
