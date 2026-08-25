import type { MediaAssetStoragePort } from "@localseo/adapters";
import { Inject, Injectable } from "@nestjs/common";
import type { ReleaseVerificationQueueResponse } from "@localseo/contracts";
import { DatabaseService } from "../../database/database.service.js";
import { QueueProducerService } from "../../queue-producer.js";
import { MEDIA_ASSET_STORAGE } from "../../media-storage.module.js";
import { ReleaseExecutionCapability } from "./release-execution.capability.js";
import { ReleasePlanningCapability } from "./release-planning.capability.js";
import { ReleasePreflightCapability } from "./release-preflight.capability.js";
import { ReleaseReadCapability } from "./release-read.capability.js";
import { ReleaseRollbackCapability } from "./release-rollback.capability.js";

const unavailableMediaReader: Pick<MediaAssetStoragePort, "readPrivateObject"> = {
  readPrivateObject: () => Promise.reject(new Error("Media storage reader is not configured."))
};

@Injectable()
export class ReleasesService {
  private readonly planningCapability: ReleasePlanningCapability;
  private readonly readCapability: ReleaseReadCapability;
  private readonly preflightCapability: ReleasePreflightCapability;
  private readonly executionCapability: ReleaseExecutionCapability;
  private readonly rollbackCapability: ReleaseRollbackCapability;

  constructor(
    @Inject(QueueProducerService)
    private readonly queues: QueueProducerService,
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(MEDIA_ASSET_STORAGE)
    private readonly mediaStorage: Pick<MediaAssetStoragePort, "readPrivateObject"> = unavailableMediaReader
  ) {
    this.planningCapability = new ReleasePlanningCapability(database, mediaStorage);
    this.readCapability = new ReleaseReadCapability(database);
    this.preflightCapability = new ReleasePreflightCapability(database, mediaStorage);
    this.executionCapability = new ReleaseExecutionCapability(database, queues);
    this.rollbackCapability = new ReleaseRollbackCapability(database, queues);
  }

  createPlan(
    ...args: Parameters<ReleasePlanningCapability["createPlan"]>
  ): ReturnType<ReleasePlanningCapability["createPlan"]> {
    return this.planningCapability.createPlan(...args);
  }

  getRelease(
    ...args: Parameters<ReleaseReadCapability["getRelease"]>
  ): ReturnType<ReleaseReadCapability["getRelease"]> {
    return this.readCapability.getRelease(...args);
  }

  preflight(
    ...args: Parameters<ReleasePreflightCapability["preflight"]>
  ): ReturnType<ReleasePreflightCapability["preflight"]> {
    return this.preflightCapability.preflight(...args);
  }

  approveDeploy(
    ...args: Parameters<ReleasePreflightCapability["approveDeploy"]>
  ): ReturnType<ReleasePreflightCapability["approveDeploy"]> {
    return this.preflightCapability.approveDeploy(...args);
  }

  cancelPlan(
    ...args: Parameters<ReleasePlanningCapability["cancelPlan"]>
  ): ReturnType<ReleasePlanningCapability["cancelPlan"]> {
    return this.planningCapability.cancelPlan(...args);
  }

  deploy(...args: Parameters<ReleaseExecutionCapability["deploy"]>): ReturnType<ReleaseExecutionCapability["deploy"]> {
    return this.executionCapability.deploy(...args);
  }

  executeRollback(
    ...args: Parameters<ReleaseRollbackCapability["executeRollback"]>
  ): ReturnType<ReleaseRollbackCapability["executeRollback"]> {
    return this.rollbackCapability.executeRollback(...args);
  }

  verify(
    projectId: string,
    releasePlanId: string,
    userId: string | undefined,
    body: unknown
  ): Promise<ReleaseVerificationQueueResponse> {
    return this.rollbackCapability.verify(projectId, releasePlanId, userId, body);
  }

  listNotes(...args: Parameters<ReleaseReadCapability["listNotes"]>): ReturnType<ReleaseReadCapability["listNotes"]> {
    return this.readCapability.listNotes(...args);
  }

  listRollbackPoints(
    ...args: Parameters<ReleaseReadCapability["listRollbackPoints"]>
  ): ReturnType<ReleaseReadCapability["listRollbackPoints"]> {
    return this.readCapability.listRollbackPoints(...args);
  }
}
