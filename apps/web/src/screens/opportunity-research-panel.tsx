import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StatusPill } from "@localseo/ui";
import {
  AgentRunTimelineResponseSchema,
  ConfirmProjectBusinessProfileRequestSchema,
  OpportunityResearchQueueResponseSchema,
  OpportunityResearchStateSchema,
  ProjectBusinessProfileResponseSchema,
  ProjectKnowledgeSearchResponseSchema,
  ProjectKnowledgeVersionSchema,
  RerunOpportunityResearchRequestSchema,
  RetireProjectKnowledgeDocumentRequestSchema,
  RetireProjectKnowledgeDocumentResponseSchema,
  ReviewProjectKnowledgeVersionRequestSchema,
  UpdateOpportunityResearchPauseRequestSchema,
  type AgentRunSummary,
  type OpportunityResearchState,
  type ProjectBusinessProfileResponse,
  type ProjectKnowledgeVersion,
  type RetireProjectKnowledgeDocumentRequest,
  type ReviewProjectKnowledgeVersionRequest
} from "@localseo/contracts";
import { getJson, patchJson, postJson } from "../lib/api";

type KnowledgeReviewCommand = {
  versionId: string;
  input: ReviewProjectKnowledgeVersionRequest;
};

type KnowledgeRetirementCommand = {
  documentId: string;
  input: RetireProjectKnowledgeDocumentRequest;
};

