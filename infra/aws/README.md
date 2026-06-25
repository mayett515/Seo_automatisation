# AWS Runtime Blueprint

Backend runtime default: AWS `eu-central-1`.

## Services

```text
ALB -> ECS Fargate service: apps/api
ECS Fargate services: apps/worker
RDS Postgres: product data and app auth data
ElastiCache Redis: BullMQ queues and worker state
S3: crawls, screenshots, generated builds, report artifacts
Secrets Manager: OAuth, Netlify, Better Auth, database, Redis secrets
CloudWatch: API logs, worker logs, job failures, deploy verification events
```

## Boundaries

- The React control panel deploys to Netlify and calls the API over HTTPS.
- Generated customer websites and previews deploy to Netlify.
- API services enqueue long-running work; workers perform provider calls.
- Deployment success requires verification worker checks after Netlify deploy.
- Preview URLs must stay `noindex`; sitemap only includes publish-ready live URLs.

