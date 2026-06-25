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

@Injectable()
class LeadsService {
  createLead(input: CreateLeadInput): Lead {
    return LeadSchema.parse({
      id: randomUUID(),
      ...input,
      status: "new",
      createdAt: new Date().toISOString()
    });
  }

  queuePreAudit(leadId: string): QueueJob {
    return QueueJobSchema.parse({
      jobId: randomUUID(),
      leadId,
      type: "pre_audit",
      status: "queued",
      inputRef: leadId,
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
