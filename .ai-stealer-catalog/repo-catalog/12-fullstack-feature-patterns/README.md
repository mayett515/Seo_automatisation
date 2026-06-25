# Fullstack Feature Patterns

This category is not mainly about algorithms. It is where you go to lift product functionality already wired end to end: auth, profiles, posts, comments, favorites, follows, pagination, API contracts, admin tools, file uploads, and notifications. The interesting question is rarely "what does this feature do" — it is "how does a real production team structure the boundary between UI state and backend state, where do permission checks live, how is the API contract shared across clients, and what happens on the unhappy path." A tutorial app gives you the happy path; Cal.com, Dub, PostHog, and Novu give you the seams worth taking.

Cal.com is a scheduling product and Dub is a link shortener, but the engineering intent behind their modules — computing intersecting availability across timezones, recording an analytics event to a columnar store, fanning a notification out across email/SMS/push, validating a request body against a shared schema — is the same intent you will need for your own product. Treat each codebase not as a monolith but as a catalog of solved problems: find the module whose intent matches yours, see how a team that ships it for real handled the edge cases, and lift the pattern.

## Repos And Catalogues

| Link | Good For | What to steal |
| --- | --- | --- |
| [realworld-apps/realworld](https://github.com/realworld-apps/realworld) | Medium-like full-stack app spec and implementations. | Compare the same feature set across many frontend/backend stacks. |
| [gorvgoyl/clone-wars](https://github.com/gorvgoyl/clone-wars) | Open-source clones and alternatives of popular apps. | Use for app ideas, stack comparisons, feature maps, demos, and implementation references. |
| [GitHub topic: social-media-app](https://github.com/topics/social-media-app) | Many tutorial-style social apps. | Quality varies. Good for harvesting feature ideas and common structures. |
| [opensource-socialnetwork/opensource-socialnetwork](https://github.com/opensource-socialnetwork/opensource-socialnetwork) | Traditional social network software. | Steal profiles, timelines, groups, photos, likes, comments, and plugin structure. |
| [PostHog/posthog](https://github.com/PostHog/posthog) | Open-source product analytics, session replay, feature flags, and A/B testing. | Steal event pipelines, feature flag architecture, experimentation stats engine, and product analytics data model. |
| [growthbook/growthbook](https://github.com/growthbook/growthbook) | Open-source feature flagging and experimentation platform. | Steal warehouse-native experimentation, bayesian statistics engine, feature flag SDK design, and metrics layers. |
| [novuhq/novu](https://github.com/novuhq/novu) | Open-source notification infrastructure for products. | Steal multi-channel delivery (push, email, SMS, in-app), workflow engine, preference management, and provider abstraction. |
| [calcom/cal.com](https://github.com/calcom/cal.com) | Open-source scheduling (Calendly alternative). | Steal timezone-aware availability, booking conflict logic, customized Next-Auth sessions, and a large feature-foldered monorepo. |
| [dubinc/dub](https://github.com/dubinc/dub) | Open-source link management and analytics. | Steal edge-runtime link redirection, click-event analytics into Tinybird/ClickHouse, workspace permissions, and Zod-validated API routes. |

## 1. The Anatomy of Large Repos: Decomposing "Stealable" Modules

Looking at Cal.com or PostHog as one monolithic product is overwhelming. Instead, decompose the repo into modules. The product might be scheduling, analytics, or notifications, but the underlying engineering intent of each module — availability math, event ingestion, a notification fan-out, a permission guard, a paginated list endpoint — matches a pattern you can steal regardless of what you are building.

### Decomposed Module Index

| Intent | Product / Repo | Target Module / Directory | What to steal |
| --- | --- | --- | --- |
| **Timezone-aware availability** | Cal.com | [`packages/lib/availability.ts`](https://github.com/calcom/cal.com/blob/main/packages/lib/availability.ts) | How working hours, date overrides, and timezones are reduced to concrete free/busy intervals you can intersect against existing bookings. |
| **Booking / conflict logic** | Cal.com | [`packages/lib/bookings`](https://github.com/calcom/cal.com/tree/main/packages/lib/bookings) | How a slot request is validated against existing events to prevent double-booking, including buffers and minimum-notice rules. |
| **Customized auth & sessions** | Cal.com | [`packages/lib/auth`](https://github.com/calcom/cal.com/tree/main/packages/lib/auth) | How Next-Auth adapters are customized, sessions are checked, and password hashing/salting is handled in a real product. |
| **Link routing & click analytics** | Dub | [`apps/web/lib/analytics`](https://github.com/dubinc/dub/tree/main/apps/web/lib/analytics) | How a redirect is matched to geo/device/referrer and recorded to Tinybird — high-throughput event capture on the edge. |
| **Shared request validation** | Dub | [`apps/web/lib/zod`](https://github.com/dubinc/dub/tree/main/apps/web/lib/zod) | How one set of Zod schemas validates API input and generates OpenAPI docs — a single source of truth across clients. |
| **Multi-channel notification fan-out** | Novu | [`apps/api/src/app/events`](https://github.com/novuhq/novu/tree/next/apps/api/src/app/events) | How a single trigger fans out to email/SMS/push/in-app, applying subscriber preferences and queueing per channel. |
| **Subscriber preference overlays** | Novu | [`apps/api/src/app/subscribers`](https://github.com/novuhq/novu/tree/next/apps/api/src/app/subscribers) | How per-user channel preferences gate delivery so users control what they receive without touching workflow code. |
| **Event ingestion pipeline** | PostHog | [`posthog/api/event.py`](https://github.com/PostHog/posthog/blob/master/posthog/api/event.py) | How a high-throughput endpoint parses, validates, and queues analytics payloads for columnar (ClickHouse) ingestion. |
| **Deterministic feature flags** | GrowthBook | [`packages/sdk-js`](https://github.com/growthbook/growthbook/tree/main/packages/sdk-js) | How flags evaluate locally in microseconds via hashing user IDs into buckets — zero network round-trip per check. |

### Code You Can Steal

The shared-schema pattern Dub leans on: define a Zod schema once and reuse it for runtime validation *and* static types, so client and server can never drift:

```ts
import { z } from "zod";

export const createLinkSchema = z.object({
  url: z.string().url(),
  key: z.string().min(1).max(190).optional(),
  expiresAt: z.coerce.date().optional(),
});

// One schema → runtime validation AND the TypeScript type
export type CreateLinkInput = z.infer<typeof createLinkSchema>;

export async function POST(req: Request) {
  const parsed = createLinkSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  }
  // parsed.data is now fully typed
}
```

Availability as interval math — the core idea behind Cal.com's scheduling: turn a busy list into free slots by subtracting overlaps from the working window:

```ts
type Interval = { start: number; end: number }; // epoch ms, all UTC

function freeSlots(window: Interval, busy: Interval[], slotMs: number): Interval[] {
  const sorted = [...busy].sort((a, b) => a.start - b.start);
  const slots: Interval[] = [];
  let cursor = window.start;
  for (const b of sorted) {
    while (cursor + slotMs <= Math.min(b.start, window.end)) {
      slots.push({ start: cursor, end: cursor + slotMs });
      cursor += slotMs;
    }
    cursor = Math.max(cursor, b.end); // jump past the booked block
  }
  while (cursor + slotMs <= window.end) {
    slots.push({ start: cursor, end: cursor + slotMs });
    cursor += slotMs;
  }
  return slots;
}
```

The optimistic-update mutation every snappy UI uses — write to the cache immediately, roll back if the server rejects (TanStack Query flavor):

```ts
useMutation({
  mutationFn: (fav: Favorite) => api.post("/favorites", fav),
  onMutate: async (fav) => {
    await queryClient.cancelQueries({ queryKey: ["favorites"] });
    const previous = queryClient.getQueryData(["favorites"]);
    queryClient.setQueryData(["favorites"], (old: Favorite[]) => [...old, fav]);
    return { previous };                       // snapshot for rollback
  },
  onError: (_err, _fav, ctx) =>
    queryClient.setQueryData(["favorites"], ctx?.previous),  // rollback
  onSettled: () =>
    queryClient.invalidateQueries({ queryKey: ["favorites"] }), // resync
});
```

## Functional Patterns

- Auth and session model.
- Public profile and settings profile.
- Create/edit/delete flows.
- Comments and replies.
- Favorites/likes/bookmarks.
- Follows and personalized lists.
- Pagination and infinite scroll.
- Notifications.
- Admin and moderation tools.
- API spec shared by multiple clients.

## The Lift

- Data model and API route shape.
- Permission checks.
- Error handling.
- How UI state maps to backend state.
- Pagination strategy.
- Test structure for feature flows.

## Search Inside

`auth`, `jwt`, `profile`, `comment`, `favorite`, `follow`, `pagination`, `notification`, `admin`, `moderation`, `api spec`, `crud`, `settings`.

