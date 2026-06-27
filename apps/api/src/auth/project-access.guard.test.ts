import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { ProjectAccessGuard } from "./project-access.guard.js";
import type { ProjectMembershipService } from "./project-membership.service.js";
import type {
  AuthenticatedRequestContext,
  ProjectAccessContext,
  RequestWithAuth
} from "./types/authenticated-request.js";

type ProjectMembershipVerifier = Pick<ProjectMembershipService, "isDatabaseBacked" | "getProjectAccess">;

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
      getProjectAccess: () => {
        membershipLookupCalled = true;
        return Promise.resolve(undefined);
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

  void it("rejects production persisted project access when identity only comes from x-user-id", async () => {
    await withNodeEnv("production", async () => {
      let membershipLookupCalled = false;
      const verifier: ProjectMembershipVerifier = {
        isDatabaseBacked: () => true,
        getProjectAccess: () => {
          membershipLookupCalled = true;
          return Promise.resolve(undefined);
        }
      };
      const guard = new ProjectAccessGuard(verifier as ProjectMembershipService);

      await assert.rejects(
        guard.canActivate(
          contextFor(
            { projectId: "11111111-1111-4111-8111-111111111111" },
            {
              "x-user-id": "22222222-2222-4222-8222-222222222222"
            }
          )
        ),
        (error) => error instanceof UnauthorizedException
      );
      assert.equal(membershipLookupCalled, false);
    });
  });

  void it("allows persisted UUID project access only through the membership verifier", async () => {
    const verifier: ProjectMembershipVerifier = {
      isDatabaseBacked: () => true,
      getProjectAccess: ({ projectId, userId }) =>
        Promise.resolve(
          projectId === "11111111-1111-4111-8111-111111111111" && userId === "22222222-2222-4222-8222-222222222222"
            ? projectAccess({ projectId, userId, role: "viewer" })
            : undefined
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

  void it("uses Better Auth session context for persisted UUID project access", async () => {
    const verifier: ProjectMembershipVerifier = {
      isDatabaseBacked: () => true,
      getProjectAccess: ({ projectId, userId }) =>
        Promise.resolve(
          projectId === "11111111-1111-4111-8111-111111111111" && userId === "22222222-2222-4222-8222-222222222222"
            ? projectAccess({ projectId, userId, role: "admin" })
            : undefined
        )
    };
    const guard = new ProjectAccessGuard(verifier as ProjectMembershipService);

    assert.equal(
      await guard.canActivate(
        contextFor(
          { projectId: "11111111-1111-4111-8111-111111111111" },
          {},
          authContext("22222222-2222-4222-8222-222222222222")
        )
      ),
      true
    );
  });

  void it("attaches resolved project access context to the request", async () => {
    const access = projectAccess({
      projectId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      role: "editor"
    });
    const verifier: ProjectMembershipVerifier = {
      isDatabaseBacked: () => true,
      getProjectAccess: () => Promise.resolve(access)
    };
    const request = requestFor(
      { projectId: "11111111-1111-4111-8111-111111111111" },
      {},
      authContext("22222222-2222-4222-8222-222222222222")
    );
    const guard = new ProjectAccessGuard(verifier as ProjectMembershipService);

    assert.equal(await guard.canActivate(contextWithRequest(request)), true);
    assert.deepEqual(request.projectAccess, access);
  });
});

function contextFor(
  params: Record<string, string>,
  headers: Record<string, string>,
  auth?: AuthenticatedRequestContext
): ExecutionContext {
  return contextWithRequest(requestFor(params, headers, auth));
}

function requestFor(
  params: Record<string, string>,
  headers: Record<string, string>,
  auth?: AuthenticatedRequestContext
): RequestWithAuth {
  return {
    params,
    headers,
    auth
  } as RequestWithAuth;
}

function contextWithRequest(request: RequestWithAuth): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request
    })
  } as ExecutionContext;
}

function authContext(userId: string): AuthenticatedRequestContext {
  return {
    user: {
      id: userId,
      email: "user@example.com",
      name: "Session User"
    },
    session: {
      id: "session-1",
      userId,
      expiresAt: new Date(Date.now() + 60_000)
    },
    source: "better_auth"
  };
}

function projectAccess(input: {
  projectId: string;
  userId: string;
  role: ProjectAccessContext["role"];
}): ProjectAccessContext {
  return {
    userId: input.userId,
    customerId: "33333333-3333-4333-8333-333333333333",
    projectId: input.projectId,
    role: input.role,
    projectStatus: "active"
  };
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
