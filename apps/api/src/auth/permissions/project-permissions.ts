import type { CustomerMembershipRole } from "@localseo/contracts";

export const projectPermissions = [
  "project:read",
  "website:import",
  "opportunity:run",
  "gsc:connect",
  "gsc:sync",
  "tracking:manage",
  "release:plan",
  "release:preflight",
  "release:approve",
  "deploy:execute",
  "release:verify",
  "rollback:execute"
] as const;

export type ProjectPermission = (typeof projectPermissions)[number];

const rolePermissions = {
  owner: new Set<ProjectPermission>(projectPermissions),
  admin: new Set<ProjectPermission>(projectPermissions),
  editor: new Set<ProjectPermission>([
    "project:read",
    "website:import",
    "opportunity:run",
    "gsc:sync",
    "release:plan",
    "release:preflight",
    "release:verify"
  ]),
  viewer: new Set<ProjectPermission>(["project:read"])
} satisfies Record<CustomerMembershipRole, ReadonlySet<ProjectPermission>>;

export function roleHasProjectPermission(role: CustomerMembershipRole, permission: ProjectPermission): boolean {
  return rolePermissions[role].has(permission);
}
