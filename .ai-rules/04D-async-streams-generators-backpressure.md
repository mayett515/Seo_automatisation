---
description: "Async iterables, async generators, streams, chunking, pagination, observables, and backpressure-aware processing"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Async Streams, Generators, and Backpressure

<meta-instruction>
Use this file when async work is sequence-shaped: async iterables, `for await...of`, async generators, streams, paginated APIs, chunked processing, observables, or large data that should not be loaded all at once.
</meta-instruction>

## 1. Stream Directives

<positive-directives>
- Use async generators to model paginated, chunked, or pull-based async sequences.
- Use `for await...of` when consuming async iterables or stream-like data.
- Process large files, network responses, and long result sets in chunks when loading everything into memory is risky.
- Use stream pipeline utilities when the platform provides cleanup and backpressure handling.
- Treat Observables as event streams and use them only when the code truly has multi-value async event flow.
- Release stream readers, locks, subscriptions, or observers when the consumer exits early.
</positive-directives>

## 2. Hard Stream Constraints

<absolute-constraints>
- DO NOT collect an entire large async sequence into memory unless the full collection is required.
- DO NOT hide stream cleanup in comments; use `finally`, unsubscribe, abort, release, or pipeline cleanup.
- DO NOT use Observables for one-shot async calls.
- DO NOT use async generators when a simple promise returns one value.
- DO NOT ignore backpressure when transforming large streams.
- DO NOT mix stream iteration and direct event handlers over the same resource without one owner.
</absolute-constraints>

## 3. Sequence Model

<context>
Choose the sequence shape:

```txt
one async value             → Promise<T>
many pull-based async items → AsyncIterable<T>
large/chunked bytes         → stream / pipeline
push-based event sequence   → Observable / event listener boundary
paginated API               → async generator
```
</context>

## 4. Examples

<context>
<example>
// Good: pagination is exposed as an async sequence.

async function* listPages(firstUrl: string): AsyncGenerator<Page> {
  let nextUrl: string | null = firstUrl;

  while (nextUrl) {
    const page = await fetchPage(nextUrl);
    yield page;
    nextUrl = page.nextUrl;
  }
}

for await (const page of listPages(startUrl)) {
  await processPage(page);
}
</example>

<example>
// Bad: every page is loaded into memory before processing begins.

async function loadAllPages(firstUrl: string): Promise<Page[]> {
  const pages = [];
  let nextUrl = firstUrl;
  while (nextUrl) {
    const page = await fetchPage(nextUrl);
    pages.push(page);
    nextUrl = page.nextUrl;
  }
  return pages;
}
</example>
</context>

## 5. Routing Support

<conditional-logic>
IF the async source yields multiple values over time:
THEN model it as an async iterable, stream, observable, or event boundary.

IF the data set can be large:
THEN prefer chunked processing over full collection.

IF the consumer can stop early:
THEN include cleanup or cancellation.

IF the source is push-based and long-lived:
THEN consider whether `.ai-rules/04E-async-runtime-boundaries-performance.md` should also be loaded.
</conditional-logic>

<pre-flight-checklist>
1. [ ] Is this one async value or many async values over time?
2. [ ] Could the data be too large to collect at once?
3. [ ] Is cleanup handled when iteration stops early?
4. [ ] Did I choose async iterable, stream, observable, or event boundary intentionally?
5. [ ] Is backpressure or chunking relevant?
</pre-flight-checklist>
