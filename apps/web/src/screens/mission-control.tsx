import { useQuery } from "@tanstack/react-query";
import { HealthResponseSchema } from "@localseo/contracts";
import { StatusPill } from "@localseo/ui";
import { getJson } from "../lib/api";

export function MissionControlPage() {
  const health = useQuery({
    queryKey: ["api-health"],
    queryFn: () => getJson("/health", HealthResponseSchema),
    retry: false
  });

  return (
    <section className="screen-grid">
      <div>
        <h1>Mission Control</h1>
        <p>Controlled Local SEO automation for audits, previews, approvals, deployment, GSC sync, and reports.</p>
      </div>
      <div className="metric-row">
        <Metric title="API" value={health.data?.status ?? "offline"} tone={health.data ? "success" : "warning"} />
        <Metric title="Approval Model" value="Customer gated" tone="neutral" />
        <Metric title="Deploy Model" value="Worker verified" tone="neutral" />
      </div>
    </section>
  );
}

function Metric(props: { title: string; value: string; tone: "neutral" | "success" | "warning" | "danger" }) {
  return (
    <article className="metric-card">
      <span>{props.title}</span>
      <StatusPill tone={props.tone}>{props.value}</StatusPill>
    </article>
  );
}