export function OpportunityResearchPanel(props: {
  projectId: string;
  runs: readonly AgentRunSummary[];
  runsError: boolean;
  runsPending: boolean;
}) {
  const queryClient = useQueryClient();
  const projectId = props.projectId;
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(props.runs[0]?.id);
  const selectedRun = props.runs.find((run) => run.id === selectedRunId) ?? props.runs[0];
  const state = useQuery({
    queryKey: ["opportunity-research-state", projectId],
    queryFn: () => getJson(projectApiPath(projectId, "/opportunity-research"), OpportunityResearchStateSchema),
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "queued" || status === "running" ? 3000 : false;
    }
  });
  const profile = useQuery({
    queryKey: ["business-profile", projectId],
    queryFn: () => getJson(projectApiPath(projectId, "/business-profile"), ProjectBusinessProfileResponseSchema),
    retry: false
  });
  const knowledge = useQuery({
    queryKey: ["project-knowledge", projectId, "proposed"],
    queryFn: () =>
      getJson(
        projectApiPath(projectId, "/knowledge?status=proposed&taskScope=opportunity_research&limit=20"),
        ProjectKnowledgeSearchResponseSchema
      ),
    retry: false
  });
  const approvedKnowledge = useQuery({
    queryKey: ["project-knowledge", projectId, "approved"],
    queryFn: () =>
      getJson(
        projectApiPath(projectId, "/knowledge?status=approved&taskScope=opportunity_research&limit=50"),
        ProjectKnowledgeSearchResponseSchema
      ),
    retry: false
  });
  const timeline = useQuery({
    queryKey: ["agent-run-timeline", projectId, selectedRun?.id],
    queryFn: () =>
      getJson(
        projectApiPath(projectId, `/agent-runs/${encodeURIComponent(selectedRun?.id ?? "")}/timeline`),
        AgentRunTimelineResponseSchema
      ),
    enabled: selectedRun !== undefined,
    retry: false,
    refetchInterval: selectedRun && isActiveRun(selectedRun) ? 3000 : false
  });

  const confirmProfile = useMutation({
    mutationFn: (input: ReturnType<typeof ConfirmProjectBusinessProfileRequestSchema.parse>) =>
      postJson(projectApiPath(projectId, "/business-profile/confirm"), input, ProjectBusinessProfileResponseSchema),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["business-profile", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["opportunity-research-state", projectId] })
      ]);
    },
    onError: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["business-profile", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["opportunity-research-state", projectId] })
      ]);
    }
  });
  const reviewKnowledge = useMutation({
    mutationFn: (command: KnowledgeReviewCommand) =>
      patchJson(
        projectApiPath(projectId, `/knowledge/${encodeURIComponent(command.versionId)}/review`),
        command.input,
        ProjectKnowledgeVersionSchema
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-knowledge", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["opportunity-research-state", projectId] })
      ]);
    },
    onError: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-knowledge", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["opportunity-research-state", projectId] })
      ]);
    }
  });
  const retireKnowledge = useMutation({
    mutationFn: (command: KnowledgeRetirementCommand) =>
      patchJson(
        projectApiPath(projectId, `/knowledge/documents/${encodeURIComponent(command.documentId)}/retire`),
        command.input,
        RetireProjectKnowledgeDocumentResponseSchema
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-knowledge", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["opportunity-research-state", projectId] })
      ]);
    },
    onError: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-knowledge", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["opportunity-research-state", projectId] })
      ]);
    }
  });
  const updatePause = useMutation({
    mutationFn: (input: ReturnType<typeof UpdateOpportunityResearchPauseRequestSchema.parse>) =>
      patchJson(projectApiPath(projectId, "/opportunity-research/pause"), input, OpportunityResearchStateSchema),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["opportunity-research-state", projectId] });
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: ["opportunity-research-state", projectId] });
    }
  });
  const rerun = useMutation({
    mutationFn: (input: ReturnType<typeof RerunOpportunityResearchRequestSchema.parse>) =>
      postJson(projectApiPath(projectId, "/opportunity-research/rerun"), input, OpportunityResearchQueueResponseSchema),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["opportunity-research-state", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["agent-runs", projectId, "opportunity_scout"] })
      ]);
    },
    onError: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["opportunity-research-state", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["agent-runs", projectId, "opportunity_scout"] })
      ]);
    }
  });

  return (
    <section className="opportunity-research-workspace">
      <header className="panel-heading">
        <div>
          <h2>Opportunity Research</h2>
          <p>{state.data ? researchStateLabel(state.data) : "Research state"}</p>
        </div>
        <StatusPill tone={researchStatusTone(state.data?.status)}>{state.data?.status ?? "loading"}</StatusPill>
      </header>

      {state.isError ? <div className="notice notice--danger">Research state could not be loaded.</div> : null}
      {profile.isError ? <div className="notice notice--danger">Business profile could not be loaded.</div> : null}
      {knowledge.isError ? (
        <div className="notice notice--danger">Knowledge review queue could not be loaded.</div>
      ) : null}
      {approvedKnowledge.isError ? (
        <div className="notice notice--danger">Approved knowledge could not be loaded.</div>
      ) : null}

      {state.data ? (
        <ResearchStateControls
          state={state.data}
          pausePending={updatePause.isPending}
          rerunPending={rerun.isPending}
          onPause={(reason) =>
            updatePause.mutate(
              UpdateOpportunityResearchPauseRequestSchema.parse({
                expectedRowVersion: state.data.rowVersion,
                paused: true,
                reason
              })
            )
          }
          onResume={() =>
            updatePause.mutate(
              UpdateOpportunityResearchPauseRequestSchema.parse({
                expectedRowVersion: state.data.rowVersion,
                paused: false
              })
            )
          }
          onRerun={() =>
            rerun.mutate(
              RerunOpportunityResearchRequestSchema.parse({
                expectedRowVersion: state.data.rowVersion,
                idempotencyKey: crypto.randomUUID()
              })
            )
          }
        />
      ) : null}

      {updatePause.isError ? (
        <div className="notice notice--danger">
          {errorMessage(updatePause.error, "Research state was not changed.")}
        </div>
      ) : null}
      {rerun.isError ? (
        <div className="notice notice--danger">{errorMessage(rerun.error, "Research run was not queued.")}</div>
      ) : null}
      {rerun.data ? (
        <div className="notice notice--neutral">
          Research request: {label(rerun.data.status)} ({shortId(rerun.data.runId)})
        </div>
      ) : null}

      <section className="opportunity-research-foundation-grid">
        <BusinessProfileConfirmationCard
          isPending={confirmProfile.isPending}
          profile={profile.data}
          onConfirm={(input) => confirmProfile.mutate(input)}
        />
        <KnowledgeReviewQueue
          isPending={knowledge.isPending}
          mutationPending={reviewKnowledge.isPending}
          records={knowledge.data?.records ?? []}
          onReview={(command) => reviewKnowledge.mutate(command)}
        />
        <ApprovedKnowledgeLibrary
          isPending={approvedKnowledge.isPending}
          mutationPending={retireKnowledge.isPending}
          records={(approvedKnowledge.data?.records ?? []).filter((record) => record.isCurrent)}
          onRetire={(command) => retireKnowledge.mutate(command)}
        />
      </section>

      {confirmProfile.isError ? (
        <div className="notice notice--danger">
          {errorMessage(confirmProfile.error, "Business profile was not confirmed.")}
        </div>
      ) : null}
      {reviewKnowledge.isError ? (
        <div className="notice notice--danger">
          {errorMessage(reviewKnowledge.error, "Knowledge decision was not saved.")}
        </div>
      ) : null}
      {retireKnowledge.isError ? (
        <div className="notice notice--danger">
          {errorMessage(retireKnowledge.error, "Knowledge document was not retired.")}
        </div>
      ) : null}

      <ResearchRunSelector runs={props.runs} selectedRunId={selectedRun?.id} onSelect={setSelectedRunId} />

      <ResearchTimeline
        isError={props.runsError || timeline.isError}
        isPending={props.runsPending || timeline.isPending}
        run={selectedRun}
        timeline={timeline.data}
      />
    </section>
  );
}

