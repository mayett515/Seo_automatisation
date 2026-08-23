# Domain Docs

How agents consume this repository's domain documentation. This file is the
per-repo configuration the vendored skill pack reads; it overrides the pack's
own defaults, which assume a layout this repository does not use. See ADR 0024
for why.

## Layout

Single-context. One glossary for the whole repository, one decision log.

```text
/
├── CONTEXT.md                        glossary, repository-wide
└── docs/architecture/decisions/      decision log, sequential ADRs
    ├── README.md                     the register; every ADR is listed here
    ├── TEMPLATE.md                   start every new ADR from this
    └── 0001-... 0024-...
```

Decision records live only in `docs/architecture/decisions/`. Do not create a
top-level decisions directory next to it, and do not create per-package
decision directories: this repository has kept one register since ADR 0001, and
a second location means two places to look with neither authoritative.

When writing a new record, copy `TEMPLATE.md`, take the next free number, and
add the entry to the register in `README.md`. The template's sections are not
optional decoration: `Regression Guard` is what makes a record enforceable
later.

`CONTEXT.md` does not exist yet. It is a glossary and nothing else: no
implementation detail, no spec, no scratch space. Create it lazily, when the
first term is actually resolved with the user, not upfront.

## Before exploring

Read `CONTEXT.md` if it exists, and the records in
`docs/architecture/decisions/` that touch the area you are about to work in.
`README.md` in that folder is the index; use it to find the relevant ones
instead of reading all of them.

If `CONTEXT.md` is absent, proceed silently. Do not flag its absence and do not
propose creating it as a task of its own.

## Use the glossary's vocabulary

When your output names a domain concept, in a ticket title, a refactor
proposal, a hypothesis, or a test name, use the term as the glossary defines
it. Do not drift to synonyms it avoids.

If the concept you need is not in the glossary, that is a signal. Either you
are inventing language this project does not use, which is worth reconsidering,
or there is a real gap worth recording.

The same rule binds the reverse direction: the pack's `codebase-design` skill
advises against the word "boundary". This project is built on it. The project's
vocabulary wins; the deep-module terms it adds (depth, seam, leverage,
locality) are additive.

## Flag conflicts with a decision record

If your output contradicts an accepted record, surface it explicitly rather
than silently overriding it:

> Contradicts ADR 0017 (page registry as source of truth), but worth reopening
> because ...

Do not re-decide an accepted direction in passing. Update or supersede the
record instead.
