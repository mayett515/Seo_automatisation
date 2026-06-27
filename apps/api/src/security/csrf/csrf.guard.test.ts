import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { CsrfGuard } from "./csrf.guard.js";

void describe("CsrfGuard", () => {
  void it("allows safe methods without origin headers", () => {
    const guard = new CsrfGuard();

    assert.equal(guard.canActivate(contextFor("GET", {})), true);
  });

  void it("allows unsafe methods from the configured web origin", () => {
    const guard = new CsrfGuard();

    assert.equal(guard.canActivate(contextFor("POST", { origin: "http://localhost:5173" })), true);
  });

  void it("rejects unsafe methods from untrusted origins", () => {
    const guard = new CsrfGuard();

    assert.throws(
      () => guard.canActivate(contextFor("POST", { origin: "https://attacker.example" })),
      (error) => error instanceof ForbiddenException
    );
  });

  void it("allows unsafe development requests without origin or referer", () => {
    withNodeEnv("development", () => {
      const guard = new CsrfGuard();

      assert.equal(guard.canActivate(contextFor("POST", {})), true);
    });
  });

  void it("allows unsafe test requests without origin or referer", () => {
    withNodeEnv("test", () => {
      const guard = new CsrfGuard();

      assert.equal(guard.canActivate(contextFor("POST", {})), true);
    });
  });

  void it("rejects unsafe production requests without origin or referer", () => {
    withNodeEnv("production", () => {
      const guard = new CsrfGuard();

      assert.throws(
        () => guard.canActivate(contextFor("POST", {})),
        (error) => error instanceof ForbiddenException
      );
    });
  });
});

function contextFor(method: string, headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        headers
      })
    })
  } as ExecutionContext;
}

function withNodeEnv<T>(nodeEnv: string, run: () => T): T {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;

  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previous;
    }
  }
}