function ResearchRunSelector(props: {
  runs: readonly AgentRunSummary[];
  selectedRunId?: string;
  onSelect: (runId: string) => void;
}) {
  if (props.runs.length <= 1) return null;
  return (
    <label className="form-field opportunity-research-run-selector">
      <span>Research run</span>
      <select value={props.selectedRunId} onChange={(event) => props.onSelect(event.target.value)}>
        {props.runs.map((run) => (
          <option key={run.id} value={run.id}>
            {`${new Date(run.createdAt).toLocaleString()} / ${label(run.status)} / ${shortId(run.id)}`}
          </option>
        ))}
      </select>
    </label>
  );
}

function ResearchStateControls(props: {
  state: OpportunityResearchState;
  pausePending: boolean;
  rerunPending: boolean;
  onPause: (reason: string) => void;
  onResume: () => void;
  onRerun: () => void;
}) {
  const form = useForm({
    defaultValues: { reason: "" },
    onSubmit: ({ value }) => {
      const reason = value.reason.trim();
      if (reason.length > 0) props.onPause(reason);
    }
  });
  const blocked =
    props.state.readinessIssues.length > 0 || props.state.status === "queued" || props.state.status === "running";

  return (
    <section className="decision-card">
      <div className="metric-row metric-row--compact">
        <Metric title="Defend / advance" value={String(2 - props.state.portfolioShortfalls.defendAdvance)} />
        <Metric title="Quick / build" value={String(4 - props.state.portfolioShortfalls.quickBuild)} />
        <Metric title="Strategic" value={String(2 - props.state.portfolioShortfalls.strategic)} />
        <Metric title="Material" value={props.state.materialDirty ? "changed" : "current"} />
      </div>
      {props.state.readinessIssues.length > 0 ? (
        <div className="research-issue-list">
          {props.state.readinessIssues.map((issue) => (
            <span key={issue}>{label(issue)}</span>
          ))}
        </div>
      ) : null}
      <div className="decision-card__actions">
        <button
          className="button-primary"
          disabled={blocked || props.rerunPending || props.state.status === "paused"}
          type="button"
          onClick={props.onRerun}
        >
          {props.rerunPending ? "Queueing" : "Run research"}
        </button>
        {props.state.status === "paused" ? (
          <button className="button-secondary" disabled={props.pausePending} type="button" onClick={props.onResume}>
            Resume
          </button>
        ) : (
          <form
            className="research-pause-form"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.Field name="reason">
              {(field) => (
                <label className="form-field">
                  <span>Pause reason</span>
                  <input
                    maxLength={2000}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </label>
              )}
            </form.Field>
            <form.Subscribe selector={(formState) => formState.values.reason.trim().length > 0}>
              {(hasReason) => (
                <button className="button-secondary" disabled={!hasReason || props.pausePending} type="submit">
                  Pause
                </button>
              )}
            </form.Subscribe>
          </form>
        )}
      </div>
    </section>
  );
}

