import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionGuard } from "./permission.guard.js";
import type { ProjectPermission } from "./project-permissions.js";
import type { ProjectAccessContext } from "../types/authenticated-request.js";

void describe("PermissionGuard", () => {
  void it("allows routes without explicit project permissions", () => {
    const guard = new PermissionGuard(new TestReflector());

    assert.equal(guard.canActivate(contextFor({ role: "viewer" })), true);
  });

  void it("allows owners to execute privileged project actions", () => {
    const guard = new PermissionGuard(new TestReflector(["deploy:execute"]));

    assert.equal(guard.canActivate(contextFor({ role: "owner" })), true);
  });

  void it("allows admins to connect GSC", () => {
    const guard = new PermissionGuard(new TestReflector(["gsc:connect"]));

    assert.equal(guard.canActivate(contextFor({ role: "admin" })), true);
  });

  void it("allows editors to run opportunity scouting", () => {
    const guard = new PermissionGuard(new TestReflector(["opportunity:run"]));

    assert.equal(guard.canActivate(contextFor({ role: "editor" })), true);
  });

  void it("allows editors to enter opportunity evidence", () => {
    const guard = new PermissionGuard(new TestReflector(["opportunity:evidence"]));

    assert.equal(guard.canActivate(contextFor({ role: "editor" })), true);
  });

  void it("allows editors to decide opportunity lifecycle status", () => {
    const guard = new PermissionGuard(new TestReflector(["opportunity:decide"]));

    assert.equal(guard.canActivate(contextFor({ role: "editor" })), true);
  });

  void it("allows editors to request page proposals", () => {
    const guard = new PermissionGuard(new TestReflector(["page:propose"]));

    assert.equal(guard.canActivate(contextFor({ role: "editor" })), true);
  });

  void it("allows editors to approve page versions", () => {
    const guard = new PermissionGuard(new TestReflector(["page:approve"]));

    assert.equal(guard.canActivate(contextFor({ role: "editor" })), true);
  });

  void it("rejects viewers on privileged project actions", () => {
    const guard = new PermissionGuard(new TestReflector(["release:approve"]));

    assert.throws(() => guard.canActivate(contextFor({ role: "viewer" })), ForbiddenException);
  });

  void it("rejects viewers from opportunity decisions", () => {
    const guard = new PermissionGuard(new TestReflector(["opportunity:decide"]));

    assert.throws(() => guard.canActivate(contextFor({ role: "viewer" })), ForbiddenException);
  });

  void it("rejects viewers from page proposal requests", () => {
    const guard = new PermissionGuard(new TestReflector(["page:propose"]));

    assert.throws(() => guard.canActivate(contextFor({ role: "viewer" })), ForbiddenException);
  });

  void it("rejects viewers from page approvals", () => {
    const guard = new PermissionGuard(new TestReflector(["page:approve"]));

    assert.throws(() => guard.canActivate(contextFor({ role: "viewer" })), ForbiddenException);
  });

  void it("rejects permission routes before project access is resolved", () => {
    const guard = new PermissionGuard(new TestReflector(["gsc:connect"]));

    assert.throws(() => guard.canActivate(contextFor({})), ForbiddenException);
  });
});

class TestReflector extends Reflector {
  constructor(private readonly permissions?: ProjectPermission[]) {
    super();
  }

  override getAllAndOverride<TResult = unknown>(): TResult | undefined {
    return this.permissions as TResult | undefined;
  }
}

function contextFor(input: { role?: ProjectAccessContext["role"] }): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => PermissionGuard,
    switchToHttp: () => ({
      getRequest: () => ({
        projectAccess: input.role
          ? {
              userId: "22222222-2222-4222-8222-222222222222",
              customerId: "33333333-3333-4333-8333-333333333333",
              projectId: "11111111-1111-4111-8111-111111111111",
              role: input.role,
              projectStatus: "active"
            }
          : undefined
      })
    })
  } as unknown as ExecutionContext;
}
