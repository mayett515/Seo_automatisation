import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Job } from "bullmq";
import {
  jobRunLookupFromJob,
  markJobRunCompleted,
  markJobRunFailed,
  markJobRunRunning,
  type WorkerDb
} from "./job-run.js";

void describe("job run lifecycle helpers", () => {
  void it("prefers jobRunId from payload over external job id", () => {
    assert.deepEqual(jobRunLookupFromJob(job({ id: "external-1", data: { jobRunId: "job-run-1" } })), {
      kind: "id",
      jobRunId: "job-run-1"
    });
  });

  void it("falls back to external job id and queue name", () => {
    assert.deepEqual(jobRunLookupFromJob(job({ id: "external-1", queueName: "deploy" })), {
      kind: "external",
      externalJobId: "external-1",
      queueName: "deploy"
    });
  });

  void it("no-ops without a DB handle", async () => {
    await markJobRunRunning(undefined, job());
    await markJobRunCompleted(undefined, job());
    await markJobRunFailed(undefined, job(), new Error("failed"));
  });

  void it("writes running, completed, and failed lifecycle patches", async () => {
    const fake = createFakeDb();
    const workerJob = job({ data: { jobRunId: "job-run-1" } });

    await markJobRunRunning(fake.db, workerJob);
    await markJobRunCompleted(fake.db, workerJob);
    await markJobRunFailed(fake.db, workerJob, new Error("provider failed"));

    assert.equal(fake.patches[0]?.status, "running");
    assert.equal(fake.patches[0]?.completedAt, null);
    assert.equal(fake.patches[1]?.status, "completed");
    assert.ok(fake.patches[1]?.completedAt instanceof Date);
    assert.equal(fake.patches[2]?.status, "failed");
    assert.deepEqual(fake.patches[2]?.failureJson, { message: "provider failed" });
  });

  void it("warns when no audit row matches", async () => {
    const fake = createFakeDb([]);
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message?: unknown) => {
      warnings.push(String(message));
    };

    try {
      await markJobRunCompleted(fake.db, job({ id: "external-1", queueName: "deploy" }));
    } finally {
      console.warn = originalWarn;
    }

    assert.equal(warnings.length, 1);
    assert.match(warnings[0] ?? "", /No job_run row matched worker job deploy:external-1/u);
  });
});

function job(input: Partial<Pick<Job, "id" | "queueName" | "name" | "data">> = {}): Job {
  return {
    id: "job-1",
    queueName: "gsc-sync",
    name: "gsc_sync",
    data: {},
    ...input
  } as Job;
}

function createFakeDb(returningRows: { id: string }[] = [{ id: "job-run-1" }]): {
  db: WorkerDb;
  patches: Record<string, unknown>[];
} {
  const patches: Record<string, unknown>[] = [];
  const db = {
    update: () => ({
      set: (patch: Record<string, unknown>) => {
        patches.push(patch);
        return {
          where: () => ({
            returning: () => Promise.resolve(returningRows)
          })
        };
      }
    })
  } as unknown as WorkerDb;

  return { db, patches };
}
