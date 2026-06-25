import type { Job } from "bullmq";
import { agentDescriptors, mastraWorkflows } from "@localseo/ai";

export async function handleJob(job: Job): Promise<Record<string, unknown>> {
  return {
    jobId: job.id,
    queueName: job.queueName,
    processedAt: new Date().toISOString(),
    mastraWorkflows,
    availableAgents: agentDescriptors.map((agent) => agent.name)
  };
}

