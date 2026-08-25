import { useParams } from "@tanstack/react-router";
import { localScaffoldProjectIdWhenEnabled } from "./local-scaffold";

export function resolveRoutedProjectId(params: { projectId?: unknown }): string | undefined {
  if (typeof params.projectId === "string" && params.projectId.length > 0) {
    return params.projectId;
  }

  return localScaffoldProjectIdWhenEnabled();
}

export function useProjectId(): string | undefined {
  return resolveRoutedProjectId(useParams({ strict: false }));
}

export function requireProjectId(projectId: string | undefined): string {
  if (!projectId) {
    throw new Error("A project id is required.");
  }

  return projectId;
}
