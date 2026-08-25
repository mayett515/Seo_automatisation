import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import type { DatabaseService } from "../../database/database.service.js";
import { ReleaseReadCapability } from "./release-read.capability.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const releasePlanId = "22222222-2222-4222-8222-222222222222";

void describe("ReleaseReadCapability honesty", () => {
  void it("rejects non-UUID release plan ids instead of fabricating a draft", async () => {
    const capability = new ReleaseReadCapability(databaseWithoutPersistence());

    await assert.rejects(
      () => capability.getRelease(projectId, "not-a-uuid"),
      (error: unknown) => error instanceof BadRequestException
    );
  });

  void it("fails closed when release persistence is unavailable", async () => {
    const capability = new ReleaseReadCapability(databaseWithoutPersistence());

    await assert.rejects(
      () => capability.getRelease(projectId, releasePlanId),
      (error: unknown) => error instanceof ServiceUnavailableException
    );
  });

  void it("does not invent notes or rollback points when persistence is missing", async () => {
    const capability = new ReleaseReadCapability(databaseWithoutPersistence());

    await assert.rejects(
      () => capability.listNotes(projectId, releasePlanId),
      (error: unknown) => error instanceof ServiceUnavailableException
    );
    await assert.rejects(
      () => capability.listRollbackPoints(projectId, releasePlanId),
      (error: unknown) => error instanceof ServiceUnavailableException
    );
  });
});

function databaseWithoutPersistence(): DatabaseService {
  return { db: undefined } as DatabaseService;
}
