# Email And Messaging

Walk in here when your app needs to reach humans reliably through transactional email, SMS, push, or in-app feeds without inheriting the usual delivery footguns. The simple act of "send an email" hides responsive HTML that survives Outlook, DKIM signing, queued sends through provider outages, retry/backoff without double-sends, and preference-aware fan-out. The repos below are the open-source backbone pieces: notification orchestrators, MTAs, SMTP clients, and email-templating frameworks.

You rarely need to run your own mail server, but you often need one proven part: Novu's multi-channel workflow step, Nodemailer's SMTP connection pool, MJML's responsive-table renderer, or listmonk's queued bulk sender. A SaaS sending password resets and a newsletter platform blasting a million emails share the same intents: render a template, enqueue, retry, respect preferences. Take the module that matches the failure mode in front of you and leave the rest.

---

## 1. Notification Orchestration & Multi-Channel

These take a single "notify" trigger and route it across Email/SMS/Push/In-App, applying templates, user preferences, and per-channel providers.

### Orchestration Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [novuhq/novu](https://github.com/novuhq/novu) | Open-source notification infrastructure (multi-channel workflows). | Steal how a workflow is a graph of steps (email, sms, push, in-app, delay, digest), how preferences overlay channel routing, and how each step is queued with retries. |

---

## 2. Mail Servers & Bulk Senders

These are full MTAs or campaign senders that handle queuing, DKIM/SPF, bounce processing, and deliverability at volume.

