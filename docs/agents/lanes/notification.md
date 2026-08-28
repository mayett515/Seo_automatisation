# Notification domain

## What it is for

Telling the customer that something needs their attention: a version waiting for
approval, a finished deploy, a report ready to read. The domain exists in the
original worker topology and has no implementation.

Lanes: `notifications`.

Product source: `architecture/04-worker-architecture.md`, worker W10.

## Invariants

### D1 - A notification reports an effect that really happened

G2 applied to the surface where it is most tempting to break: no "your site is
live" before verification has established that it is.
