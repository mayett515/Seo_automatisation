import { randomUUID } from "node:crypto";
import { Body, Controller, Get, Injectable, Module, Param, Post } from "@nestjs/common";
import {
  CreateLeadSchema,
  LeadSchema,
  PotentialReportSchema,
  QueueJobSchema,
  type CreateLeadInput,
  type Lead,
  type PotentialReport,
  type QueueJob
} from "@localseo/contracts";
import { QueueProducerService } from "../queue-producer.js";

@Injectable()
class LeadsService {
  constructor(private readonly queues: QueueProducerService) {}

  createLead(input: CreateLeadInput): Lead {
    return LeadSchema.parse({
      id: randomUUID(),
      ...input,
      status: "new",
      createdAt: new Date().toISOString()
    });
  }

  async queuePreAudit(leadId: string): Promise<QueueJob> {
    const jobId = randomUUID();
    const enqueued = await this.queues.enqueue({
      queueName: "pre-audit",
      jobName: "pre_audit",
      jobId,
      data: { leadId }
    });

    return QueueJobSchema.parse({
      jobId,
      leadId,
      type: "pre_audit",
      status: enqueued ? "queued" : "dry_run",
      inputRef: leadId,
      message: enqueued ? undefined : "Pre-audit queue is not configured. This is an explicit dry-run response.",
      createdAt: new Date().toISOString()
    });
  }

  getPotentialReport(leadId: string): PotentialReport {
    return PotentialReportSchema.parse({
      leadId,
      status: "draft",
      headline: "Local SEO potential report is queued",
      ranges: ["2-3 months", "6 months"]
    });
  }
}

@Controller("leads")
class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post()
  createLead(@Body() body: unknown) {
    const input = CreateLeadSchema.parse(body);
    return this.leads.createLead(input);
  }

  @Post(":id/start-pre-audit")
  startPreAudit(@Param("id") leadId: string) {
    return this.leads.queuePreAudit(leadId);
  }

  @Get(":id/potential-report")
  getPotentialReport(@Param("id") leadId: string) {
    return this.leads.getPotentialReport(leadId);
  }
}

@Module({
  controllers: [LeadsController],
  providers: [LeadsService]
})
export class LeadsModule {}
