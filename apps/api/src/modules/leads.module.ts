import { randomUUID } from "node:crypto";
import { BadRequestException, Body, Controller, Get, Inject, Injectable, Module, Param, Post } from "@nestjs/common";
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
export class LeadsService {
  createLead(input: CreateLeadInput): Lead {
    return LeadSchema.parse({
      id: randomUUID(),
      ...input,
      status: "new",
      createdAt: new Date().toISOString()
    });
  }

  queuePreAudit(leadId: string): QueueJob {
    // `pre-audit` has no worker handler, so admitting it to the queue would
    // enqueue a job nothing can process. Fail closed instead: answer honestly
    // with a dry-run receipt and never write the job. The public pre-sales
    // capture (`POST /leads`) is unaffected. See pre-audit.lane.md for the
    // recorded reason and trigger.
    return QueueJobSchema.parse({
      jobId: randomUUID(),
      leadId,
      type: "pre_audit",
      status: "dry_run",
      inputRef: leadId,
      message: "Pre-audit worker is not built. This is an explicit dry-run response.",
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
  constructor(@Inject(LeadsService) private readonly leads: LeadsService) {}

  @Post()
  createLead(@Body() body: unknown) {
    const parsed = CreateLeadSchema.safeParse(body ?? {});

    if (!parsed.success) {
      throw new BadRequestException("Lead creation requires a valid websiteUrl and optional business details.");
    }

    return this.leads.createLead(parsed.data);
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