function BusinessProfileConfirmationCard(props: {
  profile?: ProjectBusinessProfileResponse;
  isPending: boolean;
  onConfirm: (input: ReturnType<typeof ConfirmProjectBusinessProfileRequestSchema.parse>) => void;
}) {
  const profile = props.profile;
  if (!profile) {
    return <section className="detail-panel">Loading business profile</section>;
  }
  if (!profile.currentRevision) {
    return (
      <section className="detail-panel">
        <h3>Business profile</h3>
        <div className="notice notice--neutral">No profile revision available.</div>
      </section>
    );
  }
  const confirmedProfile = profile as ProjectBusinessProfileResponse & {
    currentRevision: NonNullable<ProjectBusinessProfileResponse["currentRevision"]>;
  };
  return (
    <BusinessProfileForm
      key={`${profile.currentRevision.id}:${profile.rowVersion}`}
      profile={confirmedProfile}
      isPending={props.isPending}
      onConfirm={props.onConfirm}
    />
  );
}

function BusinessProfileForm(props: {
  profile: ProjectBusinessProfileResponse & {
    currentRevision: NonNullable<ProjectBusinessProfileResponse["currentRevision"]>;
  };
  isPending: boolean;
  onConfirm: (input: ReturnType<typeof ConfirmProjectBusinessProfileRequestSchema.parse>) => void;
}) {
  const eligibleServices = props.profile.services.filter(isConfirmableEntity);
  const eligibleAreas = props.profile.areas.filter(isConfirmableEntity);
  const form = useForm({
    defaultValues: {
      serviceIds: eligibleServices.map((service) => service.id),
      areaIds: eligibleAreas.map((area) => area.id)
    },
    onSubmit: ({ value }) => {
      props.onConfirm(
        ConfirmProjectBusinessProfileRequestSchema.parse({
          expectedRowVersion: props.profile.rowVersion,
          expectedRevisionId: props.profile.currentRevision.id,
          serviceIds: value.serviceIds,
          areaIds: value.areaIds
        })
      );
    }
  });

  return (
    <form
      className="detail-panel"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="decision-card__header">
        <h3>{props.profile.currentRevision.profile.businessName}</h3>
        <StatusPill tone={props.profile.status === "confirmed" ? "success" : "warning"}>
          {props.profile.status}
        </StatusPill>
      </div>
      <span className="muted-text">{safeUrlLabel(props.profile.currentRevision.profile.websiteUrl)}</span>
      <form.Field name="serviceIds">
        {(field) => (
          <EntityChecklist
            label="Services"
            entries={eligibleServices}
            selectedIds={field.state.value}
            onToggle={(id) => field.handleChange(toggleId(field.state.value, id))}
          />
        )}
      </form.Field>
      <form.Field name="areaIds">
        {(field) => (
          <EntityChecklist
            label="Areas"
            entries={eligibleAreas}
            selectedIds={field.state.value}
            onToggle={(id) => field.handleChange(toggleId(field.state.value, id))}
          />
        )}
      </form.Field>
      {props.profile.status === "draft" ? (
        <form.Subscribe
          selector={(state) => ({
            areaCount: state.values.areaIds.length,
            serviceCount: state.values.serviceIds.length
          })}
        >
          {(selection) => (
            <button
              className="button-primary"
              disabled={props.isPending || selection.areaCount === 0 || selection.serviceCount === 0}
              type="submit"
            >
              {props.isPending ? "Confirming" : "Confirm profile"}
            </button>
          )}
        </form.Subscribe>
      ) : null}
    </form>
  );
}

