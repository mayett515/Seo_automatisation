import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { StatusPill } from "@localseo/ui";
import {
  GscConnectionSchema,
  GscOAuthIntentSchema,
  GscSyncQueueResponseSchema,
  type GscSyncQueueResponse
} from "@localseo/contracts";
import { getJson, postJson } from "../lib/api";
import { projectApiPath } from "../lib/api-path";
import { requireProjectId, useProjectId } from "../lib/project-route";

export function GscConnectScreen() {
  const projectId = useProjectId();
  const queryClient = useQueryClient();
  const connection = useQuery({
    queryKey: ["gsc-connection", projectId],
    queryFn: () => getJson(projectApiPath(requireProjectId(projectId), "/gsc/connection"), GscConnectionSchema),
    enabled: Boolean(projectId),
    retry: false
  });
  const connect = useMutation({
    mutationFn: () => postJson(projectApiPath(requireProjectId(projectId), "/gsc/connect"), {}, GscOAuthIntentSchema),
    onSuccess: (intent) => {
      if (intent.authUrl) {
        window.location.href = intent.authUrl;
      }
    }
  });
  const sync = useMutation({
    mutationFn: () =>
      postJson(projectApiPath(requireProjectId(projectId), "/gsc/sync"), {}, GscSyncQueueResponseSchema),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["gsc-connection", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["gsc-performance", projectId] });
    }
  });
  const status = connection.data?.status ?? "connection_required";
  const tone = status === "connected" ? "success" : status === "error" || status === "revoked" ? "danger" : "warning";

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
          <h1>Google Search Console</h1>
          <p>{connection.data?.propertyUrl ?? connection.data?.message ?? "Connection required"}</p>
        </div>
        <StatusPill tone={tone}>{status.replaceAll("_", " ")}</StatusPill>
      </header>

      <div className="action-row">
        <button className="button-primary" type="button" onClick={() => connect.mutate()} disabled={connect.isPending}>
          Connect
        </button>
        <button
          className="button-secondary"
          type="button"
          onClick={() => sync.mutate()}
          disabled={status !== "connected" || sync.isPending}
        >
          Sync
        </button>
        <Link className="button-link" to="/projects/$projectId/performance" params={{ projectId }}>
          Performance
        </Link>
      </div>

      {connect.data && !connect.data.authUrl ? <Notice text={connect.data.message} /> : null}
      {sync.data ? <Notice text={syncResponseMessage(sync.data)} /> : null}
      {connection.error ? <Notice text="Connection status could not be loaded." tone="danger" /> : null}
    </section>
  );
}

function Notice(props: { text: string; tone?: "neutral" | "danger" }) {
  return <div className={`notice notice--${props.tone ?? "neutral"}`}>{props.text}</div>;
}

function syncResponseMessage(response: GscSyncQueueResponse): string {
  return "type" in response ? `Sync response: ${response.status}` : (response.message ?? response.status);
}
