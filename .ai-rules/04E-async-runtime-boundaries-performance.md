---
description: "Runtime async boundaries, dynamic imports, top-level await, lazy dependencies, workers, service workers, websockets, observers, caching, and progressive loading"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Async Runtime Boundaries and Performance

<meta-instruction>
Use this file when async work crosses a runtime or performance boundary: dynamic imports, top-level await, lazy dependencies, workers, service workers, websockets, custom events, observers, caching, progressive loading, or UI loading states. These are boundaries, not pure functions.
</meta-instruction>

## 1. Runtime Boundary Directives

<positive-directives>
- Use dynamic `import()` for dependencies that are conditional, heavy, route-specific, or interaction-triggered.
- Use top-level `await` only in modules and only when startup blocking is intentional.
- Use Web Workers or worker threads for CPU-heavy work that would block the main event loop.
- Use Service Workers for offline behavior, caching, background sync, or push-style platform work.
- Use WebSockets, Server-Sent Events, Observables, or Custom Events only when long-lived event flow is real.
- Model UI loading, partial loading, failed sections, stale cache, and refresh states explicitly when they affect behavior.
</positive-directives>

## 2. Hard Runtime Boundary Constraints

<absolute-constraints>
- DO NOT use top-level `await` for optional data that can load after initial render.
- DO NOT dynamically import tiny always-used modules just to look performance-aware.
- DO NOT run CPU-heavy loops on the main thread when workers are appropriate.
- DO NOT use WebSockets for ordinary request/response data.
- DO NOT let caches silently become stale source-of-truth state.
- DO NOT hide platform lifetime ownership inside pure helpers.
</absolute-constraints>

## 3. Boundary Selection

<context>
Use this map:

```txt
optional heavy dependency     → dynamic import
startup-critical module data  → top-level await with caution
CPU-bound expensive work      → worker boundary
offline/cache/background task → service worker boundary
real-time bidirectional data  → websocket boundary
viewport-triggered loading    → IntersectionObserver boundary
UI state over async sections  → explicit loading/result union
```
</context>

## 4. Examples

<context>
<example>
// Good: dependency loads only when the feature is enabled.

async function maybeStartEditor(config: AppConfig): Promise<void> {
  if (!config.enableEditor) {
    return;
  }

  const { startEditor } = await import("./editor/startEditor");
  await startEditor(config.editor);
}
</example>

<example>
// Bad: top-level await blocks module evaluation for optional data.

const recommendations = await fetchRecommendations();
export function App() {
  return <Home recommendations={recommendations} />;
}
</example>
</context>

## 5. Routing Support

<conditional-logic>
IF an async dependency is optional or heavy:
THEN consider dynamic import instead of static import.

IF top-level await is used:
THEN verify the file is an ES module and startup blocking is intended.

IF the work is CPU-bound:
THEN consider a worker boundary instead of pretending promises create parallel CPU execution.

IF async UI can partially succeed:
THEN model partial loading and partial error states explicitly.

IF caching is introduced:
THEN define owner, invalidation, and source-of-truth relationship.
</conditional-logic>

<pre-flight-checklist>
1. [ ] Is this a runtime boundary rather than pure logic?
2. [ ] Is dynamic import actually reducing startup cost?
3. [ ] Is top-level await blocking startup intentionally?
4. [ ] Does CPU-heavy work need a worker?
5. [ ] Did I model loading/cache/error states honestly?
</pre-flight-checklist>
