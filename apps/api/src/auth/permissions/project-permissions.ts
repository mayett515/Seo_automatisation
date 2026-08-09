import type { CustomerMembershipRole } from "@localseo/contracts";

export const projectPermissions = [
  "project:read",
  "project:configure",
  "website:import",
  "knowledge:write",
  "knowledge:approve",
  "opportunity:run",
  "opportunity:evidence",
  "opportunity:decide",
  "page:comment",
  "page:edit",
  "page:propose",
  "page:approve",
  "media:write",
  "gsc:connect",
  "gsc:sync",
  "tracking:manage",
  "release:plan",
  "release:preflight",
  "release:approve",
  "deploy:execute",
  "release:verify",
  "rollback:execute",
  "report:generate",
  "report:review",
  "report:publish",
  "report:correct",
  "report:export"
] as const;

export type ProjectPermission = (typeof projectPermissions)[number];

const rolePermissions = {
  owner: new Set<ProjectPermission>(projectPermissions),
  admin: new Set<ProjectPermission>(projectPermissions),
  editor: new Set<ProjectPermission>([
    "project:read",
    "website:import",
    "knowledge:write",
    "opportunity:run",
    "opportunity:evidence",
    "opportunity:decide",
    "page:comment",
    "page:edit",
    "page:propose",
    "page:approve",
    "media:write",
    "gsc:sync",
    "release:plan",
    "release:preflight",
    "release:verify",
    "report:generate",
    "report:review",
    "report:export"
  ]),
  viewer: new Set<ProjectPermission>(["project:read"])
} satisfies Record<CustomerMembershipRole, ReadonlySet<ProjectPermission>>;

export function roleHasProjectPermission(role: CustomerMembershipRole, permission: ProjectPermission): boolean {
  return rolePermissions[role].has(permission);
}
