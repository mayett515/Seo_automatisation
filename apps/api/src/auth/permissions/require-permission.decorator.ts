import { SetMetadata } from "@nestjs/common";
import type { ProjectPermission } from "./project-permissions.js";

export const projectPermissionsMetadataKey = "local-seo:project-permissions";

export function RequireProjectPermission(...permissions: ProjectPermission[]) {
  return SetMetadata(projectPermissionsMetadataKey, permissions);
}
