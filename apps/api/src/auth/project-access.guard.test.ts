import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { ProjectAccessGuard } from "./project-access.guard.js";
import type { ProjectMembershipService } from "./project-membership.service.js";

type ProjectMembershipVerifier = Pick<ProjectMembershipService, "isDatabaseBacked" | "canAccessProject">;

void describe("ProjectAccessGuard", () => {
  void it("allows the demo project without headers", async () => {
    const guard = new ProjectAccessGuard();

    assert.equal(await guard.canActivate(contextFor({ projectId: "demo-project" }, {})), true);
  });

  void it("rejects demo project access in production", async () => {
    await withNodeEnv("production", async () => {
      const guard = new ProjectAccessGuard();

      await assert.rejects(
        guard.canActivate(contextFor({ projectId: "demo-project" }, {})),
        (error) => error instanceof UnauthorizedException
      );
    });
  });

  void it("rejects project access without user context", async () => {
    const guard = new ProjectAccessGuard();

    await assert.rejects(
      guard.canActivate(contextFor({ projectId: "project-1" }, {})),
      (error) => error instanceof UnauthorizedException
    );
  });

  void it("allows local scaffold project access when the authenticated project list contains the route project", async () => {
    const guard = new ProjectAccessGuard();

    assert.equal(
      await guard.canActivate(
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

  void it("rejects guarded routes that do not expose a project context", async () => {
    const guard = new ProjectAccessGuard();

    await assert.rejects(
      guard.canActivate(
        contextFor(
          { releasePlanId: "release-1" },
          {
            "x-user-id": "user-1",
            "x-project-ids": "project-1"
          }
        )
      ),
      (error) => error instanceof UnauthorizedException
    );
  });

  void it("treats id params as project ids for legacy project-scoped routes", async () => {
    const guard = new ProjectAccessGuard();

    assert.equal(
      await guard.canActivate(
        contextFor(
          { id: "project-1" },
          {
            "x-user-id": "user-1",
            "x-project-id": "project-1"
          }
        )
      ),
      true
    );
  });

  void it("rejects persisted UUID project access when no database-backed verifier is available", async () => {
    const guard = new ProjectAccessGuard();

    await assert.rejects(
      guard.canActivate(
        contextFor(
          { projectId: "11111111-1111-4111-8111-111111111111" },
          {
            "x-user-id": "22222222-2222-4222-8222-222222222222",
            "x-project-id": "11111111-1111-4111-8111-111111111111"
          }
        )
      ),
      (error) => error instanceof UnauthorizedException
    );
  });

  void it("rejects malformed user ids before persisted membership lookup", async () => {
    let membershipLookupCalled = false;
    const verifier: ProjectMembershipVerifier = {
      isDatabaseBacked: () => true,
      canAccessProject: () => {
        membershipLookupCalled = true;
        return Promise.resolve(true);
      }
    };
    const guard = new ProjectAccessGuard(verifier as ProjectMembershipService);

    await assert.rejects(
      guard.canActivate(
        contextFor(
          { projectId: "11111111-1111-4111-8111-111111111111" },
          {
            "x-user-id": "not-a-uuid"
          }
        )
      ),
      (error) => error instanceof UnauthorizedException
    );
    assert.equal(membershipLookupCalled, false);
  });

  void it("allows persisted UUID project access only through the membership verifier", async () => {
    const verifier: ProjectMembershipVerifier = {
      isDatabaseBacked: () => true,
      canAccessProject: ({ projectId, userId }) =>
        Promise.resolve(
          projectId === "11111111-1111-4111-8111-111111111111" && userId === "22222222-2222-4222-8222-222222222222"
        )
    };
    const guard = new ProjectAccessGuard(verifier as ProjectMembershipService);

    assert.equal(
      await guard.canActivate(
        contextFor(
          { projectId: "11111111-1111-4111-8111-111111111111" },
          {
            "x-user-id": "22222222-2222-4222-8222-222222222222",
            "x-project-id": "33333333-3333-4333-8333-333333333333"
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

async function withNodeEnv<T>(nodeEnv: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;

  try {
    return await run();
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previous;
    }
  }
}