function EntityChecklist(props: {
  label: string;
  entries: ProjectBusinessProfileResponse["services"];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <fieldset className="research-checklist">
      <legend>{props.label}</legend>
      {props.entries.map((entry) => (
        <label key={entry.id}>
          <input
            checked={props.selectedIds.includes(entry.id)}
            type="checkbox"
            onChange={() => props.onToggle(entry.id)}
          />
          <span>{entry.name}</span>
        </label>
      ))}
      {props.entries.length === 0 ? <span className="muted-text">No entries</span> : null}
    </fieldset>
  );
}

function KnowledgeReviewQueue(props: {
  records: ProjectKnowledgeVersion[];
  isPending: boolean;
  mutationPending: boolean;
  onReview: (command: KnowledgeReviewCommand) => void;
}) {
  return (
    <section className="detail-panel">
      <div className="decision-card__header">
        <h3>Knowledge review</h3>
        <StatusPill tone={props.records.length > 0 ? "warning" : "neutral"}>{String(props.records.length)}</StatusPill>
      </div>
      {props.isPending ? <div className="notice notice--neutral">Loading knowledge</div> : null}
      <div className="knowledge-review-list">
        {props.records.map((record) => (
          <KnowledgeReviewCard
            key={record.id}
            isPending={props.mutationPending}
            record={record}
            onReview={props.onReview}
          />
        ))}
        {props.records.length === 0 && !props.isPending ? (
          <div className="notice notice--neutral">No proposed knowledge.</div>
        ) : null}
      </div>
    </section>
  );
}

