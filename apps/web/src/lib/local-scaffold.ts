const localScaffoldUserId = "00000000-0000-4000-8000-000000000000";
const localScaffoldProjectId = "demo-project";

export function allowsLocalScaffoldUi(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_LOCAL_SCAFFOLD_AUTH === "true";
}

export function applyLocalScaffoldHeaders(headers: Headers): void {
  if (!allowsLocalScaffoldUi()) {
    return;
  }

  headers.set("x-user-id", localScaffoldUserId);
  headers.set("x-project-id", localScaffoldProjectId);
  headers.set("x-project-ids", localScaffoldProjectId);
}
