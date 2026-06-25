import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { ProjectAccessGuard } from "./project-access.guard.js";

void describe("ProjectAccessGuard", () => {
  void it("allows the demo project without headers", () => {
    const guard = new ProjectAccessGuard();

    assert.equal(guard.canActivate(contextFor({ projectId: "demo-project" }, {})), true);
  });

  void it("rejects project access without user context", () => {
    const guard = new ProjectAccessGuard();

    assert.throws(
      () => guard.canActivate(contextFor({ projectId: "project-1" }, {})),
      (error) => error instanceof UnauthorizedException
    );
  });

  void it("allows project access when the authenticated project list contains the route project", () => {
    const guard = new ProjectAccessGuard();

    assert.equal(
      guard.canActivate(
        contextFor(
          { projectId: "project-1" },
          {
            "x-user-id": "user-1",
            "x-project-ids": "project-0, project-1"
          }
        )
      ),
      true
    );
  });
});

function contextFor(params: Record<string, string>, headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        params,
        headers
      })
    })
  } as ExecutionContext;
}
