import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { StatusPill } from "@localseo/ui";
import {
  QueueJobSchema,
  ReleaseDeployApprovalResponseSchema,
  ReleasePlanSchema,
  ReleasePreflightResponseSchema,
  type QueueJob,
  type ReleaseCheck,
  type ReleaseDeployApprovalResponse,
  type ReleasePlan,
  type ReleasePreflightResponse
} from "@localseo/contracts";
import { getJson, postJson } from "../lib/api";

export function ReleaseDetailScreen(props: { projectId: string; releasePlanId: string }) {
  return (
    <section className="screen-grid">
      <header className="screen-header">
        <div>
          <h1>Release detail</h1>
          <p>{props.releasePlanId || "No release selected"}</p>
        </div>
      </header>

      <Link className="button-link" to="/projects/$projectId/pages" params={{ projectId: props.projectId }}>
        Back to pages
      </Link>

      <ReleaseLifecyclePanel projectId={props.projectId} releasePlanId={props.releasePlanId} />
    </section>
  );
}

export function ReleaseLifecyclePanel(props: { initialPlan?: ReleasePlan; projectId: string; releasePlanId: string }) {
  const queryClient = useQueryClient();
  const releasePlanQueryKey = releasePlanDetailQueryKey(props.projectId, props.releasePlanId);
  const releasePlan = useQuery({
    queryKey: releasePlanQueryKey,
    queryFn: () =>
      getJson(
        projectApiPath(props.projectId, `/releases/${encodeURIComponent(props.releasePlanId)}`),
        ReleasePlanSchema
      ),
    retry: false,
    enabled: props.releasePlanId.length > 0
  });
  const preflight = useMutation({
    mutationFn: () =>
      postJson(
        projectApiPath(props.projectId, `/releases/${encodeURIComponent(props.releasePlanId)}/preflight`),
        {},
        ReleasePreflightResponseSchema
      ),
    onSuccess: async () => {
      approveDeploy.reset();
      deployRelease.reset();
      cancelPlan.reset();
      await queryClient.invalidateQueries({ queryKey: releasePlanQueryKey });
    }
  });
  const approveDeploy = useMutation({
    mutationFn: () =>
      postJson(
        projectApiPath(props.projectId, `/releases/${encodeURIComponent(props.releasePlanId)}/approve-deploy`),
        {},
        ReleaseDeployApprovalResponseSchema
      ),
    onSuccess: async () => {
      preflight.reset();
      deployRelease.reset();
      cancelPlan.reset();
      await queryClient.invalidateQueries({ queryKey: releasePlanQueryKey });
    }
  });
  const deployRelease = useMutation({
    mutationFn: () =>
      postJson(
        projectApiPath(props.projectId, `/releases/${encodeURIComponent(props.releasePlanId)}/deploy`),
        {},
        QueueJobSchema
      ),
    onSuccess: async () => {
      preflight.reset();
      approveDeploy.reset();
      cancelPlan.reset();
      await queryClient.invalidateQueries({ queryKey: releasePlanQueryKey });
    }
  });
  const cancelPlan = useMutation({
    mutationFn: () =>
      postJson(
        projectApiPath(props.projectId, `/releases/${encodeURIComponent(props.releasePlanId)}/cancel`),
        {},
        ReleasePlanSchema
      ),
    onSuccess: async () => {
      preflight.reset();
      approveDeploy.reset();
      deployRelease.reset();
      await queryClient.invalidateQueries({ queryKey: releasePlanQueryKey });
    }
  });
  const plan = releasePlan.data ?? props.initialPlan;
  const authoritativeProgressStatus = isReleaseProgressStatus(plan?.status) ? plan?.status : undefined;
  const queuedDeployStatus: ReleasePlan["status"] | undefined =
    deployRelease.data?.status === "queued" ? "deploying" : undefined;
  const status =
    authoritativeProgressStatus ??
    queuedDeployStatus ??
    cancelPlan.data?.status ??
    approveDeploy.data?.status ??
    preflight.data?.readiness ??
    plan?.status;
  const canApproveDeploy = status === "ready" || status === "ready_with_warnings";
  const canDeploy = status === "approved_for_deploy";
  const canCancel = isCancellableReleasePlanStatus(status);
  const pending = preflight.isPending || approveDeploy.isPending || deployRelease.isPending || cancelPlan.isPending;

  return (
    <article className="detail-panel review-panel">
      <div className="panel-heading">
        <div>
          <h2>Release controls</h2>
          <p>{props.releasePlanId}</p>
        </div>
        <StatusPill tone={status ? releasePlanTone(status) : releasePlan.isError ? "danger" : "neutral"}>
          {status?.replaceAll("_", " ") ?? (releasePlan.isPending ? "loading" : "not loaded")}
        </StatusPill>
      </div>

      {releasePlan.isPending ? <div className="notice notice--neutral">Loading release plan</div> : null}
      {releasePlan.isError ? <div className="notice notice--danger">Release plan could not be loaded.</div> : null}

      {plan ? (
        <div className="metric-row metric-row--compact">
          <Metric title="Risk" value={plan.riskLevel} />
          <Metric title="Blockers" value={String(plan.blockerCount)} />
          <Metric title="Warnings" value={String(plan.warningCount)} />
          <Metric title="Plan status" value={plan.status.replaceAll("_", " ")} />
        </div>
      ) : null}

      <div className="decision-card__actions">
        <button
          className="button-secondary"
          disabled={pending || !plan}
          type="button"
          onClick={() => preflight.mutate()}
        >
          {preflight.isPending ? "Running preflight" : "Run preflight"}
        </button>
        <button
          className="button-secondary"
          disabled={pending || !canApproveDeploy}
          type="button"
          onClick={() => approveDeploy.mutate()}
        >
          {approveDeploy.isPending ? "Approving" : "Approve deploy"}
        </button>
        <button
          className="button-primary"
          disabled={pending || !canDeploy}
          type="button"
          onClick={() => deployRelease.mutate()}
        >
          {deployRelease.isPending ? "Queueing deploy" : "Queue deploy"}
        </button>
        <button
          className="button-secondary"
          disabled={pending || !canCancel}
          type="button"
          onClick={() => cancelPlan.mutate()}
        >
          {cancelPlan.isPending ? "Cancelling" : "Cancel plan"}
        </button>
      </div>

      {preflight.isError ? (
        <div className="notice notice--danger">{errorMessage(preflight.error, "Release preflight failed.")}</div>
      ) : null}
      {approveDeploy.isError ? (
        <div className="notice notice--danger">
          {errorMessage(approveDeploy.error, "Deploy approval could not be saved.")}
        </div>
      ) : null}
      {deployRelease.isError ? (
        <div className="notice notice--danger">{errorMessage(deployRelease.error, "Deploy could not be queued.")}</div>
      ) : null}
      {cancelPlan.isError ? (
        <div className="notice notice--danger">
          {errorMessage(cancelPlan.error, "Release plan could not be cancelled.")}
        </div>
      ) : null}
      {preflight.data ? <PreflightResult result={preflight.data} /> : null}
      {approveDeploy.data ? <DeployApprovalResult approval={approveDeploy.data} /> : null}
      {deployRelease.data ? <DeployQueueResult job={deployRelease.data} /> : null}
      {cancelPlan.data ? <div className="notice notice--neutral">Release plan cancelled.</div> : null}

      {!canApproveDeploy && status === "blocked" ? (
        <div className="notice notice--danger">Resolve blocker checks before deploy approval.</div>
      ) : null}
      {!canDeploy && status !== "deploying" && status !== "live" ? (
        <div className="notice notice--neutral">Run preflight and approve deploy before queueing deployment.</div>
      ) : null}
    </article>
  );
}

