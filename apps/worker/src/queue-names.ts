export const queueNames = [
  "pre-audit",
  "website-import",
  "local-analysis",
  "page-generation",
  "seo-qa",
  "deploy",
  "gsc-sync",
  "analytics",
  "report",
  "notifications"
] as const;

export type QueueName = (typeof queueNames)[number];

