# Distributed Systems And Sync

Walk in here when data or state lives in multiple places: replicas, clients, offline apps, collaborative docs, distributed services, or fault-prone systems. The moment a second copy of your data exists — a read replica, an offline mobile cache, two browser tabs editing the same document — you inherit the hardest problem in computing: keeping copies in agreement while the network drops, reorders, and duplicates messages. The field splits roughly into two answers, and either one is here to take. Consensus protocols (Raft, Paxos) force a single agreed-upon order by electing a leader and replicating an append-only log. CRDTs (conflict-free replicated data types) take the opposite stance: let every replica accept writes independently and design the merge function so the result is the same regardless of order.

The good news is that the serious systems already drew the boundary for you. etcd's `raft/` package is a self-contained consensus core with no networking or disk attached — you bring the transport and storage. Yjs and Automerge isolate their CRDT *types* (text, map, list) from their *sync protocol* (the bytes on the wire). Whether the product is a key-value store, a collaborative editor, or a local-first sync engine, the underlying intent of each module — leader election, log replication, vector clocks, last-writer-wins merge — is a pattern you can lift directly, exactly because the consistency algorithm is already cleanly separated from everything around it.

## Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [hashicorp/raft](https://github.com/hashicorp/raft) | Go Raft consensus library. | Steal leader election, replicated logs, snapshots, membership, and state machine replication. |
| [etcd-io/raft](https://github.com/etcd-io/raft) | Raft implementation used by etcd ecosystem. | Steal a serious production consensus core. |
| [jepsen-io/jepsen](https://github.com/jepsen-io/jepsen) | Distributed systems testing and fault injection. | Steal how systems are tested under partitions, crashes, pauses, and consistency violations. |
| [automerge/automerge](https://github.com/automerge/automerge) | CRDT/local-first collaboration. | Steal conflict-free document state, offline edits, merge semantics, and sync protocols. |
| [yjs/yjs](https://github.com/yjs/yjs) | Shared data types for collaborative apps. | Steal real-time/offline collaborative text and shared state. |
| [loro-dev/loro](https://github.com/loro-dev/loro) | High-performance CRDT library with built-in version control. | Steal JSON-like collaborative types, shallow snapshots, Git-style history, and real-time sync. |
| [electric-sql/electric](https://github.com/electric-sql/electric) | Local-first SQL sync, Postgres to SQLite. | Steal partial replication, shape-based subscriptions, offline writes, and conflict resolution with Postgres. |
| [tikv/tikv](https://github.com/tikv/tikv) | Distributed transactional key-value store. | Steal multi-Raft (region sharding), Percolator-style distributed transactions, and MVCC on top of consensus. |
| [cockroachdb/cockroach](https://github.com/cockroachdb/cockroach) | Distributed SQL database. | Steal how Raft, range-based sharding, and a distributed transaction layer combine into a serializable SQL store. |

## 2. The Anatomy of Large Repos: Decomposing "Stealable" Modules

A distributed database looks impossibly large until you notice it is the same handful of modules wired together: a consensus core, a sharding/region layer, a transaction layer, a storage engine. etcd's `raft/` is the canonical example — a pure state-machine implementation of Raft that knows nothing about networks or disks, so you can lift it as an algorithm rather than a product. The CRDT libraries do the same trick from the other direction, separating the data *types* from the *sync protocol*. Decompose each repo this way and the consistency algorithm becomes portable.

### Decomposed Module Index

| Intent | Product / Repo | Target Module / Directory | What to steal |
| --- | --- | --- | --- |
| **Raft Consensus Core** | hashicorp/raft | [`raft.go`](https://github.com/hashicorp/raft/blob/main/raft.go) | How leader election, `AppendEntries`, and term/log invariants are implemented in one readable Go file; the cleanest end-to-end Raft to lift from. |
| **Pure-State-Machine Raft** | etcd-io/raft | [`raft.go`](https://github.com/etcd-io/raft/blob/main/raft.go) | How to model consensus as a side-effect-free state machine that emits messages, leaving transport and persistence to the caller. |
| **Quorum & Joint Consensus** | etcd-io/raft | [`quorum/`](https://github.com/etcd-io/raft/tree/main/quorum) and [`confchange/`](https://github.com/etcd-io/raft/tree/main/confchange) | How majority quorums are computed and how membership changes happen safely via joint consensus (two overlapping configurations). |
| **Progress Tracking** | etcd-io/raft | [`tracker/`](https://github.com/etcd-io/raft/tree/main/tracker) | How a leader tracks each follower's match/next index to decide what to replicate and when an entry is committed. |
| **State Machine + Snapshots** | hashicorp/raft | [`fsm.go`](https://github.com/hashicorp/raft/blob/main/fsm.go) | How committed log entries are applied to a finite state machine and how snapshots compact the log to bound its growth. |
| **CRDT Block Model** | yjs/yjs | [`src/structs/Item.js`](https://github.com/yjs/yjs/blob/main/src/structs/Item.js) | How a sequence CRDT represents every insert as a doubly-linked `Item` block with origin pointers, enabling conflict-free concurrent text edits. |
| **CRDT Sync Encoding** | yjs/yjs | [`src/utils/`](https://github.com/yjs/yjs/tree/main/src/utils) | How state vectors and binary update encoding (`encoding.js`, `UpdateEncoder.js`) let two replicas exchange only the deltas each is missing. |
| **CRDT Document Engine** | automerge/automerge | [`rust/automerge`](https://github.com/automerge/automerge/tree/main/rust/automerge) | How a columnar-compressed op-log backs a JSON-like document, with actor IDs + Lamport timestamps giving a total order for merges. |
| **Fault Injection Harness** | jepsen-io/jepsen | [`jepsen/src/jepsen/nemesis`](https://github.com/jepsen-io/jepsen/tree/main/jepsen/src/jepsen/nemesis) | How a "nemesis" injects partitions, clock skew, and process pauses, then checks history against a consistency model. |

---

## Functional Patterns

- **Append-only replicated log**: All state changes become ordered entries in a log; replication is "make every replica's log identical," and applying the log deterministically yields identical state.
- **Leader election by term**: A single leader per monotonically increasing term serializes writes; followers grant at most one vote per term, and a majority quorum prevents split brain.
- **Commit by majority quorum**: An entry is committed once a majority has it durably; quorum overlap guarantees any future leader already holds every committed entry.
- **Convergent merge (CRDT)**: Replicas accept writes independently; the merge function is commutative, associative, and idempotent, so out-of-order, duplicated, and offline edits all converge to the same state.
- **State vectors for delta sync**: Each replica advertises "what I've seen" as a compact version vector; peers reply with only the operations the requester is missing.

### Raft `RequestVote` handler (term + log-completeness check)

A follower grants its vote only if the candidate's term is current and the candidate's log is at least as up-to-date as its own — the rule that prevents a node with stale data from becoming leader.

```go
func (r *Raft) handleRequestVote(req *RequestVoteRequest) *RequestVoteResponse {
    resp := &RequestVoteResponse{Term: r.currentTerm, Granted: false}

    if req.Term < r.currentTerm {        // stale candidate, reject
        return resp
    }
    if req.Term > r.currentTerm {        // newer term, step down
        r.becomeFollower(req.Term)
        resp.Term = req.Term
    }
    // One vote per term, and only for an up-to-date log.
    if (r.votedFor == "" || r.votedFor == req.CandidateID) &&
        r.candidateLogIsUpToDate(req.LastLogTerm, req.LastLogIndex) {
        r.votedFor = req.CandidateID
        resp.Granted = true
        r.resetElectionTimer()
    }
    return resp
}

// "Up-to-date": higher last term wins; ties break on longer log.
func (r *Raft) candidateLogIsUpToDate(lastTerm uint64, lastIndex uint64) bool {
    myTerm, myIndex := r.lastLogTerm(), r.lastLogIndex()
    if lastTerm != myTerm {
        return lastTerm > myTerm
    }
    return lastIndex >= myIndex
}
```

### CRDT last-writer-wins register merge

The simplest convergent type: a value tagged with a logical timestamp. Merge is commutative and idempotent — ties broken deterministically by node ID — so every replica lands on the same value regardless of arrival order.

```typescript
type LWWRegister<T> = { value: T; ts: number; node: string };

function merge<T>(a: LWWRegister<T>, b: LWWRegister<T>): LWWRegister<T> {
  if (a.ts !== b.ts) return a.ts > b.ts ? a : b;
  return a.node > b.node ? a : b;   // deterministic tiebreak on node id
}
```

### Vector clocks: detecting concurrency vs causality

Before you can merge, you must know whether two updates are causally ordered or genuinely concurrent. A vector clock per replica answers that without any coordination.

```python
def happens_before(a, b):   # a -> b ?  every component <=, at least one <
    return all(a[k] <= b.get(k, 0) for k in a) and any(a[k] < b.get(k, 0) for k in a)

def concurrent(a, b):       # neither precedes the other -> conflict to merge
    return not happens_before(a, b) and not happens_before(b, a)

def merge_clocks(a, b):     # join = component-wise max
    return {k: max(a.get(k, 0), b.get(k, 0)) for k in set(a) | set(b)}
```

## Functional Use Cases

- Append-only logs.
- Leader election.
- State machine replication.
- Snapshots and compaction.
- Conflict-free replicated data types.
- Offline-first local changes.
- Sync protocol and merge conflict handling.
- Fault injection tests.

## The Lift

- How state changes are represented as operations.
- How nodes/clients catch up after being offline.
- What consistency guarantees are actually promised.
- How the system handles retries and duplicate messages.
- How tests simulate bad network conditions.

## Search Inside

`raft`, `leader`, `election`, `log`, `snapshot`, `replica`, `quorum`, `partition`, `nemesis`, `crdt`, `merge`, `sync`, `offline`, `conflict`.
