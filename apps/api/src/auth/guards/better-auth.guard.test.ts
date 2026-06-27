import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { BetterAuthGuard } from "./better-auth.guard.js";
import type { BetterAuthService } from "../better-auth/better-auth.service.js";
import type { AuthenticatedRequestContext } from "../types/authenticated-request.js";

type SessionReader = Pick<BetterAuthService, "getSessionFromHeaders">;

void describe("BetterAuthGuard", () => {
  void it("attaches Better Auth session context", async () => {
    const guard = new BetterAuthGuard(reader(authContext("22222222-2222-4222-8222-222222222222")) as BetterAuthService);
    const request = requestFor({ projectId: "project-1" }, {});

    assert.equal(await guard.canActivate(contextFor(request)), true);
    assert.equal(request.auth?.source, "better_auth");
    assert.equal(request.auth?.user.id, "22222222-2222-4222-8222-222222222222");
  });

  void it("rejects demo project scaffold access when local scaffold auth is not enabled", async () => {
    await withEnv({ NODE_ENV: "development", ALLOW_LOCAL_SCAFFOLD_AUTH: undefined }, async () => {
      const guard = new BetterAuthGuard(reader(null) as BetterAuthService);

      await assert.rejects(
        guard.canActivate(contextFor(requestFor({ projectId: "demo-project" }, {}))),
        (error) => error instanceof UnauthorizedException
      );
    });
  });

  void it("allows demo project scaffold access when local scaffold auth is explicitly enabled", async () => {
    await withEnv({ NODE_ENV: "development", ALLOW_LOCAL_SCAFFOLD_AUTH: "true" }, async () => {
      const guard = new BetterAuthGuard(reader(null) as BetterAuthService);
      const request = requestFor({ projectId: "demo-project" }, {});

      assert.equal(await guard.canActivate(contextFor(request)), true);
      assert.equal(request.auth?.source, "local_scaffold");
    });
  });

  void it("allows local scaffold header identity when local scaffold auth is explicitly enabled", async () => {
    await withEnv({ NODE_ENV: "development", ALLOW_LOCAL_SCAFFOLD_AUTH: "true" }, async () => {
      const guard = new BetterAuthGuard(reader(null) as BetterAuthService);
      const request = requestFor(
        { projectId: "project-1" },
        {
          "x-user-id": "local-user"
        }
      );

      assert.equal(await guard.canActivate(contextFor(request)), true);
      assert.equal(request.auth?.user.id, "local-user");
    });
  });

  void it("rejects missing sessions in production", async () => {
    await withEnv({ NODE_ENV: "production", ALLOW_LOCAL_SCAFFOLD_AUTH: "true" }, async () => {
      const guard = new BetterAuthGuard(reader(null) as BetterAuthService);

      await assert.rejects(
        guard.canActivate(
          contextFor(
            requestFor(
              { projectId: "demo-project" },
              {
                "x-user-id": "local-user"
              }
            )
          )
        ),
        (error) => error instanceof UnauthorizedException
      );
    });
  });
});

function reader(session: AuthenticatedRequestContext | null): SessionReader {
  return {
    getSessionFromHeaders: () => Promise.resolve(session)
  };
}

function requestFor(params: Record<string, string>, headers: Record<string, string>) {
  return {
    method: "GET",
    params,
    headers
  } as {
    method: string;
    params: Record<string, string>;
    headers: Record<string, string>;
    auth?: AuthenticatedRequestContext;
  };
}

function contextFor(request: ReturnType<typeof requestFor>): ExecutionContext {
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

async function withEnv<T>(updates: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const previous = new Map(Object.keys(updates).map((key) => [key, process.env[key]]));

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
