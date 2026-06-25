# DevOps And CI/CD

This is where you come to lift a proven way to automate the path from a git commit to a running workload, rather than reinventing the universal-but-unglamorous problems yourself: how do you describe a build once and run it identically on a laptop, a CI runner, and a cloud node? How do you reconcile declarative desired-state (the YAML in git) against the messy actual-state of a live cluster? How do you make pipelines deterministic, cacheable, and resumable instead of a pile of imperative shell scripts that drift over time? The repos below answer these with battle-tested code: GitOps reconcilers, IaC providers, container build graphs, and pipeline runners.

You won't fork a 200k-line monolith like Argo CD, but you'll happily lift its sync engine, diff logic, or health assessment — each a self-contained part. And the part travels across layers: Terraform provisions infrastructure and Flux deploys apps, yet both run the same engine intent — take a declared desired state, compute a diff against reality, and converge. Find that intent, take the module.

---

## 1. GitOps & Continuous Delivery

These tools watch a git repository (the single source of truth) and continuously reconcile cluster state to match. The reconciliation loop, drift detection, and ordered sync are the parts worth lifting.

### GitOps Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [argoproj/argo-cd](https://github.com/argoproj/argo-cd) | Declarative GitOps continuous delivery for Kubernetes. | Steal the controller reconciliation loop, the three-way diff between desired/live/last-applied state, sync waves and hooks (PreSync/Sync/PostSync), and resource health assessment. |
| [fluxcd/flux2](https://github.com/fluxcd/flux2) | GitOps toolkit built from composable Kubernetes controllers. | Steal how it splits into source-controller, kustomize-controller, and helm-controller — each a single-responsibility reconciler. Lift OCI artifact source handling and dependency ordering via `dependsOn`. |
| [woodpecker-ci/woodpecker](https://github.com/woodpecker-ci/woodpecker) | Lightweight, container-native CI engine (fork of Drone). | Steal the pipeline AST compiler, the agent/server gRPC protocol, and how each step runs in an isolated container with a shared workspace volume. |

---

## 2. Pipelines, Build Engines & Local Runners

These let you define a build/test/deploy graph as code, cache intermediate results, and run the same pipeline locally and in CI — lift the execution model whole or in pieces.

### Pipeline Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [dagger/dagger](https://github.com/dagger/dagger) | Programmable CI/CD engine with content-addressed caching. | Steal the DAG execution model (`dagql`), how operations become BuildKit LLB graphs, and how typed functions in 8 SDK languages compile to the same engine. |
| [nektos/act](https://github.com/nektos/act) | Run GitHub Actions workflows locally in Docker. | Steal how it parses `.github/workflows/*.yml`, builds a runner container per job, and emulates the GitHub Actions runtime (contexts, expressions, matrix). |
| [actions/toolkit](https://github.com/actions/toolkit) | Official JS/TS packages for authoring GitHub Actions. | Steal `@actions/core` (inputs, outputs, masking secrets), `@actions/exec`, and `@actions/cache` for the Action authoring contract. |

---

## 3. Infrastructure as Code

These provision and manage cloud resources declaratively, with a state file as the reconciliation anchor and a provider plugin architecture — both patterns worth taking.

### IaC Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [hashicorp/terraform](https://github.com/hashicorp/terraform) | Declarative infrastructure provisioning with a provider plugin model. | Steal the plan/apply lifecycle, the dependency graph walker, the state file as desired-vs-actual anchor, and the gRPC provider protocol (`plugin/`). |
| [pulumi/pulumi](https://github.com/pulumi/pulumi) | IaC using real programming languages instead of HCL. | Steal the resource-graph deployment engine (`pkg/engine`), how the language host serializes resource registrations, and how it diffs against a state snapshot. |

---

## 4. The Anatomy of Large Repos: Decomposing "Stealable" Modules

A CD platform looks monolithic, but the engine inside is a handful of reusable ideas: a reconcile loop, a diff function, a health checker, a cache key. Break the repo down by intent and lift the module.

### Decomposed Module Index

| Intent | Product / Repo | Target Module / Directory | What to steal |
| --- | --- | --- | --- |
| **GitOps Reconcile Loop** | Argo CD | [`controller/`](https://github.com/argoproj/argo-cd/tree/master/controller) | How an application controller watches CRDs, computes a sync status, and queues reconciliations with rate limiting and backoff. |
| **Three-Way Diff Engine** | Argo CD | [`util/`](https://github.com/argoproj/argo-cd/tree/master/util) | How desired (git), live (cluster), and last-applied state are normalized and diffed to detect drift while ignoring server-managed fields. |
| **Reusable GitOps Engine** | Argo CD | [`gitops-engine`](https://github.com/argoproj/gitops-engine) | The sync + diff + health logic extracted into a standalone Go library — literally a pre-decomposed stealable module. |
| **Composable Reconcilers** | Flux | [`internal/`](https://github.com/fluxcd/flux2/tree/main/internal) | How a CD system is split into independent source/kustomize/helm controllers communicating through Kubernetes CRD events. |
| **DAG Build Execution** | Dagger | [`dagql/`](https://github.com/dagger/dagger/tree/main/dagql) | How a content-addressed, cached query graph models build steps so identical work is never re-run. |
| **Workflow Parser & Runtime** | act | [`pkg/runner`](https://github.com/nektos/act/tree/master/pkg/runner) | How GitHub Actions YAML, expression contexts, and matrix expansion are parsed and executed against Docker containers. |
| **Action Authoring SDK** | actions/toolkit | [`packages/core`](https://github.com/actions/toolkit/tree/main/packages/core) | The full input/output/secret-masking contract every GitHub Action relies on, in ~500 lines of TypeScript. |
| **State-Diff Apply Lifecycle** | Terraform | [`internal/terraform`](https://github.com/hashicorp/terraform/tree/main/internal/terraform) | How a dependency graph is walked to produce a plan, then applied transactionally with state locking. |

---

## Functional Patterns

- **Declarative Reconciliation**: Never issue imperative `kubectl apply` from a script. Instead declare desired state in git, and a controller loops forever computing `desired - live = diff` and converging. The loop is idempotent and self-healing.
- **Content-Addressed Caching**: Build steps are keyed by a hash of their inputs (base image + files + args). If the key is unchanged, the cached output is reused. This is how Dagger and BuildKit make pipelines fast and deterministic.
- **Provider Plugin Architecture**: The core engine (Terraform, Pulumi) knows nothing about specific clouds. Providers are out-of-process plugins speaking a gRPC contract, so the core stays small and the ecosystem stays open.
- **Ordered Sync via Hooks/Waves**: Resources rarely apply in arbitrary order. Sync waves and lifecycle hooks (PreSync runs a migration Job before the app rolls out) encode ordering declaratively.

## Stealable Snippets

### A reusable composite GitHub Actions workflow

A composite action bundles multiple steps into one reusable unit referenced by other workflows — the cleanest way to DRY up CI.

```yaml
# .github/actions/setup-and-build/action.yml
name: "Setup and Build"
description: "Checkout, install deps with cache, and build"
inputs:
  node-version:
    description: "Node version to install"
    required: false
    default: "20"
runs:
  using: "composite"
  steps:
    - uses: actions/setup-node@v4
      with:
        node-version: ${{ inputs.node-version }}
        cache: "npm"
    - name: Install dependencies
      shell: bash
      run: npm ci
    - name: Build
      shell: bash
      run: npm run build
```

```yaml
# .github/workflows/ci.yml  — consuming the composite action
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-and-build
        with:
          node-version: "20"
```

### A multi-stage Dockerfile that ships a tiny final image

The builder stage compiles with the full toolchain; the runtime stage copies only the artifact. The result is a small, attack-surface-minimal image.

```dockerfile
# ---- builder ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Run as an unprivileged user
USER node
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### A reusable Terraform module with typed inputs and outputs

Modules are the unit of reuse in Terraform: parameterize with `variable`, expose results with `output`, and call them anywhere.

```hcl
# modules/s3-bucket/variables.tf
variable "name" {
  type        = string
  description = "Globally unique bucket name"
}
variable "versioning" {
  type    = bool
  default = true
}

# modules/s3-bucket/main.tf
resource "aws_s3_bucket" "this" {
  bucket = var.name
}
resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id
  versioning_configuration {
    status = var.versioning ? "Enabled" : "Disabled"
  }
}

# modules/s3-bucket/outputs.tf
output "arn" {
  value = aws_s3_bucket.this.arn
}

# root module — calling it
module "assets" {
  source     = "./modules/s3-bucket"
  name       = "my-app-assets"
  versioning = true
}
```

### A GitOps sync hook (Argo CD resource hook)

Annotations turn an ordinary Kubernetes Job into a lifecycle hook — here a DB migration that runs *before* the new app version syncs, and is deleted on success.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migrate
  annotations:
    argocd.argoproj.io/hook: PreSync
    argocd.argoproj.io/hook-delete-policy: HookSucceeded
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: my-app:latest
          command: ["npm", "run", "migrate:deploy"]
```

## The Lift

- **The Reconcile Loop**: A generic `Reconcile(ctx) -> Result{Requeue, RequeueAfter}` signature plus rate-limited work queue, reusable for any "watch resource, converge to desired state" problem — not just Kubernetes.
- **Build Cache Keys**: How to hash a step's full input set into a deterministic key so identical work is skipped across machines and runs.
- **Provider Plugin Contract**: The gRPC interface (plan/apply/diff) that lets a small core orchestrate an unbounded ecosystem of out-of-process plugins.
- **Lifecycle Hook Ordering**: The PreSync/Sync/PostSync (and sync-wave) model for declaring "run this before/after that" without imperative scripting.

## Search Inside

`Reconcile`, `desiredState`, `liveState`, `diff`, `SyncWave`, `hook`, `PreSync`, `PostSync`, `workqueue`, `RequeueAfter`, `LLB`, `cacheKey`, `provider`, `plan`, `apply`, `state.lock`, `composite`, `runs-on`, `FROM ... AS builder`, `--from=builder`.
