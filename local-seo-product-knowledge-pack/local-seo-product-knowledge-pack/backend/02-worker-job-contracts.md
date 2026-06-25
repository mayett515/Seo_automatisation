---
title: "Worker Job Contracts"
version: "1.0.0"
layer: "backend-workers"
---

# Worker Job Contracts

## Job Status

```text
queued
running
waiting_for_external
waiting_for_approval
completed
failed
cancelled
retrying
```

## Job Shape

```json
{
  "jobId": "job_123",
  "projectId": "project_123",
  "type": "page_generation",
  "status": "queued",
  "inputRef": "page_proposal_123",
  "createdBy": "user_123",
  "createdAt": "2026-06-19T00:00:00.000Z"
}
```

## Progress Events

```text
job.created
job.started
job.step.completed
job.waiting_for_approval
job.external_call.started
job.external_call.completed
job.completed
job.failed
```

## Worker Guarantees

<absolute-constraints>
- Worker dürfen nicht still fehlschlagen.
- Worker müssen partial failures speichern.
- Worker müssen idempotency keys für Deploy/External Calls nutzen.
- Worker müssen status updates schreiben.
- Worker dürfen keine nicht approved Assets publishen.
</absolute-constraints>
