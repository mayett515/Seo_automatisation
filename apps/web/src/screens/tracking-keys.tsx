import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusPill } from "@localseo/ui";
import {
  CreateTrackingKeyResponseSchema,
  TrackingKeyListResponseSchema,
  TrackingKeySummarySchema,
  type CreateTrackingKeyResponse
} from "@localseo/contracts";
import { getJson, postJson } from "../lib/api";
import { projectApiPath } from "../lib/api-path";
import { requireProjectId, useProjectId } from "../lib/project-route";

export function TrackingKeysScreen() {
  const projectId = useProjectId();
  const queryClient = useQueryClient();
  const [allowedOrigin, setAllowedOrigin] = useState("");
  const [createdKey, setCreatedKey] = useState<CreateTrackingKeyResponse | undefined>();
  const keys = useQuery({
    queryKey: ["tracking-keys", projectId],
    queryFn: () =>
      getJson(projectApiPath(requireProjectId(projectId), "/tracking-keys"), TrackingKeyListResponseSchema),
    enabled: Boolean(projectId),
    retry: false
  });
  const createKey = useMutation({
    mutationFn: () =>
      postJson(
        projectApiPath(requireProjectId(projectId), "/tracking-keys"),
        { allowedOrigins: [allowedOrigin] },
        CreateTrackingKeyResponseSchema
      ),
    onSuccess: async (response) => {
      setCreatedKey(response);
      setAllowedOrigin("");
      await queryClient.invalidateQueries({ queryKey: ["tracking-keys", projectId] });
    }
  });
  const revokeKey = useMutation({
    mutationFn: (keyId: string) =>
      postJson(
        projectApiPath(requireProjectId(projectId), `/tracking-keys/${encodeURIComponent(keyId)}/revoke`),
        {},
        TrackingKeySummarySchema
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tracking-keys", projectId] });
    }
  });
  const activeCount = keys.data?.keys.filter((key) => key.status === "active").length ?? 0;

  if (!projectId) {
    return (
      <section className="screen-grid">
        <p>Select a project to continue.</p>
      </section>
    );
  }

  return (
    <section className="screen-grid">
      <header className="screen-header">
        <div>
          <h1>Tracking Keys</h1>
          <p>{projectId}</p>
        </div>
        <StatusPill tone={activeCount > 0 ? "success" : "warning"}>{`${activeCount} active`}</StatusPill>
      </header>

      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          createKey.mutate();
        }}
      >
        <label className="form-field">
          <span>Allowed origin</span>
          <input
            placeholder="https://example.com"
            type="url"
            value={allowedOrigin}
            onChange={(event) => setAllowedOrigin(event.target.value)}
            required
          />
        </label>
        <button className="button-primary" type="submit" disabled={createKey.isPending || allowedOrigin.length === 0}>
          Create key
        </button>
      </form>

      {createdKey ? (
        <div className="notice notice--neutral">
          <strong>New key:</strong> <code>{createdKey.trackingKey}</code>
        </div>
      ) : null}
      {keys.isError ? <div className="notice notice--danger">Tracking keys could not be loaded.</div> : null}
      {createKey.isError ? <div className="notice notice--danger">Tracking key could not be created.</div> : null}
      {revokeKey.isError ? <div className="notice notice--danger">Tracking key could not be revoked.</div> : null}

      <section className="table-panel">
        <h2>Keys</h2>
        <div className="data-table">
          <div className="data-table__row data-table__row--head data-table__row--tracking">
            <span>Status</span>
            <span>Allowed origins</span>
            <span>Last used</span>
            <span>Action</span>
          </div>
          {keys.data?.keys.map((key) => (
            <div className="data-table__row data-table__row--tracking" key={key.keyId}>
              <StatusPill tone={key.status === "active" ? "success" : "neutral"}>{key.status}</StatusPill>
              <span className="truncate">{key.allowedOrigins.join(", ")}</span>
              <span>{key.lastUsedAt ?? "never"}</span>
              <button
                className="button-secondary"
                type="button"
                disabled={key.status !== "active" || revokeKey.isPending}
                onClick={() => revokeKey.mutate(key.keyId)}
              >
                Revoke
              </button>
            </div>
          ))}
          {keys.data?.keys.length === 0 ? <div className="data-table__row">No tracking keys yet.</div> : null}
        </div>
      </section>
    </section>
  );
}