function KnowledgeReviewCard(props: {
  record: ProjectKnowledgeVersion;
  isPending: boolean;
  onReview: (command: KnowledgeReviewCommand) => void;
}) {
  const form = useForm({
    defaultValues: { reason: "" },
    onSubmit: ({ value }) => {
      const reason = value.reason.trim();
      if (reason.length === 0) return;
      props.onReview({
        versionId: props.record.id,
        input: ReviewProjectKnowledgeVersionRequestSchema.parse({
          expectedStatus: "proposed",
          expectedModelUsePolicy: props.record.modelUsePolicy,
          decision: "reject",
          reason
        })
      });
    }
  });

  return (
    <article className="evidence-item">
      <div>
        <strong>{props.record.title}</strong>
        <StatusPill tone="warning">{props.record.sourceKind}</StatusPill>
        <StatusPill tone={props.record.modelUsePolicy === "model_allowed" ? "success" : "neutral"}>
          {props.record.modelUsePolicy === "model_allowed" ? "model allowed" : "operator only"}
        </StatusPill>
      </div>
      <span>{knowledgeExcerpt(props.record.bodyMarkdown)}</span>
      <div className="chip-row">
        {props.record.taskScopes.map((scope) => (
          <span key={scope}>{label(scope)}</span>
        ))}
      </div>
      <div className="decision-card__actions">
        <button
          className="button-primary"
          disabled={props.isPending}
          type="button"
          onClick={() =>
            props.onReview({
              versionId: props.record.id,
              input: ReviewProjectKnowledgeVersionRequestSchema.parse({
                expectedStatus: "proposed",
                expectedModelUsePolicy: props.record.modelUsePolicy,
                decision: "approve"
              })
            })
          }
        >
          {props.record.modelUsePolicy === "model_allowed" ? "Approve for model use" : "Approve operator only"}
        </button>
        <form
          className="knowledge-reject-form"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="reason">
            {(field) => (
              <input
                aria-label={`Rejection reason for ${props.record.title}`}
                maxLength={2000}
                placeholder="Rejection reason"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.reason.trim().length > 0}>
            {(hasReason) => (
              <button className="button-secondary" disabled={!hasReason || props.isPending} type="submit">
                Reject
              </button>
            )}
          </form.Subscribe>
        </form>
      </div>
    </article>
  );
}

function ApprovedKnowledgeLibrary(props: {
  records: ProjectKnowledgeVersion[];
  isPending: boolean;
  mutationPending: boolean;
  onRetire: (command: KnowledgeRetirementCommand) => void;
}) {
  return (
    <section className="workspace-panel">
      <header className="panel-heading">
        <div>
          <h3>Active knowledge</h3>
          <p>Current approved versions available to operators.</p>
        </div>
      </header>
      {props.isPending ? <div className="notice notice--neutral">Loading knowledge</div> : null}
      <div className="knowledge-review-list">
        {props.records.map((record) => (
          <KnowledgeRetirementCard
            key={record.id}
            record={record}
            isPending={props.mutationPending}
            onRetire={props.onRetire}
          />
        ))}
        {props.records.length === 0 && !props.isPending ? (
          <div className="notice notice--neutral">No active knowledge.</div>
        ) : null}
      </div>
    </section>
  );
}

function KnowledgeRetirementCard(props: {
  record: ProjectKnowledgeVersion;
  isPending: boolean;
  onRetire: (command: KnowledgeRetirementCommand) => void;
}) {
  const form = useForm({
    defaultValues: { reason: "" },
    onSubmit: ({ value }) => {
      const reason = value.reason.trim();
      if (!reason) return;
      props.onRetire({
        documentId: props.record.documentId,
        input: RetireProjectKnowledgeDocumentRequestSchema.parse({
          expectedCurrentApprovedVersionId: props.record.id,
          reason
        })
      });
    }
  });
  return (
    <article className="evidence-item">
      <div>
        <strong>{props.record.title}</strong>
        <StatusPill tone={props.record.modelUsePolicy === "model_allowed" ? "success" : "neutral"}>
          {props.record.modelUsePolicy === "model_allowed" ? "model allowed" : "operator only"}
        </StatusPill>
      </div>
      <span>{knowledgeExcerpt(props.record.bodyMarkdown)}</span>
      <form
        className="knowledge-reject-form"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="reason">
          {(field) => (
            <input
              aria-label={`Retirement reason for ${props.record.title}`}
              maxLength={2000}
              placeholder="Retirement reason"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.values.reason.trim().length > 0}>
          {(hasReason) => (
            <button className="button-secondary" disabled={!hasReason || props.isPending} type="submit">
              Retire
            </button>
          )}
        </form.Subscribe>
      </form>
    </article>
  );
}

function ResearchTimeline(props: {
  run?: AgentRunSummary;
  timeline?: ReturnType<typeof AgentRunTimelineResponseSchema.parse>;
  isPending: boolean;
  isError: boolean;
}) {
  if (!props.run) {
    return (
      <section className="detail-panel">
        <h3>Research timeline</h3>
        <div className="notice notice--neutral">No Opportunity Research run.</div>
      </section>
    );
  }

  return (
    <section className="detail-panel opportunity-research-timeline">
      <div className="decision-card__header">
        <div>
          <h3>Research timeline</h3>
          <span className="muted-text">{shortId(props.run.id)}</span>
        </div>
        <StatusPill tone={runStatusTone(props.run.status)}>{props.run.status}</StatusPill>
      </div>
      {props.run.failure ? (
        <div className="notice notice--danger">{props.run.failure.message ?? props.run.failure.code}</div>
      ) : null}
      {props.isPending ? <div className="notice notice--neutral">Loading timeline</div> : null}
      {props.isError ? <div className="notice notice--danger">Research timeline could not be loaded.</div> : null}
      {props.timeline ? (
        <div className="opportunity-research-timeline__grid">
          <TimelineColumn title="Steps">
            {props.timeline.steps.map((step) => (
              <article className="run-item" key={step.id}>
                <StatusPill tone={stepStatusTone(step.status)}>{step.status}</StatusPill>
                <div>
                  <strong>{label(step.stepKey)}</strong>
                  <span>{step.failureCode ?? step.agentRole ?? step.toolKey ?? label(step.stepKind)}</span>
                </div>
                <span>{step.attemptCount}</span>
              </article>
            ))}
          </TimelineColumn>
          <TimelineColumn title="Events">
            {props.timeline.events.slice(-20).map((event) => (
              <article className="run-item" key={event.id}>
                <StatusPill tone={eventTone(event.eventType)}>{String(event.sequence)}</StatusPill>
                <div>
                  <strong>{label(event.eventType)}</strong>
                  <span>{new Date(event.occurredAt).toLocaleString()}</span>
                </div>
                <span>{event.stepId ? shortId(event.stepId) : "run"}</span>
              </article>
            ))}
          </TimelineColumn>
          <TimelineColumn title="Evidence">
            {props.timeline.evidence.slice(0, 20).map((evidence) => (
              <article className="evidence-item" key={evidence.id}>
                <div>
                  <strong>{label(evidence.sourceKind)}</strong>
                  <StatusPill tone={proofTierTone(evidence.proofTier)}>{label(evidence.proofTier)}</StatusPill>
                </div>
                <span>{evidence.summary}</span>
              </article>
            ))}
          </TimelineColumn>
        </div>
      ) : null}
    </section>
  );
}

function TimelineColumn(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="run-list">
      <h4>{props.title}</h4>
      {props.children}
    </section>
  );
}

function Metric(props: { title: string; value: string }) {
  return (
    <article className="metric-card metric-card--compact">
      <span>{props.title}</span>
      <strong>{props.value}</strong>
    </article>
  );
}

function isConfirmableEntity(entity: ProjectBusinessProfileResponse["services"][number]): boolean {
  return entity.status === "proposed" || entity.status === "confirmed";
}

function toggleId(values: string[], id: string): string[] {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

function knowledgeExcerpt(markdown: string): string {
  const normalized = markdown.replace(/\s+/gu, " ").trim();
  return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
}

function researchStateLabel(state: OpportunityResearchState): string {
  if (state.lastRunAt) return `Last run ${new Date(state.lastRunAt).toLocaleString()}`;
  if (state.nextScheduledAt) return `Next scan ${new Date(state.nextScheduledAt).toLocaleString()}`;
  return state.materialDirty ? "Material changed" : "No run yet";
}

function researchStatusTone(status: OpportunityResearchState["status"] | undefined) {
  if (status === "succeeded") return "success";
  if (status === "failed") return "danger";
  if (status === "queued" || status === "running" || status === "needs_research") return "warning";
  return "neutral";
}

function runStatusTone(status: AgentRunSummary["status"]) {
  if (status === "succeeded") return "success";
  if (status === "failed") return "danger";
  return "warning";
}

function stepStatusTone(status: ReturnType<typeof AgentRunTimelineResponseSchema.parse>["steps"][number]["status"]) {
  if (status === "succeeded") return "success";
  if (status === "failed") return "danger";
  if (status === "running") return "warning";
  return "neutral";
}

function eventTone(eventType: ReturnType<typeof AgentRunTimelineResponseSchema.parse>["events"][number]["eventType"]) {
  if (eventType.endsWith("failed") || eventType === "qa.gate.failed" || eventType === "recovery.exhausted") {
    return "danger";
  }
  if (eventType.endsWith("succeeded") || eventType === "qa.gate.passed" || eventType === "proposal.persisted") {
    return "success";
  }
  return "neutral";
}

function proofTierTone(
  proofTier: ReturnType<typeof AgentRunTimelineResponseSchema.parse>["evidence"][number]["proofTier"]
) {
  if (proofTier === "customer_safe_proof") return "success";
  if (proofTier === "supporting_context") return "warning";
  return "neutral";
}

function isActiveRun(run: AgentRunSummary): boolean {
  return run.status === "queued" || run.status === "running";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0 ? `${fallback} ${error.message}` : fallback;
}

function safeUrlLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function shortId(value: string): string {
  return value.length > 8 ? value.slice(0, 8) : value;
}

function label(value: string | number): string {
  return String(value).replaceAll("_", " ").replaceAll(".", " ");
}

function projectApiPath(projectId: string, suffix: string): string {
  return `/projects/${encodeURIComponent(projectId)}${suffix}`;
}