### Server Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [knadh/listmonk](https://github.com/knadh/listmonk) | High-performance self-hosted newsletter & mailing-list manager (Go). | Steal the worker-pool message queue, the messenger abstraction over SMTP/providers, sliding-window rate limiting, and bounce processing. |
| [postalserver/postal](https://github.com/postalserver/postal) | Full self-hosted mail delivery platform (Ruby), a Sendgrid/Mailgun alternative. | Steal the outbound delivery queue, DKIM signing, per-message tracking, and the SMTP server that accepts inbound mail. |

---

## 3. SMTP Clients & Email Templating

These are the libraries you embed in an app: a transport that speaks SMTP, and frameworks that turn components into deliverable, responsive HTML.

### Library Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [nodemailer/nodemailer](https://github.com/nodemailer/nodemailer) | The de-facto Node.js email sending library. | Steal the pluggable transport interface, the SMTP connection pool, MIME composition (`mail-composer`, `mime-node`), and DKIM signing. |
| [resend/react-email](https://github.com/resend/react-email) | Build emails as React components, render to HTML. | Steal the unstyled component primitives (`Button`, `Container`), the `render()` function that produces email-client-safe HTML, and inline-style handling. |
| [mjmlio/mjml](https://github.com/mjmlio/mjml) | Markup language that compiles to responsive, bulletproof email HTML. | Steal how `mjml-core` walks the component tree and how each component (`mjml-section`, `mjml-column`) renders to nested tables that survive Outlook. |

---

## 4. The Anatomy of Large Repos: Decomposing "Stealable" Modules

A notification platform looks sprawling, but inside it is a few clean problems: render a template, enqueue a job, retry with backoff, fan out across channels. Decompose by intent and lift the module.

### Decomposed Module Index

| Intent | Product / Repo | Target Module / Directory | What to steal |
| --- | --- | --- | --- |
| **Multi-Channel Workflow Engine** | Novu | [`apps/api/src/app/workflows-v2`](https://github.com/novuhq/novu/tree/next/apps/api/src/app/workflows-v2) | How a workflow definition becomes an ordered set of channel steps with template rendering, preferences, and delays. |
| **Event → Notification Fan-out** | Novu | [`apps/api/src/app/events`](https://github.com/novuhq/novu/tree/next/apps/api/src/app/events) | How a single trigger event is expanded into per-subscriber, per-channel messages and queued. |
| **SMTP Connection Pool** | Nodemailer | [`lib/smtp-pool`](https://github.com/nodemailer/nodemailer/tree/master/lib/smtp-pool) | How to reuse and rate-limit a pool of SMTP connections instead of opening one per message. |
| **Pluggable Transport Interface** | Nodemailer | [`lib/smtp-transport`](https://github.com/nodemailer/nodemailer/tree/master/lib/smtp-transport) | The transport contract (`send(mail, callback)`) that lets SMTP, SES, sendmail, and stream backends be swapped freely. |
| **DKIM Message Signing** | Nodemailer | [`lib/dkim`](https://github.com/nodemailer/nodemailer/tree/master/lib/dkim) | How to canonicalize headers/body and sign them so receiving servers trust the mail. |
| **Responsive HTML Renderer** | MJML | [`packages/mjml-core`](https://github.com/mjmlio/mjml/tree/master/packages/mjml-core) | How a component tree is rendered to nested-table HTML that renders consistently across email clients. |
| **Queued Bulk Sender** | listmonk | [`internal/manager`](https://github.com/knadh/listmonk/tree/master/internal/manager) | The worker-pool model that drains a campaign queue with concurrency limits, rate limiting, and sliding-window throttling. |
| **React Email Rendering** | react-email | [`packages/render`](https://github.com/resend/react-email/tree/canary/packages/render) | How React components are server-rendered and post-processed into inline-styled, client-safe email HTML. |

---

## Functional Patterns

- **Channel Abstraction**: A single `send(message)` interface with one implementation per channel/provider (SMTP, SES, Twilio, FCM). The orchestration layer never knows which provider it is using, so adding a channel is adding an adapter.
- **Queue + Retry with Backoff**: Sends are never synchronous in the request path. They are enqueued; a consumer pulls jobs and retries failed sends with exponential backoff and a dead-letter after N attempts.
- **Template-Then-Render**: Content is authored once as a template (MJML/React/Handlebars) and rendered per-recipient with variable substitution, separating design from delivery.
- **Preference Overlay**: Before fan-out, each subscriber's channel preferences and unsubscribe state are applied, so an enabled workflow still respects "this user opted out of SMS".

## Stealable Snippets

### A templated email render (React Email → HTML string)

Author the email as a React component, then render it to an HTML string your transport can send. Variables are just props.

```tsx
import { render } from "@react-email/render";
import { Html, Button, Container, Text } from "@react-email/components";

function WelcomeEmail({ name, confirmUrl }: { name: string; confirmUrl: string }) {
  return (
    <Html>
      <Container>
        <Text>Welcome, {name}! Confirm your address to get started.</Text>
        <Button href={confirmUrl} style={{ background: "#2563eb", color: "#fff", padding: "12px 20px" }}>
          Confirm email
        </Button>
      </Container>
    </Html>
  );
}

export async function buildWelcomeHtml(name: string, confirmUrl: string) {
  // pretty: false produces compact, client-safe inline-styled HTML
  return render(<WelcomeEmail name={name} confirmUrl={confirmUrl} />, { pretty: false });
}
```

### A retry/backoff queue consumer

The core of any reliable sender: pull a job, attempt the send, and on failure requeue with exponential backoff until a max-attempts dead-letter.

```ts
async function consume(queue: Queue, transport: Transport) {
  for await (const job of queue.stream()) {
    try {
      await transport.send(job.message);
      await queue.ack(job.id);
    } catch (err) {
      if (job.attempts >= MAX_ATTEMPTS) {
        await queue.deadLetter(job.id, String(err));
        continue;
      }
      // exponential backoff with jitter: 1s, 2s, 4s, 8s ... capped
      const base = Math.min(2 ** job.attempts * 1000, 5 * 60_000);
      const delay = base / 2 + Math.random() * (base / 2);
      await queue.requeue(job.id, { delayMs: delay, attempts: job.attempts + 1 });
    }
  }
}
```

### A multi-channel notification workflow step (Novu-style)

Define a workflow as a sequence of channel steps. The framework renders each step's template per-subscriber and applies preferences before sending.

```ts
import { workflow } from "@novu/framework";
import { z } from "zod";

export const orderShipped = workflow(
  "order-shipped",
  async ({ step, payload }) => {
    // Step 1: in-app feed item — instant
    await step.inApp("feed", async () => ({
      subject: "Your order shipped",
      body: `Tracking: ${payload.tracking}`,
    }));

    // Step 2: wait, then email only if still unread
    await step.delay("wait", async () => ({ amount: 30, unit: "minutes" }));

    await step.email("email", async () => ({
      subject: `Order ${payload.orderId} is on its way`,
      body: await buildWelcomeHtml(payload.name, payload.trackUrl),
    }));
  },
  { payloadSchema: z.object({ orderId: z.string(), tracking: z.string(), name: z.string(), trackUrl: z.string() }) },
);
```

## The Lift

- **The Transport Interface**: A one-method `send(message) -> Promise<Result>` contract with interchangeable SMTP/SES/provider implementations — the seam that makes channels swappable.
- **Backoff + Dead-Letter Loop**: A generic queue consumer with exponential-backoff-with-jitter retry and a dead-letter sink, reusable for any unreliable side effect, not just email.
- **Render Pipeline**: The template-then-render-per-recipient step that turns one component into N personalized, inline-styled HTML bodies.
- **Preference Overlay**: The pre-fan-out filter that intersects a workflow's channels with each subscriber's opt-in/opt-out state.

## Search Inside

`transport`, `send`, `smtp-pool`, `dkim`, `render`, `template`, `workflow`, `step.email`, `step.inApp`, `backoff`, `retry`, `requeue`, `deadLetter`, `messenger`, `rate limit`, `bounce`, `mjml-core`, `mime-node`, `subscriber`, `preference`.
