import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { StatusPill } from "@localseo/ui";
import {
  CreateTrackingKeyResponseSchema,
  TrackingKeySummarySchema,
  type CreateTrackingKeyResponse,
  type TrackingKeySummary
} from "@localseo/contracts";
import { getJson, postJson } from "../lib/api";

type TrackingKeyListResponse = {
  projectId: string;
  keys: TrackingKeySummary[];
};

const TrackingKeyListResponseSchema = {
  parse(input: unknown): TrackingKeyListResponse {
    if (!input || typeof input !== "object") {
      throw new Error("Invalid tracking key list response");
    }

    const record = input as Record<string, unknown>;

    if (typeof record.projectId !== "string" || !Array.isArray(record.keys)) {
      throw new Error("Invalid tracking key list response");
    }

    return {
      projectId: record.projectId,
      keys: record.keys.map((key) => TrackingKeySummarySchema.parse(key))
    };
  }
};

export function TrackingKeysScreen() {
  const projectId = useProjectId();
  const queryClient = useQueryClient();
  const [allowedOrigin, setAllowedOrigin] = useState("");
  const [createdKey, setCreatedKey] = useState<CreateTrackingKeyResponse | undefined>();
  const keys = useQuery({
    queryKey: ["tracking-keys", projectId],
    queryFn: () => getJson(projectApiPath(projectId, "/tracking-keys"), TrackingKeyListResponseSchema),
    retry: false
  });
  const createKey = useMutation({
    mutationFn: () =>
      postJson(
        projectApiPath(projectId, "/tracking-keys"),
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
        projectApiPath(projectId, `/tracking-keys/${encodeURIComponent(keyId)}/revoke`),
        {},
        TrackingKeySummarySchema
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tracking-keys", projectId] });
    }
  });
  const activeCount = keys.data?.keys.filter((key) => key.status === "active").length ?? 0;

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

function useProjectId(): string {
  const params = useParams({ strict: false });
  return typeof params.projectId === "string" ? params.projectId : "demo-project";
}

function projectApiPath(projectId: string, suffix: string): string {
  return `/projects/${encodeURIComponent(projectId)}${suffix}`;
}
