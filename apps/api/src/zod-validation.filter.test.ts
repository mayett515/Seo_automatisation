import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ArgumentsHost } from "@nestjs/common";
import { z } from "zod";
import { requestValidationErrorCode, ZodValidationExceptionFilter } from "./zod-validation.filter.js";

function fakeHost() {
  const sent: unknown[] = [];
  const statuses: number[] = [];
  const reply = {
    status(code: number) {
      statuses.push(code);
      return this;
    },
    send(payload: unknown) {
      sent.push(payload);
      return this;
    }
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => reply })
  } as unknown as ArgumentsHost;

  return { host, sent, statuses };
}

void describe("ZodValidationExceptionFilter", () => {
  void it("maps ZodError to a stable 400 envelope with a machine-readable code", () => {
    const parsed = z.object({ projectId: z.string().min(1), route: z.string() }).safeParse({ projectId: 7 });
    assert.equal(parsed.success, false);
    assert.ok(parsed.error);

    const { host, sent, statuses } = fakeHost();
    new ZodValidationExceptionFilter().catch(parsed.error, host);

    assert.deepEqual(statuses, [400]);
    assert.equal(sent.length, 1);

    const envelope = sent[0] as {
      statusCode: number;
      error: string;
      code: string;
      message: string;
      issues: { path: string; code: string; message: string }[];
    };
    assert.equal(envelope.statusCode, 400);
    assert.equal(envelope.error, "Bad Request");
    assert.equal(envelope.code, requestValidationErrorCode);
    assert.equal(envelope.message, "Request validation failed.");
    assert.ok(envelope.issues.length >= 2);
    assert.ok(envelope.issues.some((issue) => issue.path === "projectId"));
    assert.ok(envelope.issues.every((issue) => typeof issue.code === "string" && issue.code.length > 0));
  });

  void it("flattens nested issue paths into dotted strings", () => {
    const parsed = z.object({ pageVersions: z.array(z.object({ pageVersionId: z.string() })) }).safeParse({
      pageVersions: [{ pageVersionId: 1 }]
    });
    assert.equal(parsed.success, false);
    assert.ok(parsed.error);

    const { host, sent } = fakeHost();
    new ZodValidationExceptionFilter().catch(parsed.error, host);

    const envelope = sent[0] as { issues: { path: string }[] };
    assert.ok(envelope.issues.some((issue) => issue.path === "pageVersions.0.pageVersionId"));
  });
});
