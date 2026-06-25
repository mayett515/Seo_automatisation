# Optimization, Scheduling, And Matching

Walk in here when you need the best or acceptable arrangement under constraints: scheduling, routing, assignment, packing, staffing, recommendations with quotas, or matching users/items. Almost every "this is hard" product feature — fitting appointments into a calendar, assigning drivers to deliveries, packing items into trucks, ranking a feed with diversity quotas — is secretly an optimization problem with the same shape: declare decision variables, write constraints (hard rules that must hold) and an objective (the thing you maximize or minimize), then hand it to a solver. The art is in the modeling, not the math; once you can phrase your problem as variables + constraints + objective, the part you lift — an off-the-shelf engine like CP-SAT or HiGHS — does the heavy lifting.

You don't take the whole solver suite. OR-Tools alone bundles a constraint-programming engine, a routing layer, a min-cost-flow assignment solver, and an LP/MIP backend — each usable in isolation. Two products as different as a ride-hailing dispatcher and a nurse-rostering tool reuse the *same* underlying intent: "assign N things to M slots without violating capacity, minimizing cost." Spot that intent, find the one solver module that matches it, and drop it into your own code.

## Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [google/or-tools](https://github.com/google/or-tools) | Combinatorial optimization suite. | Steal routing, scheduling, assignment, packing, CP-SAT, linear/integer programming. |
| [or-tools/awesome_or-tools](https://github.com/or-tools/awesome_or-tools) | OR-Tools examples and resources. | Use to find examples close to your specific problem type. |
| [coin-or/Clp](https://github.com/coin-or/Clp) | Open-source linear programming solver. | Useful if you want lower-level LP solver internals. |
| [ERGO-Code/HiGHS](https://github.com/ERGO-Code/HiGHS) | High-performance linear and mixed-integer optimization solver. | Steal modern simplex, interior-point, and branch-and-cut methods. Good for production-scale LP/MIP. |
| [TimefoldAI/timefold-solver](https://github.com/TimefoldAI/timefold-solver) | Constraint-solving engine (the OptaPlanner successor). | Steal constraint streams, incremental score calculation, and metaheuristics (tabu search, simulated annealing) for employee rostering and vehicle routing. |
| [scipopt/scip](https://github.com/scipopt/scip) | Mixed-integer and constraint programming solver framework. | Steal branch-and-cut-and-price internals, presolving, and plugin architecture for custom constraint handlers. |

## 2. The Anatomy of Large Repos: Decomposing "Stealable" Modules

OR-Tools, SCIP, and Timefold are not single algorithms — they are suites. As a monolith, OR-Tools is overwhelming; broken into modules, each solver maps to one canonical problem you can pull out independently. The product wrapper might be "delivery dispatch" or "shift scheduling," but the engineering intent of the module underneath (min-cost assignment, constraint propagation, route construction) is a pattern you can lift directly.

### Decomposed Module Index

| Intent | Product / Repo | Target Module / Directory | What to steal |
| --- | --- | --- | --- |
| **CP-SAT Constraint Solving** | OR-Tools | [`ortools/sat`](https://github.com/google/or-tools/tree/stable/ortools/sat) | How a lazy-clause-generation CP-SAT solver models booleans + integers, propagates constraints, and learns conflict clauses — the workhorse for scheduling and rostering. |
| **Min-Cost Assignment (Hungarian)** | OR-Tools | [`ortools/graph`](https://github.com/google/or-tools/tree/stable/ortools/graph) | How linear assignment and min-cost-flow solvers match N workers to N tasks optimally; the practical alternative to hand-rolling the Hungarian algorithm. |
| **Vehicle Routing (VRP/TSP)** | OR-Tools | [`ortools/routing`](https://github.com/google/or-tools/tree/stable/ortools/routing) | How route construction heuristics + local search (guided local search, 2-opt) solve pickup/delivery with time windows and capacity. |
| **Bin Packing & Knapsack** | OR-Tools | [`ortools/packing`](https://github.com/google/or-tools/tree/stable/ortools/packing) and [`ortools/algorithms`](https://github.com/google/or-tools/tree/stable/ortools/algorithms) | How multi-dimensional bin packing and knapsack solvers are structured; reuse for truck loading, ad-slot filling, resource allocation. |
| **LP / Simplex Backend** | OR-Tools | [`ortools/glop`](https://github.com/google/or-tools/tree/stable/ortools/glop) | How a revised-simplex linear-programming solver is implemented and exposed behind a clean `LinearSolver` facade. |
| **Incremental Constraint Scoring** | Timefold Solver | [`core`](https://github.com/TimefoldAI/timefold-solver/tree/main/core) | How constraint streams compute a score *incrementally* (only re-scoring what changed) so metaheuristics can evaluate millions of moves per second. |
| **Branch-and-Cut MIP** | HiGHS | [`highs/mip`](https://github.com/ERGO-Code/HiGHS/tree/master/highs/mip) | How branch-and-bound + cutting planes + presolve are layered to solve mixed-integer programs at production scale. |
| **Branch-Cut-and-Price Framework** | SCIP | [`src/scip`](https://github.com/scipopt/scip/tree/master/src/scip) | How a solver framework exposes plugin points (constraint handlers, separators, branching rules) so you can extend the core search. |

---

## Functional Patterns

- **Variables + Constraints + Objective**: Every problem decomposes into decision variables, hard constraints that must hold, and an objective to optimize. Model it once and any solver can attack it.
- **Hard constraints vs soft penalties**: Hard constraints prune infeasible solutions; soft constraints become weighted penalties in the objective so the solver trades them off gracefully.
- **Construction heuristic, then local search**: Build a feasible-but-rough solution fast (greedy/nearest-neighbor), then improve it with neighborhood moves (2-opt, swaps) under a metaheuristic (tabu, simulated annealing).
- **Incremental scoring**: Recompute only the delta caused by a move instead of re-evaluating the whole solution — the key to evaluating millions of candidate moves.
- **Assignment as min-cost flow**: Worker/task, mentor/student, and buyer/seller matching all reduce to the same min-cost bipartite-matching skeleton.

### Hungarian (Kuhn–Munkres) assignment — the augmenting step

The classic O(n^3) assignment algorithm: subtract row/column potentials, then repeatedly find an augmenting path through zero-cost edges. This is the logic OR-Tools' `LinearSumAssignment` packages for you.

```python
def hungarian(cost):
    n = len(cost)
    u = [0] * (n + 1)          # row potentials
    v = [0] * (n + 1)          # column potentials
    p = [0] * (n + 1)          # p[j] = row assigned to column j
    for i in range(1, n + 1):
        p[0] = i
        j0 = 0
        minv = [float("inf")] * (n + 1)
        used = [False] * (n + 1)
        way = [0] * (n + 1)        # way[j] = previous column on the path
        while True:                       # grow an alternating tree
            used[j0] = True
            i0, delta, j1 = p[j0], float("inf"), -1
            for j in range(1, n + 1):
                if not used[j]:
                    cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
                    if cur < minv[j]:
                        minv[j], way[j] = cur, j0
                    if minv[j] < delta:
                        delta, j1 = minv[j], j
            for j in range(n + 1):        # reweight potentials by delta
                if used[j]:
                    u[p[j]] += delta
                    v[j] -= delta
                else:
                    minv[j] -= delta
            j0 = j1
            if p[j0] == 0:                # found a free column -> augment
                break
        while j0:                         # flip the augmenting path
            j1 = way[j0]
            p[j0] = p[j1]
            j0 = j1
    return p   # column -> row matching
```

### Modeling assignment with OR-Tools CP-SAT

In practice you rarely hand-roll Hungarian — you declare the model and let CP-SAT solve it, which also handles side constraints (quotas, exclusions) cleanly.

```python
from ortools.sat.python import cp_model

model = cp_model.CpModel()
x = {(w, t): model.NewBoolVar(f"x[{w},{t}]")
     for w in workers for t in tasks}

# Each task gets exactly one worker; each worker at most one task.
for t in tasks:
    model.AddExactlyOne(x[w, t] for w in workers)
for w in workers:
    model.AddAtMostOne(x[w, t] for t in tasks)

# Minimize total assignment cost.
model.Minimize(sum(cost[w][t] * x[w, t] for w in workers for t in tasks))

solver = cp_model.CpSolver()
solver.Solve(model)
```

### Gale–Shapley stable matching — the deferred-acceptance loop

When both sides have preferences (mentors/students, residents/hospitals), you want *stability*, not minimum cost. Each free proposer proposes down its list; receivers tentatively hold their best offer and reject the rest.

```python
def stable_match(prop_prefs, recv_prefs):
    free = list(prop_prefs)                 # proposers not yet matched
    nxt = {p: 0 for p in prop_prefs}        # index of next receiver to try
    rank = {r: {p: i for i, p in enumerate(prefs)}
            for r, prefs in recv_prefs.items()}
    held = {}                               # receiver -> tentatively held proposer
    while free:
        p = free.pop()
        r = prop_prefs[p][nxt[p]]
        nxt[p] += 1
        if r not in held:                   # receiver is free -> hold
            held[r] = p
        elif rank[r][p] < rank[r][held[r]]: # prefers new proposer -> swap
            free.append(held[r])
            held[r] = p
        else:
            free.append(p)                  # rejected -> try again later
    return {p: r for r, p in held.items()}
```

## Functional Use Cases

- Appointment scheduling.
- Delivery route planning.
- Worker/task assignment.
- Inventory or ad allocation.
- Packing/bin-packing.
- Ranking with constraints: diversity, fairness, quotas, freshness.
- Matching buyers/sellers, mentors/students, users/groups.

## The Lift

- Decision variables.
- Constraints.
- Objective function.
- Hard constraints vs soft penalties.
- Feasibility checks.
- Explanation of why a solution was chosen.

## Search Inside

`cp-sat`, `constraint`, `linear solver`, `integer programming`, `routing`, `assignment`, `scheduling`, `bin packing`, `objective`, `penalty`, `feasible`.