function PreflightResult(props: { result: ReleasePreflightResponse }) {
  return (
    <section className="release-check-list">
      <div className="decision-card__header">
        <div>
          <strong>Preflight checks</strong>
          <p className="muted-text">{props.result.readiness.replaceAll("_", " ")}</p>
        </div>
        <StatusPill tone={releasePlanTone(props.result.readiness)}>{`${props.result.checks.length} checks`}</StatusPill>
      </div>
      {props.result.checks.map((check) => (
        <ReleaseCheckItem check={check} key={`${check.scope}:${check.checkKey}`} />
      ))}
    </section>
  );
}

function ReleaseCheckItem(props: { check: ReleaseCheck }) {
  return (
    <article className="release-check-item">
      <div>
        <strong>{props.check.checkKey.replaceAll("_", " ")}</strong>
        <p>{props.check.message}</p>
      </div>
      <StatusPill tone={releaseCheckTone(props.check)}>{props.check.result}</StatusPill>
    </article>
  );
}

function DeployApprovalResult(props: { approval: ReleaseDeployApprovalResponse }) {
  return (
    <div className="notice notice--neutral">
      Deploy approval saved at {new Date(props.approval.approvedAt).toLocaleString()}.
    </div>
  );
}

function DeployQueueResult(props: { job: QueueJob }) {
  return (
    <div className="notice notice--neutral">
      Deploy {props.job.status.replaceAll("_", " ")}: {props.job.jobId}
      {props.job.message ? ` (${props.job.message})` : ""}
    </div>
  );
}

function Metric(props: { title: string; value: string }) {
  return (
    <article className="metric-card metric-card--compact">
      <span>{props.title}</span>
      <strong className="truncate">{props.value}</strong>
    </article>
  );
}

function releasePlanTone(status: ReleasePlan["status"]): "neutral" | "success" | "warning" | "danger" {
  if (status === "ready" || status === "approved_for_deploy" || status === "live") {
    return "success";
  }

  if (status === "ready_with_warnings" || status === "deploying" || status === "rolled_back") {
    return "warning";
  }

  if (status === "blocked" || status === "failed") {
    return "danger";
  }

  return "neutral";
}

function releaseCheckTone(check: ReleaseCheck): "neutral" | "success" | "warning" | "danger" {
  if (check.result === "passed") {
    return "success";
  }

  if (check.result === "failed" && check.severity === "blocker") {
    return "danger";
  }

  if (check.result === "failed") {
    return "warning";
  }

  return "neutral";
}

function isReleaseProgressStatus(status: ReleasePlan["status"] | undefined): boolean {
  return status === "deploying" || status === "live" || status === "failed" || status === "rolled_back";
}

function isCancellableReleasePlanStatus(status: ReleasePlan["status"] | undefined): boolean {
  return (
    status === "draft" ||
    status === "ready" ||
    status === "ready_with_warnings" ||
    status === "blocked" ||
    status === "approved_for_deploy"
  );
}

function releasePlanDetailQueryKey(projectId: string, releasePlanId: string) {
  return ["release-plan", projectId, releasePlanId] as const;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${fallback} ${error.message}`;
  }

  return fallback;
}

function projectApiPath(projectId: string, suffix: string): string {
  return `/projects/${encodeURIComponent(projectId)}${suffix}`;
}
